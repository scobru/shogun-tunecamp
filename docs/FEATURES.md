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
    *   **Advanced Player**: Full-featured HTML5 player with:
        *   Progress bar scrubbing (click or drag to seek)
        *   Queue management (add tracks, reorder, remove)
        *   Lyrics display (if available)
        *   Volume control with persistence
        *   Play/pause, next/previous track controls
    *   **Playlists**: Create and manage custom playlists via web interface and API.
    *   **Transcoding**: Automatic transcoding of lossless formats (FLAC, WAV) to MP3 for streaming.
    *   **Waveform Generation**: Visual waveform data generation for audio files.

2.  **Library Management**
    *   **Dual Modes**:
        *   **Release Mode**: Curated structure with `release.yaml`.
        *   **Library Mode**: Loose folder structure for large collections.
    *   **Smart Scanning**: `chokidar`-based file watching for real-time updates.
    *   **Uploads**: Web-based upload for Tracks, Covers, and Avatars.
    *   **Release Promotion**: Ability to promote entire *Library Albums* to *Releases* (Note: Individual track promotion not supported).
    *   **File Browser**: Admin file browser to navigate and manage library files directly.

3.  **API & Backend**
    *   **REST API**: Comprehensive REST API for Tracks, Albums, Artists, Playlists, Comments, Users, and more.
    *   **SQLite Database**: Fast metadata indexing and persistence.
    *   **Authentication**: 
        *   **Admin Authentication**: JWT-based security for admin actions (upload, delete, edit).
        *   **User Authentication**: Decentralized user accounts via GunDB (optional, for comments and user profiles).

4.  **Social Features**
    *   **Comments System**: Decentralized comments on tracks using GunDB.
    *   **User Profiles**: User registration and profile management via GunDB.
    *   **Lyrics Support**: Display and manage lyrics for tracks.

5.  **Analytics & Statistics**
    *   **Library Statistics**: Overview of total plays, listening time, unique tracks.
    *   **Play History**: Track recent plays and listening patterns.
    *   **Top Tracks/Artists**: Most played tracks and artists over configurable time periods.
    *   **Listening Stats Dashboard**: Visual dashboard showing listening habits and trends.

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
*   **Languages**: 
    *   **TypeScript**: Main application code
    *   **Gleam**: Type-safe utility functions (string manipulation, formatting, validation)
*   **Database**: Better-SQLite3 (Server Mode)
*   **Sync**: GunDB (Decentralized features)
*   **Audio Processing**: FFmpeg (transcoding, waveform generation)

## Code Quality & Type Safety

TuneCamp uses **Gleam** (a type-safe functional language) for critical utility functions:
*   **String Utilities**: HTML escaping, slug generation, filename sanitization, URL normalization
*   **Time Formatting**: Duration formatting, relative time display
*   **Validation**: Username validation, unlock code format validation
*   **Benefits**: 
    *   Type safety at compile-time
    *   Same code shared between server and client
    *   Easier testing and maintenance
    *   Reduced bugs in critical functions

## Current Limitations
*   **Track Promotion**: Cannot promote individual "loose" library tracks to a release directly from the UI. Tracks must be organized into an album first.
*   **File Management**: Basic file browser available, but no drag-and-drop file reorganization in the UI.

