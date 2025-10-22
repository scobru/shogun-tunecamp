# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-10-21

### Added
- Initial release of Tunecamp (formerly Tunecamp)
- Static site generation for music catalogs
- YAML-based configuration files
- Audio metadata extraction from files
- HTML5 audio player with playlist support
- Default dark theme with responsive design
- Support for multiple download modes:
  - Free downloads
  - Pay-what-you-want (paycurtain)
  - Download codes
- Multi-format audio support (MP3, FLAC, OGG, WAV, M4A, OPUS)
- Automatic cover art detection
- Artist profiles with bio and social links
- Release pages with track listings
- Genre tagging system
- Credits and liner notes
- CLI with commands:
  - `build` - Generate static site
  - `init` - Initialize new catalog
  - `serve` - Local development server
- Example catalogs
- Handlebars template engine
- Template helpers for formatting
- Programmatic API for integration

### Features
- 🎵 Audio-first design
- 📦 Zero database requirement
- 🎨 Customizable theming
- 🚀 Fast static HTML generation
- 📱 Mobile-responsive layouts
- 🔊 Built-in audio player
- 💿 Multi-format support

### Documentation
- Comprehensive README
- API documentation
- Example catalogs
- Contributing guidelines
- MIT License

## [Unreleased]

### Fixed
- **Asset path issues on deployment**: Fixed hardcoded absolute paths that prevented styles and scripts from loading when deployed to subdirectories (e.g., GitHub Pages). Added `basePath` configuration option to support deployments in subdirectories.

### Added
- `basePath` configuration option in `catalog.yaml` to specify the base path for deployment
- `--basePath` CLI flag to override the base path at build time
- `path` Handlebars helper to automatically prepend the base path to asset URLs
- Comprehensive deployment documentation with platform-specific examples

### Changed
- Updated all asset references in templates to use the new `path` helper
- Modified site generator to pass `basePath` to all templates
- Updated `init` command to include `basePath` in the generated catalog.yaml template

### Added
- **Multiple Theme Support**: Added 3 new themes in addition to the default theme
  - `minimal` - Clean light theme with white background
  - `dark` - Aggressive dark theme with red accents (perfect for rock/metal)
  - `retro` - 80s-inspired theme with neon colors and animations (perfect for synthwave/vaporwave)
- Theme selection via `catalog.yaml` configuration or `--theme` CLI option
- Comprehensive theme documentation in `docs/THEMES.md`
- Theme examples and usage guides in README.md and QUICKSTART.md

### Planned
- Automated testing suite
- Even more themes (contributions welcome!)
- Playlist export (M3U, PLS)
- RSS feed generation
- Search functionality
- Multiple artists per catalog
- Internationalization (i18n)
- Analytics integration
- SEO enhancements
- Progressive Web App support
- Dark/light theme toggle
- Lyrics display
- Waveform visualization
- Social sharing cards

---

[0.1.0]: https://github.com/yourusername/Tunecamp/releases/tag/v0.1.0

