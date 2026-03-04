# Quick Start Guide

Get up and running with Tunecamp in 5 minutes!

## Installation

```bash
git clone https://github.com/scobru/tunecamp.git
cd tunecamp
npm install
npm run build

# Build the webapp (frontend)
cd webapp
npm install
npm run build
cd ..
```

## Running the Server

The easiest way to start is by pointing Tunecamp to a directory containing your music.

```bash
# Start the server
node dist/cli.js server ./path/to/your/music --port 1970 --db ./tunecamp.db
```

Then open http://localhost:1970 in your browser!

## Music Directory Structure

Tunecamp automatically scans your music directory. For the best experience, organize your music as follows:

```
music/
├── Artist Name/
│   ├── Album Title/
│   │   ├── cover.jpg
│   │   ├── 01 - Track Name.mp3
│   │   ├── 02 - Another Track.mp3
│   │   └── release.yaml (optional)
└── Another Artist/
    └── Single Title/
        ├── cover.png
        └── track.flac
```

### Optional: release.yaml

You can add a `release.yaml` in any album folder to provide extra metadata:

```yaml
title: "My Amazing Album"
date: "2024-10-21"
description: "A journey through sound."
genres:
  - "Electronic"
  - "Ambient"
```

## Features to Explore

### 🌐 Web Interface
Browse your library, play tracks with a modern player, and manage your profile.

### 📡 Federation (ActivityPub)
Connect your instance to the Fediverse. Other users on Mastodon or Pleroma can follow your artists and get updates on new releases.

### 🔊 Subsonic API
Use your favorite mobile apps (DSub, Symfonium, etc.) to stream your music on the go.
- **Server URL**: `http://your-ip:1970/rest`
- **Username/Password**: Use your Tunecamp credentials.

### 🔐 Decentralized Comments
Engage with your listeners using GunDB-powered decentralized comments.

## Docker Setup (Recommended for Production)

```bash
docker-compose up -d
```

Make sure to edit `docker-compose.yml` to mount your music and data volumes.

## Next Steps

- [Read the Server Guide](docs/SERVER.md)
- [Learn about Media Library Organization](docs/MEDIA_LIBRARY.md)
- [Configure Network & Federation](docs/NETWORK.md)

Happy music sharing! 🎵
