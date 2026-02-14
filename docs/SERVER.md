# TuneCamp Server Mode

TuneCamp can run as a self-hosted music streaming server, allowing you to stream your personal music collection from anywhere, manage uploads, and interact with other TuneCamp instances via the decentralized community network.

## Features

- 🎵 **Music Streaming**: Stream your local music library (MP3, FLAC, OGG, WAV, etc.) via a modern web interface.
- 📱 **Subsonic API**: Compatible with Subsonic clients (e.g., DSub, Symfonium, Ultrasonic) for mobile streaming.
- 🌐 **ActivityPub Federation**: Follow and interact with other TuneCamp instances (Fediverse support).
- 💬 **Decentralized Social Features**: Comments, likes, and community discovery powered by GunDB.
- 📊 **Statistics**: Track play counts, popular tracks, and listening history.
- 🔐 **User Management**: Multi-user support with role-based access control (Admin/User).
- 📡 **Radio Mode**: Listen to a continuous stream of your library.

## Installation

### Prerequisites

- Node.js 18+ (for manual installation)
- Docker (optional, recommended for production)

### Using Docker (Recommended)

1.  Create a `docker-compose.yml` file:

```yaml
version: '3'
services:
  tunecamp:
    image: ghcr.io/scobru/tunecamp:latest
    container_name: tunecamp
    ports:
      - "1970:1970"
    volumes:
      - /path/to/your/music:/music     # Mount your music directory
      - ./data:/data                   # Persistent data (database, uploads)
    environment:
      - TUNECAMP_JWT_SECRET=your_secure_random_secret
      - TUNECAMP_SITE_NAME=My TuneCamp
      - TUNECAMP_PUBLIC_URL=https://music.example.com
    restart: unless-stopped
```

2.  Run the container:

```bash
docker-compose up -d
```

3.  Access the server at `http://localhost:1970`.

### Manual Installation

1.  Install TuneCamp globally:

```bash
npm install -g tunecamp
```

2.  Start the server:

```bash
tunecamp server /path/to/your/music
```

3.  Access the server at `http://localhost:1970`.

## Configuration

### Command Line Arguments

When running manually via `tunecamp server`:

- `[music-dir]`: The directory containing your music files (default: `./music`).
- `-p, --port <port>`: Port to listen on (default: `1970`).
- `-d, --db <path>`: Path to the SQLite database file (default: `./tunecamp.db`).

### Environment Variables

You can configure the server using environment variables (useful for Docker):

| Variable | Description | Default |
|----------|-------------|---------|
| `TUNECAMP_PORT` | Port number to listen on | `1970` |
| `TUNECAMP_MUSIC_DIR` | Directory containing music files | `./music` |
| `TUNECAMP_DB_PATH` | Path to the SQLite database | `./tunecamp.db` |
| `TUNECAMP_JWT_SECRET` | Secret key for session signing | (Randomly generated) |
| `TUNECAMP_CORS_ORIGINS`| Comma-separated list of allowed CORS origins | `[]` |
| `TUNECAMP_PUBLIC_URL` | Public URL for federation and sharing | `undefined` |
| `TUNECAMP_SITE_NAME` | Name of your instance | `TuneCamp Server` |
| `TUNECAMP_GUN_PEERS` | Comma-separated list of GunDB peers | (Default public peers) |

## Administration

### First Run

On the first run, a default admin account is created:
- **Username:** `admin`
- **Password:** `tunecamp`

**⚠️ Important:** You must change this password immediately after logging in.

### Web Interface

The web interface provides a dashboard for:
- Browsing your library by Artist, Album, and Track.
- Managing users and permissions.
- Viewing system status and logs.
- Managing uploads and imports.

### Subsonic API

TuneCamp implements the Subsonic API, allowing you to use compatible mobile apps.

- **Server URL:** `http://your-server-ip:1970` (or your domain)
- **Username:** Your TuneCamp username
- **Password:** Your TuneCamp password

*Note: Some clients may require "Legacy Authentication" (MD5), which TuneCamp supports.*

## ActivityPub & Federation

TuneCamp is a Fediverse-enabled application. This means:
- You can follow other TuneCamp instances.
- Users on Mastodon, Pleroma, or other ActivityPub platforms can follow your artist profiles.
- Releases and posts are federated to followers.

To enable full federation features, ensure `TUNECAMP_PUBLIC_URL` is set correctly to your public HTTPS endpoint.

## Troubleshooting

- **Database Locks**: If you encounter database errors, ensure no other process (like a backup script) is holding a lock on `tunecamp.db`.
- **Permission Errors**: Ensure the user running TuneCamp has read/write access to the `data` and `music` directories.
