# CLAUDE.md

Guidelines for Claude Code when working with this repository.

## Project

Skinnydip — Poolsuite FM streaming proxy for Sonos and network audio devices.

See [README.md](README.md) for usage and [ARCHITECTURE.md](ARCHITECTURE.md) for technical details.

## Commands

```bash
# Development (with live reload)
docker compose -f docker-compose.dev.yml up --build

# Production
docker compose up -d
```

## Code Style

- Node.js 20 with native fetch (no axios/node-fetch needed)
- Express for HTTP
- Minimal dependencies
- No TypeScript
