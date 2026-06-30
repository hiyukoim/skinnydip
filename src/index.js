const express = require('express');
const fs = require('fs');
const path = require('path');
const PoolsuiteClient = require('./poolsuite');
const Streamer = require('./streamer');
const { configureStreamResponse } = require('./stream-response');

const app = express();
const PORT = process.env.PORT || 3000;

// One poolsuite client to fetch all playlists
const poolsuite = new PoolsuiteClient();

// One streamer per channel
const streamers = new Map();

let startTime = null;

function getOrCreateStreamer(channelSlug) {
  if (!streamers.has(channelSlug)) {
    const playlist = poolsuite.playlists.find(p => p.slug === channelSlug);
    if (!playlist) return null;

    const channelClient = {
      tracks: playlist.tracks,
      queue: [],
      currentTrack: null,
      shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      },
      initializeQueue() {
        this.queue = this.shuffle(this.tracks);
      },
      getNextTrack() {
        if (this.queue.length === 0) {
          this.queue = this.shuffle(this.tracks);
        }
        this.currentTrack = this.queue.shift();
        return this.currentTrack;
      },
      getCurrentTrack() {
        return this.currentTrack;
      },
      getQueueLength() {
        return this.queue.length;
      }
    };

    channelClient.initializeQueue();
    const streamer = new Streamer(channelClient);
    streamer.channelName = playlist.name;
    streamer.channelSlug = channelSlug;

    streamer.on('trackChange', (track) => {
      console.log(`[${playlist.name}] Now playing: ${track.artist} - ${track.title}`);
    });

    streamers.set(channelSlug, streamer);
  }
  return streamers.get(channelSlug);
}

// Health check endpoint
app.get('/health', (req, res) => {
  const activeStreamers = [];
  for (const [slug, streamer] of streamers) {
    if (streamer.clients.size > 0) {
      activeStreamers.push({
        channel: slug,
        clients: streamer.clients.size
      });
    }
  }

  res.json({
    status: 'ok',
    uptime: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
    channels: poolsuite.playlists.length,
    activeStreams: activeStreamers
  });
});

// List available channels
app.get('/channels', (req, res) => {
  res.json({
    channels: poolsuite.getChannels().map(c => ({
      ...c,
      streamUrl: `/stream/${c.slug}`
    }))
  });
});

// Now playing for a specific channel
app.get('/now-playing/:slug', (req, res) => {
  const { slug } = req.params;
  const streamer = streamers.get(slug);

  if (!streamer || !streamer.poolsuite.getCurrentTrack()) {
    return res.status(404).json({ error: 'Channel not playing or not found' });
  }

  const track = streamer.poolsuite.getCurrentTrack();
  res.json({
    channel: { name: streamer.channelName, slug: streamer.channelSlug },
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      artwork: track.artwork,
      duration: track.duration
    }
  });
});

// Stream endpoint for each channel
app.get('/stream/:slug', (req, res) => {
  const { slug } = req.params;
  const streamer = getOrCreateStreamer(slug);

  if (!streamer) {
    return res.status(404).json({
      error: 'Channel not found',
      available: poolsuite.getChannels().map(c => c.slug)
    });
  }

  streamer.addClient(res, configureStreamResponse(req, res, streamer));
});

// Default stream redirects to /stream/default
app.get('/stream', (req, res) => {
  res.redirect('/stream/default');
});

// Root endpoint - HTML landing page
app.get('/', (req, res) => {
  // Check if client wants JSON
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    const channels = poolsuite.getChannels();
    return res.json({
      name: 'Skinnydip',
      endpoints: {
        streams: channels.map(c => ({
          name: c.name,
          url: `/stream/${c.slug}`,
          tracks: c.trackCount
        })),
        channels: '/channels - List all channels',
        nowPlaying: '/now-playing/:slug - Current track for channel',
        health: '/health - Server health'
      },
      usage: 'Open any /stream/:slug URL in VLC or audio player'
    });
  }

  // Serve HTML page
  const templatePath = path.join(__dirname, 'views', 'index.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const channels = poolsuite.getChannels();
  const channelHtml = channels.map(c => `
    <li class="channel-item">
      <a href="/stream/${c.slug}" class="channel-link">
        <div class="channel-name"><span class="play-icon"></span>${c.name}</div>
        <div class="channel-meta">
          <span>${c.trackCount} tracks · ${c.durationHours} hrs</span>
          <span>/stream/${c.slug}</span>
        </div>
      </a>
    </li>
  `).join('');

  html = html.replace('{{CHANNELS}}', channelHtml);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

async function initialize() {
  console.log('Skinnydip starting...');

  try {
    await poolsuite.fetchTracks();

    if (poolsuite.playlists.length === 0) {
      throw new Error('No playlists found from API');
    }

    startTime = Date.now();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
      console.log('');
      console.log('Available streams:');
      for (const channel of poolsuite.getChannels()) {
        console.log(`  ${channel.name}: http://localhost:${PORT}/stream/${channel.slug}`);
      }
    });

  } catch (err) {
    console.error('Failed to initialize:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  for (const streamer of streamers.values()) {
    streamer.stop();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  for (const streamer of streamers.values()) {
    streamer.stop();
  }
  process.exit(0);
});

initialize();
