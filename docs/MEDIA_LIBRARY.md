# Media Library Organization

TuneCamp automatically scans the directory you provide to the server to build its library.

## Directory Structure

We recommend the following structure for optimal parsing:

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

## Supported Formats

- MP3 (`.mp3`)
- FLAC (`.flac`)
- OGG (`.ogg`)
- WAV (`.wav`) - *Automatically queued for MP3 conversion*
- M4A (`.m4a`)
- AAC (`.aac`)
- OPUS (`.opus`)

## Metadata and Covers

TuneCamp reads ID3 tags (artist, title, track number) and automatically assigns tracks to albums based on directory grouping and metadata. For album covers, it looks for `cover.jpg`, `folder.jpg`, `cover.png`, or `folder.png` within the album directory.
