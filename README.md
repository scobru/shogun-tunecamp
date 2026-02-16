<img src="./logo.svg" alt="Tunecamp" width="200" height="200" style="display: block; margin-bottom: 20px; margin-top: 20px; align-items: center; justify-content: center; margin-left: auto; margin-right: auto;"> 

# Tunecamp

A modern, dual-mode music platform for independent artists and labels.

**Tunecamp operates in two modes:**
1.  **Static Site Generator**: Create beautiful, fast static websites for your music catalog without a database.
2.  **Music Server**: Run a self-hosted streaming server with Subsonic API support, federation, and user management.

Inspired by [Faircamp](https://simonrepp.com/faircamp/).

## Features

- 🎵 **Audio-first**: Automatically reads metadata from your audio files.
- 📦 **Static Mode**: Generate pure HTML/CSS sites deployable anywhere (Netlify, GitHub Pages).
- 🖥️ **Server Mode**: Run a personal streaming server with API and web interface.
- 🎨 **Customizable**: Theme support and easy styling via CSS variables.
- 📱 **Responsive**: Mobile-friendly out of the box.
- 🔐 **Decentralized**: Optional GunDB integration for comments, stats, and unlock codes.
- 📡 **Federation**: ActivityPub support (Server Mode) to connect with the Fediverse.
- 🔊 **Subsonic API**: Compatible with mobile apps like DSub and Symfonium (Server Mode).

## Quick Start: Static Site Generator

Generate a static website for your music catalog. ideal for Bandcamp-style pages.

1.  **Install Tunecamp:**
    ```bash
    npm install -g tunecamp
    ```

2.  **Initialize a catalog:**
    ```bash
    tunecamp init my-music
    cd my-music
    ```

3.  **Build and Serve:**
    ```bash
    tunecamp build . -o public
    tunecamp serve public
    ```

👉 **[Read the Full Static Site Guide](./docs/STATIC_GENERATION.md)** for configuration, themes, and deployment instructions.

## Quick Start: Server Instance

Run your own music streaming server.

1.  **Run with Docker (Recommended):**
    ```bash
    docker run -d \
      -p 1970:1970 \
      -v /path/to/music:/music \
      -v tunecamp_data:/data \
      ghcr.io/scobru/tunecamp:latest
    ```

2.  **Access the Dashboard:**
    Open `http://localhost:1970` in your browser.

👉 **[Read the Full Server Guide](./docs/SERVER.md)** for installation details, environment variables, and administration.

## CLI Commands

- `tunecamp init <dir>`: Initialize a new static catalog.
- `tunecamp build <input> -o <output>`: Build a static site.
- `tunecamp serve <dir>`: Serve a static site locally.
- `tunecamp server [music-dir]`: Start the music server instance.

## Documentation

- [Static Site Generation](./docs/STATIC_GENERATION.md)
  - Configuration (`catalog.yaml`, `artist.yaml`)
  - Themes & Customization
  - Deployment Guide
- [Server Instance](./docs/SERVER.md)
  - Installation (Docker/Node)
  - Configuration (Environment Variables)
  - Features (Subsonic, ActivityPub)
- [Unlock Codes](./docs/STATIC_GENERATION.md#unlock-codes-download-protection)
- [Examples](./examples)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.

## Credits

Inspired by [Faircamp](https://simonrepp.com/faircamp/) by Simon Repp.
