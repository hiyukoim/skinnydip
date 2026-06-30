const { spawn } = require('child_process');
const EventEmitter = require('events');

const ICY_META_INTERVAL = 16000;
const ICY_METADATA_BLOCK_SIZE = 16;
const ICY_MAX_METADATA_BLOCKS = 255;
const ICY_MAX_METADATA_BYTES = ICY_METADATA_BLOCK_SIZE * ICY_MAX_METADATA_BLOCKS;
const ICY_STREAM_TITLE_PREFIX = "StreamTitle='";
const ICY_STREAM_TITLE_SUFFIX = "';";

function sanitizeIcyText(value) {
  return String(value || '')
    .replace(/['\r\n\0]/g, '')
    .trim();
}

function truncateUtf8Payload(title) {
  let truncated = title;

  while (
    Buffer.byteLength(`${ICY_STREAM_TITLE_PREFIX}${truncated}${ICY_STREAM_TITLE_SUFFIX}`, 'utf8') > ICY_MAX_METADATA_BYTES &&
    truncated.length > 0
  ) {
    truncated = truncated.slice(0, -1);
  }

  return truncated;
}

function formatIcyTitle(track) {
  if (!track?.title) return '';

  const artist = sanitizeIcyText(track.artist);
  const title = sanitizeIcyText(track.title);
  if (!title) return '';

  return truncateUtf8Payload(artist ? `${artist} - ${title}` : title);
}

function createIcyMetadataBlock(track, lastTitle) {
  const title = formatIcyTitle(track);
  if (!title) {
    return { block: Buffer.from([0]), title: '' };
  }

  if (title === lastTitle) {
    return { block: Buffer.from([0]), title: lastTitle };
  }

  // ICY StreamTitle payloads are UTF-8.
  const payload = Buffer.from(`${ICY_STREAM_TITLE_PREFIX}${title}${ICY_STREAM_TITLE_SUFFIX}`, 'utf8');
  const blockCount = Math.ceil(payload.length / ICY_METADATA_BLOCK_SIZE);
  const block = Buffer.alloc(1 + (blockCount * ICY_METADATA_BLOCK_SIZE));
  block[0] = blockCount;
  payload.copy(block, 1);
  return { block, title };
}

class StreamClient {
  constructor(res, options = {}) {
    this.res = res;
    this.icyMetadata = options.icyMetadata === true;
    this.metaint = options.metaint || ICY_META_INTERVAL;
    this.bytesUntilMetadata = this.metaint;
    this.lastTitle = null;
  }

  get writableEnded() {
    return this.res.writableEnded;
  }

  write(chunk, getCurrentTrack) {
    if (!this.icyMetadata) {
      this.res.write(chunk);
      return;
    }

    let offset = 0;
    while (offset < chunk.length) {
      const bytesToWrite = Math.min(this.bytesUntilMetadata, chunk.length - offset);
      this.res.write(chunk.subarray(offset, offset + bytesToWrite));
      offset += bytesToWrite;
      this.bytesUntilMetadata -= bytesToWrite;

      if (this.bytesUntilMetadata === 0) {
        const { block, title } = createIcyMetadataBlock(getCurrentTrack(), this.lastTitle);
        this.lastTitle = title;
        this.res.write(block);
        this.bytesUntilMetadata = this.metaint;
      }
    }
  }
}

class Streamer extends EventEmitter {
  constructor(poolsuiteClient) {
    super();
    this.poolsuite = poolsuiteClient;
    this.clients = new Set();
    this.ffmpegProcess = null;
    this.isStreaming = false;
  }

  async start() {
    if (this.isStreaming) return;
    this.isStreaming = true;
    console.log('Streamer starting...');
    this.playNextTrack();
  }

  stop() {
    this.isStreaming = false;
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = null;
    }
  }

  addClient(res, options = {}) {
    const client = new StreamClient(res, options);
    this.clients.add(client);
    console.log(`Client connected. Total clients: ${this.clients.size}`);

    res.on('close', () => {
      this.clients.delete(client);
      console.log(`Client disconnected. Total clients: ${this.clients.size}`);
    });

    if (!this.isStreaming) {
      this.start();
    }
  }

  broadcast(chunk) {
    for (const client of this.clients) {
      if (!client.writableEnded) {
        client.write(chunk, () => this.poolsuite.getCurrentTrack());
      }
    }
  }

  async getAudioUrl(soundcloudUrl) {
    return new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio',
        '--no-playlist',
        '--get-url',
        soundcloudUrl
      ]);

      let url = '';
      let stderr = '';

      ytdlp.stdout.on('data', (data) => {
        url += data.toString();
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code === 0 && url.trim()) {
          resolve(url.trim());
        } else {
          reject(new Error(`yt-dlp failed: ${stderr}`));
        }
      });

      ytdlp.on('error', reject);
    });
  }

  async playNextTrack() {
    if (!this.isStreaming) return;

    const track = this.poolsuite.getNextTrack();
    if (!track) {
      console.error('No track available');
      setTimeout(() => this.playNextTrack(), 5000);
      return;
    }

    this.emit('trackChange', track);
    console.log(`Streaming: ${track.artist} - ${track.title}`);

    try {
      const audioUrl = await this.getAudioUrl(track.url);
      await this.streamWithFfmpeg(audioUrl);
    } catch (err) {
      console.error(`Failed to play track: ${err.message}`);
    }

    // Move to next track
    if (this.isStreaming) {
      setImmediate(() => this.playNextTrack());
    }
  }

  streamWithFfmpeg(audioUrl) {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'warning',
        '-i', audioUrl,
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-write_xing', '0',
        '-id3v2_version', '0',
        '-f', 'mp3',
        'pipe:1'
      ]);

      this.ffmpegProcess = ffmpeg;

      ffmpeg.stdout.on('data', (chunk) => {
        this.broadcast(chunk);
      });

      ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && (msg.includes('Error') || msg.includes('error'))) {
          console.error('ffmpeg:', msg);
        }
      });

      ffmpeg.on('close', (code) => {
        console.log(`Track finished (code: ${code})`);
        this.ffmpegProcess = null;
        resolve();
      });

      ffmpeg.on('error', (err) => {
        console.error('ffmpeg spawn error:', err.message);
        this.ffmpegProcess = null;
        resolve();
      });
    });
  }
}

module.exports = Streamer;
module.exports.ICY_META_INTERVAL = ICY_META_INTERVAL;
module.exports.createIcyMetadataBlock = createIcyMetadataBlock;
module.exports.formatIcyTitle = formatIcyTitle;
