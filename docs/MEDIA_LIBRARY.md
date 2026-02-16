# Media Library Architecture

TuneCamp includes a sophisticated media management system that acts as the core of the application. It handles file ingestion, metadata parsing, audio conversion, and file organization.

## 1. ingestion Engine (`src/server/scanner.ts`)

The Scanner is responsible for discovering audio files and populating the database. It operates in two modes: **Initial Scan** and **Watch Mode**.

### Key Features
- **File Discovery**: Recursively scans the data directory for supported audio files (`.mp3`, `.flac`, `.wav`, `.ogg`, `.m4a`, etc.) and YAML configuration files.
- **Metadata Parsing**: Uses `music-metadata` to extract ID3 tags (Artist, Title, Album, Track Number, Cover Art).
- **Auto-Conversion**: Automatically detects `.wav` files and converts them to `.mp3` (320kbps) in the background using `ffmpeg`. This ensures updated browser compatibility for streaming while keeping the original lossless file.
- **Waveform Generation**: Generates JSON waveform data for each track using `ffmpeg` to enable the visual audio player on the frontend.
- **Configuration-based Import**: Reads `artist.yaml` and `release.yaml` files to automatically create Artists and Releases with rich metadata that might not be in the ID3 tags.

## 2. Data Flow

1.  **User acts**: Uploads a file or manually adds a file to the folder.
2.  **Watcher detects**: `chokidar` detects the new file.
3.  **Scanner processes**:
    *   Parses metadata.
    *   Creates/Updates Database records (Artist, Album, Track).
    *   Triggers Waveform generation.
    *   Triggers Transcoding (if WAV).
4.  **API serves**: usage via `GET /api/tracks/:id/stream` or `GET /api/albums/:id`.

## 3. API Endpoints

The library is exposed via several REST endpoints:
*   `GET /api/tracks`: List all tracks (supports pagination and filtering).
*   `GET /api/albums`: List all albums.
*   `GET /api/artists`: List all artists.
*   `GET /api/stats`: Returns library statistics (counts of tracks, albums, artists, storage usage).
