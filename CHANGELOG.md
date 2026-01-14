# Changelog

All notable changes to Tunecamp will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-01-14

### Added

- **Public Key Support for Unlock Codes**: When using private GunDB space (with `--keypair`), you can now specify `publicKey` in `release.yaml` so the frontend can read codes from your private space
- **Improved Code Generator Output**: `generate-codes.ts` now outputs the `publicKey` in the instructions when using `--keypair`, making it easier to configure `release.yaml`
- **`isPrivateSpace()` method**: New helper method in `TunecampUnlockCodes` class to check if using private space

### Changed

- **Updated GunDB Peers**: Default peers updated to more reliable servers:
  - `https://gun.defucc.me/gun`
  - `https://gun.o8.is/gun`
  - `https://shogun-relay.scobrudot.dev/gun`
  - `https://relay.peer.ooo/gun`
- **Improved Unlock Codes Documentation**: `UNLOCK_CODES.md` now includes detailed instructions for private space usage and `publicKey` configuration

### Fixed

- **Private Space Unlock Codes**: Fixed issue where codes generated with `--keypair` couldn't be validated by the frontend. The frontend now correctly reads from the artist's user space using `gun.user(publicKey)`

### Technical Details

- `unlock-codes.js` now supports `publicKey` option in constructor
- New `getCodesRoot()` method handles both public and private space access
- All 5 themes updated with new `unlock-codes.js`
- `release.hbs` template updated to pass `publicKey` to the unlock codes script

## [1.0.0] - 2026-01-13

### Added

- Initial stable release
- **Static Site Generation**: Generate beautiful music catalog websites from audio files
- **5 Built-in Themes**: default, minimal, dark, retro, translucent
- **Audio-First**: Automatic metadata extraction from MP3, FLAC, OGG, WAV, M4A, OPUS
- **Download Models**: free, paycurtain (honor system), codes (GunDB validation), none
- **RSS/Atom Feeds**: Automatic feed generation for releases
- **Podcast Support**: Generate podcast RSS feeds
- **Embed Widgets**: Embeddable HTML players for releases
- **M3U Playlists**: Automatic playlist generation
- **Procedural Covers**: Auto-generate cover art if missing
- **Unlock Codes**: Decentralized download protection via GunDB
- **Download Statistics**: Real-time download counters via GunDB
- **Community Registry**: Decentralized directory of Tunecamp sites
- **Label Mode**: Multi-artist catalog support
- **Custom CSS/Fonts**: Support for custom styling
- **Header Images**: Bandcamp-style header image support

### Documentation

- Complete README with all features documented
- QUICKSTART.md for getting started quickly
- UNLOCK_CODES.md for unlock codes guide
- DEPLOYMENT.md for deployment instructions
- API.md for programmatic usage
- THEME_SHOWCASE.md for theme documentation
