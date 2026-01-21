# TuneCamp - Features

## Project Overview
TuneCamp is a comprehensive platform for musicians and labels, offering both a **Static Site Generator** for public distribution and a **Personal Streaming Server** for library management and private listening.

## Core Features: Static Site Generator
The classic TuneCamp experience, inspired by Faircamp.
1.  **Static HTML Generation**
    *   Database-less architecture.
    *   Responsive, mobile-friendly design.
    *   CLI-based build process (`tunecamp build`).
    *   Deployable to any static host (Netlify, Vercel, GitHub Pages).

2.  **Audio & Metadata**
    *   **Audio-First**: Automatic metadata extraction from audio files.
    *   **Multi-Format Support**: MP3, FLAC, OGG, WAV, M4A/AAC, OPUS.
    *   **Hierarchical Structure**: Catalog -> Artist -> Release -> Track.
    *   **Procedural Covers**: Auto-generation of SVG cover art.

3.  **Distribution**
    *   **Feeds**: RSS, Atom, and Podcast feeds.
    *   **Playlists**: M3U playlist generation.
    *   **Embed Widgets**: Iframe-ready players.

## Advanced Features: TuneCamp Server
A personal music streaming server and management backend (`tunecamp server`).
1.  **Streaming & Playback**
    *   **Personal Streaming**: Stream your library via web interface.
    *   **Playlists**: Create and manage custom playlists via API.
    *   **Transcoding**: (Implied capability for format compatibility).

2.  **Library Management**
    *   **Dual Modes**:
        *   **Release Mode**: Curated structure with `release.yaml`.
        *   **Library Mode**: Loose folder structure for large collections.
    *   **Smart Scanning**: `chokidar`-based file watching for real-time updates.
    *   **Uploads**: Web-based upload for Tracks, Covers, and Avatars.
    *   **Release Promotion**: Ability to promote entire *Library Albums* to *Releases* (Note: Individual track promotion not supported).

3.  **API & Backend**
    *   **REST API**: Endpoints for Tracks, Albums, Artists, and Playlists.
    *   **SQLite Database**: Fast metadata indexing and persistence.
    *   **Authentication**: JWT-based security for admin actions.

## Advanced Features: TuneCamp Studio
A visual interface for managing your static site configuration (`tunecamp studio` / via API).
1.  **Visual Editor**
    *   GUI for editing `catalog.yaml`, `artist.yaml`, and `release.yaml`.
    *   Validation of configuration before saving.
    *   Live metadata updates without touching text files.

2.  **Live Preview**
    *   Instant preview generation in a temporary environment.
    *   Theme switching and testing.

## Decentralized Features (GunDB)
*   **Unlock Codes**: Decentralized download protection.
*   **Download Statistics**: Public, anonymous real-time counters.
*   **Community Registry**: Auto-registration to the public directory.

## Technical Stack
*   **Runtime**: Node.js
*   **Language**: TypeScript
*   **Database**: Better-SQLite3 (Server Mode)
*   **Sync**: GunDB (Decentralized features)

## Current Limitations
*   **Track Promotion**: Cannot promote individual "loose" library tracks to a release directly from the UI. Tracks must be organized into an album first.
*   **File Management**: No web-based file manager to move/rename tracks within the library.

