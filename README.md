<img src="./logo.svg" alt="Tunecamp" width="200" height="200" style="display: block; margin-bottom: 20px; margin-top: 20px; align-items: center; justify-content: center; margin-left: auto; margin-right: auto;">

# Tunecamp

A decentralized music platform for independent artists and labels.

Tunecamp is a self-hosted music streaming server with federation, user management, and Subsonic API support. It allows artists to host their own music while connecting with the broader Fediverse.

Inspired by [Faircamp](https://simonrepp.com/faircamp/).

## Features

- 🎵 **Audio-first**: Automatically reads metadata and generates waveforms from your audio files.
- 🖥️ **Streaming Server**: Personal streaming server with a modern web interface.
- 🎨 **Customizable**: Responsive UI with theme support.
- 🔐 **Decentralized**: GunDB integration for comments, stats, and unlock codes.
- 📡 **Federation**: ActivityPub support to connect with the Fediverse (Mastodon, etc.).
- 🔊 **Subsonic API**: Compatible with mobile apps like DSub, Symfonium, and Amuse.
- 📦 **Docker Ready**: Easy deployment with Docker and Docker Compose.

## Quick Start

The easiest way to run Tunecamp is using Docker.

1.  **Run with Docker Compose (Recommended):**

    ```bash
    docker-compose up -d
    ```

    _Make sure to edit `docker-compose.yml` to set your music and data volumes._

2.  **Run with Docker CLI:**

    ```bash
    docker run -d \
      -p 1970:1970 \
      -v /path/to/music:/music \
      -v tunecamp_data:/data \
      ghcr.io/scobru/tunecamp:latest
    ```

3.  **Access the Dashboard:**
    Open `http://localhost:1970` in your browser.

👉 **[Read the Full Server Guide](./docs/SERVER.md)** for installation details, environment variables, and administration.

## CLI Commands

If running via Node.js:

- `tunecamp server [music-dir]`: Start the music server instance.
- `tunecamp backup [target-dir]`: Backup the database.
- `tunecamp restore <backup-file>`: Restore the database from a backup.

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start in development mode
npm run dev
```

### Frontend Development

The frontend is located in the `webapp/` directory.

```bash
cd webapp
npm install
npm run dev
```

## Documentation

- [Server Instance](./docs/SERVER.md)
  - Installation (Docker/Node)
  - Configuration (Environment Variables)
  - Features (Subsonic, ActivityPub)
- [Media Library](./docs/MEDIA_LIBRARY.md)
- [Network & Federation](./docs/NETWORK.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.
