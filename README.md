# Shogun Faircamp

A modern static site generator for musicians and music labels, written in JavaScript/TypeScript.

Inspired by [Faircamp](https://simonrepp.com/faircamp/), this tool helps you create beautiful, fast static websites to showcase your music without the need for databases or complex hosting.

## Features

- 🎵 **Audio-first**: Automatically reads metadata from your audio files
- 📦 **Zero database**: Pure static HTML generation
- 🎨 **Customizable**: Template-based theming system
- 🚀 **Fast**: Static sites that load instantly
- 📱 **Responsive**: Mobile-friendly out of the box
- 🔊 **Built-in player**: Modern HTML5 audio player
- 💿 **Multi-format**: Support for MP3, FLAC, OGG, WAV, and more
- 🏷️ **Flexible metadata**: YAML-based configuration files

## Quick Start

### Installation

```bash
npm install -g shogun-faircamp
# or
yarn global add shogun-faircamp
```

### Basic Usage

1. **Create your catalog structure:**

```
my-music/
├── catalog.yaml
├── artist.yaml
└── releases/
    └── my-first-album/
        ├── release.yaml
        ├── cover.jpg
        └── tracks/
            ├── 01-track-one.mp3
            ├── 02-track-two.mp3
            └── track.yaml (optional)
```

2. **Configure your catalog:**

```yaml
# catalog.yaml
title: "My Music Catalog"
description: "Independent music releases"
url: "https://mymusic.com"
```

```yaml
# artist.yaml
name: "Artist Name"
bio: "Artist biography goes here"
links:
  - bandcamp: "https://artistname.bandcamp.com"
  - spotify: "https://open.spotify.com/artist/..."
```

```yaml
# releases/my-first-album/release.yaml
title: "My First Album"
date: "2024-01-15"
description: "An amazing debut album"
download: free # Options: free, paycurtain, codes
price: 10.00
```

3. **Generate your site:**

```bash
shogun-faircamp build ./my-music --output ./public
```

4. **Deploy:**

Upload the `public` folder to any static hosting service (Netlify, Vercel, GitHub Pages, etc.)

## Configuration Files

### catalog.yaml

Global catalog configuration:

```yaml
title: "Catalog Title"
description: "Catalog description"
url: "https://yoursite.com"
theme: "default" # or custom theme name
language: "en"
```

### artist.yaml

Artist information:

```yaml
name: "Artist Name"
bio: "Biography text"
photo: "artist.jpg"
links:
  - website: "https://..."
  - bandcamp: "https://..."
  - spotify: "https://..."
  - instagram: "https://..."
```

### release.yaml

Individual release configuration:

```yaml
title: "Album Title"
date: "2024-01-15"
description: "Album description"
cover: "cover.jpg" # Optional, auto-detected
download: "free" # free, paycurtain, codes, none
price: 10.00 # For paycurtain mode
genres:
  - "Electronic"
  - "Ambient"
credits:
  - role: "Producer"
    name: "Producer Name"
```

### track.yaml

Optional track-level metadata overrides:

```yaml
tracks:
  - file: "01-track.mp3"
    title: "Custom Title"
    description: "Track notes"
```

## CLI Commands

```bash
# Build a catalog
shogun-faircamp build <input-dir> --output <output-dir>

# Watch for changes and rebuild
shogun-faircamp watch <input-dir> --output <output-dir>

# Serve locally
shogun-faircamp serve <output-dir> --port 3000

# Initialize a new catalog
shogun-faircamp init <directory>
```

## Development Modes

### Free Downloads

```yaml
download: free
```

All tracks available for immediate download.

### Soft Paycurtain

```yaml
download: paycurtain
price: 10.00
```

Pay-what-you-want with suggested price.

### Download Codes

```yaml
download: codes
```

Requires download codes for access.

## Supported Audio Formats

- MP3
- FLAC
- OGG Vorbis
- WAV
- M4A/AAC
- OPUS

## Theming

Create custom themes by providing your own Handlebars templates:

```
my-theme/
├── layout.hbs
├── index.hbs
├── release.hbs
├── track.hbs
└── assets/
    ├── style.css
    └── player.js
```

## Examples

Check the `/examples` directory for complete catalog examples:

- **artist-free**: Simple artist catalog with free downloads
- **artist-paycurtain**: Artist with pay-what-you-want model
- **label**: Multi-artist label catalog

## API Usage

You can also use Shogun Faircamp programmatically:

```javascript
import { ShogunFaircamp } from "shogun-faircamp";

const generator = new ShogunFaircamp({
  inputDir: "./my-music",
  outputDir: "./public",
  theme: "default",
});

await generator.build();
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Credits

Inspired by [Faircamp](https://simonrepp.com/faircamp/) by Simon Repp.

## Links

- [Documentation](./docs)
- [Examples](./examples)
- [Themes](./themes)
