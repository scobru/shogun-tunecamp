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

2.  **Access the Dashboard:**
    Open `http://localhost:1970` in your browser.

## Server Configuration

Tunecamp can be configured using environment variables. When using Docker, these can be set in the `environment` section of your `docker-compose.yml`.

### Core Settings

| Variable              | Description                                                        | Default              |
| :-------------------- | :----------------------------------------------------------------- | :------------------- |
| `PORT`                | The port the server will listen on.                                | `1970`               |
| `TUNECAMP_SITE_NAME`  | The name of your Tunecamp instance.                                | `My TuneCamp Server` |
| `TUNECAMP_PUBLIC_URL` | The public-facing URL of your server (required for ActivityPub).   | -                    |
| `JWT_SECRET`          | Secret key for signing JSON Web Tokens. Auto-generated if not set. | -                    |

### DeFi & Payments (Base Network)

Tunecamp integrates with the Base network for artist payments and currency management.

| Variable                     | Description                                               | Default                                      |
| :--------------------------- | :-------------------------------------------------------- | :------------------------------------------- |
| `TUNECAMP_OWNER_ADDRESS`     | Ethereum address of the server owner/artist.              | -                                            |
| `TUNECAMP_RPC_URL`           | RPC URL for the Base network.                             | `https://mainnet.base.org`                   |
| `TUNECAMP_CURRENCY_CONTRACT` | Contract address for the preferred currency (e.g., USDC). | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

### GunDB & Federation

| Variable             | Description                                |
| :------------------- | :----------------------------------------- |
| `TUNECAMP_GUN_PEERS` | Comma-separated list of GunDB relay peers. |
| `VITE_GUN_PEERS`     | (Frontend) Same as `TUNECAMP_GUN_PEERS`.   |
| `TUNECAMP_RELAY_URL` | ActivityPub relay URL for broadcasting.    |

## Federation & Decentralization

Tunecamp is built on a decentralized foundation:

- **ActivityPub**: Connects artists with the Fediverse (Mastodon, etc.). Supports followers, broadcasts for new releases, and standard actor models.
- **GunDB**: Enables decentralized music discovery, global stats, and social interactions without a central server.

For a deep dive into how Tunecamp handles federation, see [FEDERATION.md](./docs/FEDERATION.md).

## CLI Commands

If running via Node.js, you can use the `tunecamp` CLI:

- `tunecamp server [music-dir]`: Start the music server instance.
- `tunecamp backup [target-dir]`: Backup the database.
- `tunecamp restore <backup-file>`: Restore the database from a backup.

## Development Setup

If you want to run Tunecamp from source:

1.  **Backend:**

    ```bash
    npm install
    npm run build
    npm run dev  # Starts with auto-reload
    ```

2.  **Frontend:**
    ```bash
    cd webapp
    npm install
    npm run dev
    ```

### Environment File (.env)

For local development, you can create a `.env` file in the root directory:

```env
PORT=1970
TUNECAMP_SITE_NAME=My Dev Server
TUNECAMP_GUN_PEERS=https://shogun-relay.scobrudot.dev/gun
VITE_GUN_PEERS=https://shogun-relay.scobrudot.dev/gun
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.
