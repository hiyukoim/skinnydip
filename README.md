# 🌴 Skinnydip

```
┌───────────────────────────────────────┐
│  ○ ○ ○           Skinnydip            │
├───────────────────────────────────────┤
│                                       │
│            S K I N N Y D I P          │
│       ultra-summer streaming radio    │
│                                       │
│  ▶ Poolsuite FM (Default)  274 tracks │
│  ▶ Friday Nite Heat        118 tracks │
│  ▶ Tokyo Disco              58 tracks │
│  ▶ Hangover Club            76 tracks │
│                ...                    │
└───────────────────────────────────────┘
```

**Poolsuite FM streaming radio for Sonos and network audio players.**

A self-hosted proxy that turns [Poolsuite FM](https://poolsuite.net) into standard HTTP audio streams you can play anywhere.

## Docker

### Docker Compose (recommended)

```yaml
services:
  skinnydip:
    image: ghcr.io/maddox/skinnydip:latest
    container_name: skinnydip
    ports:
      - "3000:3000"
    restart: unless-stopped
```

```bash
docker compose up -d
```

### Docker Run

```bash
docker run -d \
  --name skinnydip \
  --restart unless-stopped \
  -p 3000:3000 \
  ghcr.io/maddox/skinnydip:latest
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `-p 3000:3000` | Web UI and stream port |

The container is stateless—no volumes needed.

## Usage

Open http://localhost:3000 to see the web UI, or use any stream URL directly in VLC, Sonos, or any audio player.

### Channels

| Channel | Stream URL |
|---------|-----------|
| Poolsuite FM (Default) | `/stream/default` |
| Friday Nite Heat | `/stream/friday` |
| Balearic Sundown | `/stream/balearic-sundown` |
| Indie Summer | `/stream/indie-summer` |
| Hangover Club | `/stream/hangover` |
| Tokyo Disco | `/stream/tokyo` |
| Latest 20 | `/stream/latest_20` |

### Adding to Sonos

1. Go to [TuneIn](https://tunein.com) and sign in
2. Add a custom URL: `http://<your-server-ip>:3000/stream/default`
3. In the Sonos app: TuneIn → My Radio Stations

## API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Web UI |
| `GET /channels` | List channels (JSON) |
| `GET /now-playing/:slug` | Current track |
| `GET /health` | Server status |

---

*Powered by [Poolsuite](https://poolsuite.net) ☼*
