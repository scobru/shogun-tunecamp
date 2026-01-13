# Example: Music Label

This example shows a label catalog with multiple artists.

## Structure

```
label/
├── catalog.yaml      # Label info
└── releases/
    ├── artist-one-album/
    │   └── release.yaml
    └── artist-two-ep/
        └── release.yaml
```

## Features

- Label-level configuration
- Multiple artists
- Mixed download modes
- Various genres

## Building

```bash
tunecamp build ./examples/label -o ./output
```

## Notes

For a label catalog, you don't need an `artist.yaml` at the root. Instead, each release can specify its own artist in the track metadata or release config.

