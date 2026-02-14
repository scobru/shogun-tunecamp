# Static Site Generation with TuneCamp

TuneCamp is a powerful static site generator designed specifically for musicians and labels. It transforms your audio files and metadata into a beautiful, responsive website without requiring a database or backend server.

## Overview

The generator reads your music directory structure, parses metadata from audio files (ID3 tags, etc.) and YAML configuration files, and outputs a complete HTML website ready for deployment.

### Key Features

- **Audio-First**: Metadata is automatically extracted from your audio files.
- **Zero Database**: pure static HTML, CSS, and JS.
- **Responsive**: Mobile-friendly design.
- **Customizable**: Theming system with Handlebars templates.
- **Decentralized**: Optional integration with GunDB for comments and unlock codes.

## Quick Start

1.  **Initialize a new catalog:**

    ```bash
    tunecamp init my-catalog
    cd my-catalog
    ```

2.  **Add your music:**
    -   Place audio files in `releases/your-album/tracks/`.
    -   Add cover art (`cover.jpg`) to the release folder.

3.  **Build the site:**

    ```bash
    tunecamp build . -o public
    ```

4.  **Preview locally:**

    ```bash
    tunecamp serve public
    ```

## Configuration Files

TuneCamp uses YAML files for configuration.

### `catalog.yaml` (Global Config)

Located in the root of your catalog directory.

```yaml
title: "My Music Catalog"
description: "Independent music releases"
url: "https://mysite.com"
basePath: ""          # Important for subdirectory deployment (e.g., "/my-music")
theme: "default"      # Theme name (default: "default")
language: "en"        # Language code (default: "en")
headerImage: "header.png" # Optional: Custom header image
backgroundImage: "bg.jpg" # Optional: Page background
customCSS: "style.css"    # Optional: Custom CSS file
labelMode: false      # Set to true for multi-artist labels
podcast:              # Optional: Podcast feed settings
  enabled: true
  title: "My Podcast"
  author: "Artist Name"
  email: "contact@example.com"
  image: "podcast.jpg"
```

### `artist.yaml` (Artist Info)

Located in the root (or `artists/` folder in Label Mode).

```yaml
name: "Artist Name"
bio: "Artist biography..."
photo: "artist.jpg"
links:
  - website: "https://example.com"
  - bandcamp: "https://artist.bandcamp.com"
donationLinks:
  - platform: "PayPal"
    url: "https://paypal.me/artist"
```

### `release.yaml` (Album/Single Info)

Located in each release directory (e.g., `releases/my-album/release.yaml`).

```yaml
title: "Album Title"
date: "2024-01-01"
description: "Album description..."
cover: "cover.jpg"    # Optional, auto-detected
download: "free"      # Options: free, paycurtain, codes, none
price: 10.00          # Suggested price for paycurtain
paypalLink: "https://paypal.me/..."
tags:                 # Genres/Tags
  - Electronic
  - Ambient
credits:
  - role: "Mastering"
    name: "Jane Doe"
unlisted: false       # Hide from index but keep accessible
```

## Deployment Guide

### Base Path Configuration

If you are deploying to a subdirectory (like GitHub Pages `username.github.io/repo`), you **must** set the `basePath`.

**GitHub Pages (Project Site):**
```yaml
basePath: "/repository-name"
```

**Netlify/Vercel (Root Domain):**
```yaml
basePath: ""
```

You can also override this at build time:
```bash
tunecamp build . -o public --basePath /my-music
```

## Themes & Customization

### Built-in Customization

- **Custom CSS**: Add a `custom.css` file and link it in `catalog.yaml` via `customCSS: "custom.css"`.
- **Images**: Set `headerImage` and `backgroundImage` in `catalog.yaml`.
- **Fonts**: Use `customFont` in `catalog.yaml` to load Google Fonts.

### Creating a Theme

Themes are located in `templates/`. To create a new theme:

1.  Copy `templates/default` to `templates/my-theme`.
2.  Edit the Handlebars (`.hbs`) files:
    -   `layout.hbs`: Main page structure.
    -   `index.hbs`: Homepage (catalog listing).
    -   `release.hbs`: Individual release page.
3.  Edit `assets/style.css` for styling.
4.  Build with your theme: `tunecamp build . -t my-theme`.

## Advanced Features

### Unlock Codes (Download Protection)

TuneCamp supports a decentralized "Unlock Code" system using GunDB.

1.  **Configure Release**:
    Set `download: codes` in `release.yaml`.

    ```yaml
    download: codes
    unlockCodes:
      enabled: true
      namespace: tunecamp
    ```

2.  **Generate Codes**:
    You need to generate codes locally using the CLI tool (if available) or a script.
    *(Note: This feature requires running the code generation script against your local catalog before building).*

### Embed Widgets

Every release automatically generates embeddable widgets.
- **Files**: `embed.html`, `embed-code.txt`.
- **Usage**: Copy the code from the "Share" button on the release page.

### Community Registry

By default, TuneCamp sites register themselves to a public directory (via GunDB) to help users discover independent music.
- To disable: Remove the `community-registry.js` script from the output or commented out in the template.

## CLI Reference

- `tunecamp init <dir>`: Create a new catalog structure.
- `tunecamp build <input> -o <output>`: Build the static site.
  - `--theme <name>`: Override theme.
  - `--basePath <path>`: Override base path.
- `tunecamp serve <dir>`: Serve the built site locally.
