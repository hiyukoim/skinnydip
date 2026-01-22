const { spawn } = require('child_process');
const EventEmitter = require('events');

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

  addClient(res) {
    this.clients.add(res);
    console.log(`Client connected. Total clients: ${this.clients.size}`);

    res.on('close', () => {
      this.clients.delete(res);
      console.log(`Client disconnected. Total clients: ${this.clients.size}`);
    });

    if (!this.isStreaming) {
      this.start();
    }
  }

  broadcast(chunk) {
    for (const client of this.clients) {
      if (!client.writableEnded) {
        client.write(chunk);
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
