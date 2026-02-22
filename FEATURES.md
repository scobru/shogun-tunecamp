# Project Features: TuneCamp

TuneCamp is a versatile music platform designed for independent artists, supporting both static site generation and dynamic server streaming.

## 🚀 Core Architecture

- **Dual Mode Operation**:
  - **Static Site Generator (SSG)**: Compiles music catalogs into high-performance, SEO-friendly HTML/CSS websites.
  - **Server Mode**: A full-featured Node.js/Express server for self-hosted music streaming and library management.
- **CLI Interface**: Robust command-line tool for initialization, building, and serving catalogs.

## 🎵 Music Management

- **Automated Metadata Parsing**: Extracts ID3 tags and audio metadata (artist, album, track number, cover art) using `music-metadata`.
- **Deep Scanner**: Recursively scans directories to build a structured music library.
- **Waveform Generation**: Generates visual waveforms for audio tracks.
- **Procedural Cover Art**: Automatically generates placeholder covers for albums lacking artwork.

## 📡 Connectivity & Federation

- **ActivityPub Integration**: Federated social features powered by `fedify`, allowing connection with the Fediverse (Mastodon, etc.).
- **Subsonic API Support**: Compatible with a wide range of third-party music streaming clients (DSub, Symfonium, etc.).
- **RSS/Podcast Feeds**: Generates Atom, RSS, and iTunes-compatible podcast feeds for all releases.

## 🔐 Security & User Management

- **Decentralized Data**: Integration with **GunDB** for decentralized comments, playback statistics, and unlock codes.
- **Authentication**: Secure user accounts with bcrypt password hashing and JWT-based session management.
- **Unlock Codes**: Support for download protection and "pay-what-you-want" or gated access via codes.

## 🎨 Design & Customization

- **Modern Web App**: React-based frontend (`webapp/`) using Vite, Tailwind CSS, and DaisyUI for a premium user experience.
- **Theming System**: Highly customizable interface using CSS variables and Handlebars templates.
- **Responsive Design**: Fully optimized for desktop and mobile devices.
- **Embeddable Player**: Generates lightweight, iframe-compatible players for external websites.

## 🛠️ Developer Experience

- **TypeScript Core**: Entire backend and frontend built with TypeScript for type safety.
- **Docker Support**: Containerized deployment for easy server hosting.
- **Extensive Tooling**: Includes scripts for database repair, schema migration, and library verification.
- **Testing Suite**: Integration and unit tests using Jest.
