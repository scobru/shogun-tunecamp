# Example: Artist with Free Downloads

This example shows a simple artist catalog with free downloads.

## Structure

```
artist-free/
├── catalog.yaml      # Main catalog config
├── artist.yaml       # Artist information
└── releases/
    └── debut-album/
        ├── release.yaml   # Release config
        ├── cover.jpg      # Album artwork (add your own)
        └── tracks/
            ├── 01-track-one.mp3
            ├── 02-track-two.mp3
            └── 03-track-three.mp3
```

## Features

- Free downloads for all tracks
- Artist bio and social links
- Album metadata and credits
- Genre tags

## Building

```bash
tunecamp build ./examples/artist-free -o ./output
```

## Notes

This example doesn't include actual audio files. Add your own MP3/FLAC files to the `tracks/` directory and cover art as `cover.jpg` and header image.
