<div align="center">
  <img src="./logo.svg" alt="Tunecamp Logo" width="150" height="150">
  <h1>Tunecamp</h1>
  <p><strong>A decentralized music platform for independent artists and labels.</strong></p>
</div>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Streaming platforms take significant cuts from artists and lock their communities into walled gardens. Tunecamp allows you to host your own music with a beautiful web interface, fully compatible with existing Subsonic mobile apps. It connects you to the Fediverse (via ActivityPub) and creates a global, decentralized music discovery network (via GunDB)—giving artists ownership of their distribution without sacrificing reach.

## Quick Start

The fastest way to run Tunecamp is using Docker Compose.

```bash
# 1. Start the server in the background
docker-compose up -d

# 2. Access the dashboard
# Open http://localhost:1970 in your browser
```

> **Note**: Edit `docker-compose.yml` to set your desired music and data volume paths before running.

## Features

- 🎵 **Audio-first**: Automatically reads metadata and generates waveforms from your audio files.
- 🖥️ **Streaming Server**: Personal streaming server with a modern web interface.
- 🎨 **Customizable**: Responsive UI with theme support.
- 🔐 **Decentralized**: GunDB integration for comments, stats, and unlock codes.
- 📡 **Federation**: ActivityPub support to connect with the Fediverse (Mastodon, Funkwhale, etc.).
- 🔊 **Subsonic/OpenSubsonic API**: Full compatibility with mobile apps (DSub, Symfonium, Tempo, Substreamer, Amuse, etc.).
- 📦 **Docker Ready**: Easy deployment with Docker and Docker Compose.

## Installation & Setup

### Using Node.js (Development)

**Prerequisites**: Node.js 18+, npm 9+

```bash
# Clone the repository
git clone https://github.com/your-username/tunecamp.git
cd tunecamp

# Install dependencies and build backend
npm install
npm run build

# Install frontend dependencies
cd webapp
npm install
cd ..

# Start the development server
npm run dev &
```

### Configuration

Configuration is managed via environment variables (or an `.env` file).

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the server will listen on. | `1970` |
| `TUNECAMP_SITE_NAME` | The name of your Tunecamp instance. | `My TuneCamp Server` |
| `TUNECAMP_PUBLIC_URL` | The public-facing URL of your server (required for ActivityPub). | - |
| `TUNECAMP_GUN_PEERS` | Comma-separated list of GunDB relay peers. | - |
| `VITE_GUN_PEERS` | (Frontend) Same as `TUNECAMP_GUN_PEERS`. | - |
| `TUNECAMP_RELAY_URL` | ActivityPub relay URL for broadcasting. | - |

> For DeFi and Payments configuration (Base Network), see the full Configuration Guide.

## API & Integrations

### Subsonic API

Tunecamp exposes a full Subsonic API (version 1.16.1) at `/rest`. This allows you to use your Tunecamp library with major mobile clients like DSub, Symfonium, and Tempo.

See the [Subsonic API Reference →](./docs/SUBSONIC_API.md)

### REST API

The platform is driven by a REST JSON API under `/api/v1/`.

See the [OpenAPI Reference →](./docs/openapi.yml)

### Federation

Tunecamp is compatible with Funkwhale and Mastodon via ActivityPub.

See the [Federation Guide →](./docs/FEDERATION.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started.

## License

MIT License - see LICENSE file for details.
