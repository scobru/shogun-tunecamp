# TuneCamp Server Guide

TuneCamp is a full-featured Node.js/Express server for self-hosting your music, streaming via the Subsonic API, and federating with ActivityPub.

## Installation

### Using Docker (Recommended)

```bash
docker run -d \
  -p 1970:1970 \
  -v /path/to/music:/music \
  -v tunecamp_data:/data \
  ghcr.io/scobru/tunecamp:latest
```

### Using Node.js

```bash
npm install -g tunecamp
tunecamp server ./my-music --port 1970
```

## Features

- **Subsonic API**: Fully compatible with clients like DSub, Symfonium, etc.
- **ActivityPub**: Integrates with the Fediverse.
- **Web UI**: Modern dashboard to manage your tracks, albums, and settings.
- **Waveform Generation**: Generates and serves waveform SVGs for streaming.

## Configuration (Environment Variables)

The server can be configured using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `TUNECAMP_PORT` | Port the server listens on | `1970` |
| `TUNECAMP_MUSIC_DIR` | Directory containing your music files | `./music` |
| `TUNECAMP_DB_PATH` | Path to the SQLite database | `./tunecamp.db` |
| `TUNECAMP_JWT_SECRET` | Secret key for JWT sessions | *(Generated if missing)* |
| `TUNECAMP_CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `[]` |
| `TUNECAMP_PUBLIC_URL` | Public URL for federation (e.g., `https://mysite.com`) | `null` |
| `TUNECAMP_SITE_NAME` | Name of your site for community discovery | `null` |
| `TUNECAMP_GUN_PEERS` | Comma-separated list of GunDB relay peers | *(Default relay list)* |

## Management

Use the Tunecamp CLI to manage your server:

```bash
# Start the server
tunecamp server ./music

# Backup the database
tunecamp backup ./backups

# Restore from a backup
tunecamp restore ./backups/tunecamp_2024.db
```
