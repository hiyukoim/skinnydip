# Architecture

## How It Works

```
┌──────────┐     HTTP/MP3      ┌──────────────┐    yt-dlp    ┌────────────┐
│  Sonos   │◄──────────────────│   Skinnydip  │◄─────────────│ SoundCloud │
│  VLC     │    128kbps stream │   (Express)  │    extract   │   (audio)  │
│  Browser │                   │   + ffmpeg   │              │            │
└──────────┘                   └──────┬───────┘              └────────────┘
                                      │
                                      ▼
                               ┌─────────────┐
                               │ Poolsuite   │
                               │ API         │
                               │ (playlists) │
                               └─────────────┘
```

1. **Startup**: Fetches all playlists from the Poolsuite API
2. **On connect**: Creates a streamer for the requested channel (if not already running)
3. **Streaming**: Uses `yt-dlp` to extract audio URLs from SoundCloud, pipes through `ffmpeg` to transcode to 128kbps MP3
4. **Playback**: Shuffles through the channel's tracks continuously

## File Structure

```
├── src/
│   ├── index.js        # Express server, routes, channel management
│   ├── poolsuite.js    # Poolsuite API client
│   ├── streamer.js     # yt-dlp + ffmpeg streaming logic
│   └── views/
│       └── index.html  # Landing page template
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Tech Stack

- **Node.js 20** — Runtime (with native fetch)
- **Express** — HTTP server
- **ffmpeg** — Audio transcoding to MP3
- **yt-dlp** — SoundCloud audio extraction

## Key Design Decisions

**One streamer per channel**: Each channel gets its own independent streamer instance, created on-demand when the first client connects. Multiple clients on the same channel share the stream.

**No storage**: Audio is streamed in real-time from SoundCloud through ffmpeg. Nothing is cached to disk.

**Shuffle mode**: Each channel shuffles its playlist independently. There's no global sync—each listener gets a randomized experience (same as the official Poolsuite FM site).

## Development

```bash
# Run with live reload (source mounted as volume)
docker compose -f docker-compose.dev.yml up --build

# View logs
docker compose -f docker-compose.dev.yml logs -f

# Test a stream
curl http://localhost:3000/stream/default | ffplay -
vlc http://localhost:3000/stream/default
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `production` | Node environment |
