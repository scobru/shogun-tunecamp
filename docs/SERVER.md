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

| `TUNECAMP_PORT` | Port the server listens on | `1970` |
| `TUNECAMP_MUSIC_DIR` | Directory containing your music files | `./music` |
| `TUNECAMP_DB_PATH` | Path to the SQLite database | `./tunecamp.db` |
| `TUNECAMP_JWT_SECRET` | Secret key for JWT sessions | _(Generated if missing)_ |
| `TUNECAMP_CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `[]` |
| `TUNECAMP_PUBLIC_URL` | Public URL for community discovery (e.g., `https://mysite.com`) | `null` |
| `TUNECAMP_SITE_NAME` | Name of your site for community discovery | `null` |
| `TUNECAMP_GUN_PEERS` | Comma-separated list of GunDB relay peers | _(Default relay list)_ |
| `TUNECAMP_OWNER_ADDRESS` | Ethereum address for artist identity | `null` |
| `TUNECAMP_RPC_URL` | Blockchain RPC URL (Base Mainnet) | `https://mainnet.base.org` |
| `TUNECAMP_CURRENCY_CONTRACT` | Currency contract address (e.g. USDC on Base) | `0x833...` |

## Persistent Data (Docker)

To persist your library and settings when using Docker, you **must** mount volumes:

- `/music`: Your music files (read-only recommended).
- `/data`: Database and configuration files.
- `/radata`: GunDB graph data.

Example Docker Compose volume mapping:

```yaml
volumes:
  - /path/to/your/music:/music:ro
  - tunecamp_data:/data
  - tunecamp_radata:/radata
```

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
