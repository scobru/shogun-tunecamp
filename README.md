<img src="./logo.svg" alt="Tunecamp" width="200" height="200" style="display: block; margin-bottom: 20px; margin-top: 20px; align-items: center; justify-content: center; margin-left: auto; margin-right: auto;">

# Tunecamp

A decentralized music platform for independent artists and labels.

Tunecamp is a self-hosted music streaming server with federation, user management, and full Subsonic/OpenSubsonic API support. It allows artists to host their own music while connecting with the broader Fediverse and Funkwhale network.

Inspired by [Faircamp](https://simonrepp.com/faircamp/).

## Features

- 🎵 **Audio-first**: Automatically reads metadata and generates waveforms from your audio files.
- 🖥️ **Streaming Server**: Personal streaming server with a modern web interface.
- 🎨 **Customizable**: Responsive UI with theme support.
- 🔐 **Decentralized**: GunDB integration for comments, stats, and unlock codes.
- 📡 **Federation**: ActivityPub support to connect with the Fediverse (Mastodon, Funkwhale, etc.).
- 🔊 **Subsonic/OpenSubsonic API**: Full compatibility with mobile apps (DSub, Symfonium, Tempo, Substreamer, Amuse, etc.).
- 🎸 **Funkwhale Compatible**: Federation with Funkwhale instances via ActivityPub and compatible API endpoints.
- 📦 **Docker Ready**: Easy deployment with Docker and Docker Compose.

## Quick Start

The easiest way to run Tunecamp is using Docker.

1.  **Run with Docker Compose (Recommended):**

    ```bash
    docker-compose up -d
    ```

    _Make sure to edit `docker-compose.yml` to set your music and data volumes._

2.  **Access the Dashboard:**
    Open `http://localhost:1970` in your browser.

## Server Configuration

Tunecamp can be configured using environment variables. When using Docker, these can be set in the `environment` section of your `docker-compose.yml`.

### Core Settings

| Variable              | Description                                                        | Default              |
| :-------------------- | :----------------------------------------------------------------- | :------------------- |
| `PORT`                | The port the server will listen on.                                | `1970`               |
| `TUNECAMP_SITE_NAME`  | The name of your Tunecamp instance.                                | `My TuneCamp Server` |
| `TUNECAMP_PUBLIC_URL` | The public-facing URL of your server (required for ActivityPub).   | -                    |
| `JWT_SECRET`          | Secret key for signing JSON Web Tokens. Auto-generated if not set. | -                    |

### DeFi & Payments (Base Network)

Tunecamp integrates with the Base network for artist payments and currency management.

| Variable                     | Description                                               | Default                                      |
| :--------------------------- | :-------------------------------------------------------- | :------------------------------------------- |
| `TUNECAMP_OWNER_ADDRESS`     | Ethereum address of the server owner/artist.              | -                                            |
| `TUNECAMP_RPC_URL`           | RPC URL for the Base network.                             | `https://mainnet.base.org`                   |
| `TUNECAMP_CURRENCY_CONTRACT` | Contract address for the preferred currency (e.g., USDC). | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

### GunDB & Federation

| Variable             | Description                                |
| :------------------- | :----------------------------------------- |
| `TUNECAMP_GUN_PEERS` | Comma-separated list of GunDB relay peers. |
| `VITE_GUN_PEERS`     | (Frontend) Same as `TUNECAMP_GUN_PEERS`.   |
| `TUNECAMP_RELAY_URL` | ActivityPub relay URL for broadcasting.    |

## Subsonic / OpenSubsonic API

Tunecamp exposes a full **Subsonic API** at `/rest`, compatible with Subsonic API version **1.16.1**. This makes it compatible with all major Subsonic clients.

### Tested Clients

| Client      | Platform | Status |
| :---------- | :------- | :----- |
| DSub        | Android  | ✅     |
| Symfonium   | Android  | ✅     |
| Tempo       | iOS      | ✅     |
| Substreamer | Multi    | ✅     |
| Amuse       | Android  | ✅     |
| play:Sub    | iOS      | ✅     |

### Connection Settings

- **Server URL**: `https://your-server.com/rest`
- **Username**: Your admin username
- **Password**: Your admin password (supports clear-text, hex-encoded `enc:`, and token+salt authentication)

### Supported Endpoints

#### System

| Endpoint                         | Description                  |
| :------------------------------- | :--------------------------- |
| `ping.view`                      | Check server connectivity    |
| `getLicense.view`                | Returns valid license        |
| `getOpenSubsonicExtensions.view` | OpenSubsonic extensions list |

#### Browsing

| Endpoint                                         | Description                                 |
| :----------------------------------------------- | :------------------------------------------ |
| `getMusicFolders.view`                           | List music folders                          |
| `getIndexes.view`                                | List artists alphabetically indexed         |
| `getMusicDirectory.view`                         | Browse directory (artist → albums → tracks) |
| `getArtists.view`                                | List all artists (ID3)                      |
| `getArtist.view`                                 | Get artist details with albums              |
| `getAlbum.view`                                  | Get album details with tracks               |
| `getSong.view`                                   | Get single track details                    |
| `getGenres.view`                                 | List all genres                             |
| `getArtistInfo.view` / `getArtistInfo2.view`     | Artist biography and images                 |
| `getAlbumInfo.view` / `getAlbumInfo2.view`       | Album notes and images                      |
| `getSimilarSongs.view` / `getSimilarSongs2.view` | Discover similar songs                      |
| `getTopSongs.view`                               | Top/popular songs                           |

#### Album/Song Lists

| Endpoint                                   | Description                                                                            |
| :----------------------------------------- | :------------------------------------------------------------------------------------- |
| `getAlbumList.view` / `getAlbumList2.view` | Album lists (random, newest, alphabetical, frequent, recent, starred, byGenre, byYear) |
| `getRandomSongs.view`                      | Random track selection                                                                 |
| `getSongsByGenre.view`                     | Filter songs by genre                                                                  |
| `getStarred.view` / `getStarred2.view`     | Get starred (favorited) items                                                          |

#### Media

| Endpoint           | Description          |
| :----------------- | :------------------- |
| `stream.view`      | Stream audio files   |
| `download.view`    | Download audio files |
| `getCoverArt.view` | Get cover art images |
| `getLyrics.view`   | Get track lyrics     |

#### Search

| Endpoint                                        | Description                                     |
| :---------------------------------------------- | :---------------------------------------------- |
| `search.view` / `search2.view` / `search3.view` | Full-text search across artists, albums, tracks |

#### Playlists

| Endpoint              | Description                 |
| :-------------------- | :-------------------------- |
| `getPlaylists.view`   | List all playlists          |
| `getPlaylist.view`    | Get playlist with tracks    |
| `createPlaylist.view` | Create or update a playlist |
| `updatePlaylist.view` | Add/remove songs, rename    |
| `deletePlaylist.view` | Delete a playlist           |

#### Stars & Favorites

| Endpoint      | Description                            |
| :------------ | :------------------------------------- |
| `star.view`   | Star (favorite) artists, albums, songs |
| `unstar.view` | Remove star from items                 |

#### User & Scrobbling

| Endpoint             | Description                          |
| :------------------- | :----------------------------------- |
| `getUser.view`       | Get user details and permissions     |
| `getUsers.view`      | List all users                       |
| `scrobble.view`      | Record track plays (with GunDB sync) |
| `getNowPlaying.view` | Currently playing tracks             |

#### Play Queue & Bookmarks

| Endpoint              | Description           |
| :-------------------- | :-------------------- |
| `getPlayQueue.view`   | Get saved play queue  |
| `savePlayQueue.view`  | Save play queue state |
| `getBookmarks.view`   | Get bookmarks         |
| `createBookmark.view` | Create a bookmark     |
| `deleteBookmark.view` | Delete a bookmark     |

#### System & Misc

| Endpoint                        | Description               |
| :------------------------------ | :------------------------ |
| `getScanStatus.view`            | Media library scan status |
| `startScan.view`                | Trigger library scan      |
| `getAvatar.view`                | Get user avatar           |
| `getPodcasts.view`              | Podcast channels (stub)   |
| `getInternetRadioStations.view` | Radio stations (stub)     |
| `getShares.view`                | Shared items (stub)       |
| `jukeboxControl.view`           | Jukebox control (stub)    |

## Funkwhale Compatibility

Tunecamp is compatible with **Funkwhale** for music federation via ActivityPub.

### How It Works

- **NodeInfo**: Tunecamp exposes Funkwhale-compatible NodeInfo at `/.well-known/nodeinfo` with library metadata, supported upload extensions, and federation settings.
- **Federation Libraries**: The endpoint `GET /api/v1/federation/libraries` allows Funkwhale instances to discover Tunecamp's music catalog.
- **NodeInfo 2.0**: Available at `GET /api/v1/instance/nodeinfo/2.0` for Funkwhale-style discovery.
- **ActivityPub Notes**: Release broadcasts include Funkwhale-compatible `Audio` attachments with namespace metadata (`funkwhale:bitrate`, `funkwhale:duration`).
- **Actor Types**: Artists are exposed as `Person` + `Artist` + `MusicArtist` types, compatible with Funkwhale's actor model.

## Federation & Decentralization

Tunecamp is built on a decentralized foundation:

- **ActivityPub**: Connects artists with the Fediverse (Mastodon, Funkwhale, etc.). Supports followers, likes/favorites, broadcasts for new releases, and standard actor models.
- **GunDB**: Enables decentralized music discovery, global stats, and social interactions without a central server.

For a deep dive into how Tunecamp handles federation, see [FEDERATION.md](./docs/FEDERATION.md).

## CLI Commands

If running via Node.js, you can use the `tunecamp` CLI:

- `tunecamp server [music-dir]`: Start the music server instance.
- `tunecamp backup [target-dir]`: Backup the database.
- `tunecamp restore <backup-file>`: Restore the database from a backup.

## Development Setup

If you want to run Tunecamp from source:

1.  **Backend:**

    ```bash
    npm install
    npm run build
    npm run dev  # Starts with auto-reload
    ```

2.  **Frontend:**
    ```bash
    cd webapp
    npm install
    npm run dev
    ```

### Environment File (.env)

For local development, you can create a `.env` file in the root directory:

```env
PORT=1970
TUNECAMP_SITE_NAME=My Dev Server
TUNECAMP_GUN_PEERS=https://shogun-relay.scobrudot.dev/gun
VITE_GUN_PEERS=https://shogun-relay.scobrudot.dev/gun
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.
