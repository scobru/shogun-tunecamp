# Federation & Decentralization in Tunecamp

Tunecamp leverages two primary technologies to enable a decentralized music ecosystem: **ActivityPub** for social federation and **GunDB** for decentralized data storage and discovery. It also provides full **Subsonic API** compatibility for mobile and desktop clients.

## GunDB: Decentralized Social & Discovery

GunDB is used for features that require real-time, decentralized synchronization without a central authority.

### Key Roles

- **Community Registry**: Servers can register themselves in a global decentralized directory.
- **Music Discovery**: The "Network" page scans GunDB peers to discover other Tunecamp instances and their public tracks.
- **Social Features**: Comments, track play/download stats, and user playlists are stored in GunDB.
- **Identity (SEA)**: Each server and user has a cryptographic keypair (SEA) for signing and verifying data.

### Secure Graph Strategy

Tunecamp uses a "Secure Graph" approach:

1.  **Authoritative Data**: Data signed by a server's public key is stored in its specific namespace.
2.  **Public Directory**: A reference (link) is placed in a public directory namespace (`tunecamp-community`).
3.  **Verification**: When discovery scans the network, it validates the data against the sender's public key.

### Configuration

Set GunDB relay peers using:

- `TUNECAMP_GUN_PEERS` (Backend)
- `VITE_GUN_PEERS` (Frontend)

---

## ActivityPub: Fediverse Integration

ActivityPub allows Tunecamp to communicate with other platforms like Mastodon, Pleroma, Funkwhale, and Lemmy.

### Key Roles

- **Artist Profiles**: Every artist on Tunecamp is an ActivityPub "Person" actor.
- **Followers & Likes**: Users on other Fediverse instances can follow Tunecamp artists and like/favorite their releases and posts.
- **Broadcasts**: When an artist publishes a new release or a post, Tunecamp broadcasts a "Create Note" activity to all followers.
- **Interoperability**: Tunecamp supports WebFinger and standard ActivityPub inboxes/outboxes.

### Implementation Details

- **Keys**: RSA 4096-bit keypairs are automatically generated for every artist.
- **Attachments**: Broadcasts include "Audio" attachments (direct stream links) and "Image" attachments (cover art).
- **Public URL**: Federation requires `TUNECAMP_PUBLIC_URL` to be correctly configured with `https`.

### Configuration

- `TUNECAMP_PUBLIC_URL`: Required for Federation.
- `TUNECAMP_RELAY_URL`: (Optional) Connect to an ActivityPub relay to broadcast beyond followers.

---

## Funkwhale Compatibility

Tunecamp is compatible with **Funkwhale** instances for music-specific federation.

### How It Works

- **NodeInfo**: Tunecamp exposes metadata at `/.well-known/nodeinfo` including Funkwhale-compatible fields (`library.federationEnabled`, `supportedUploadExtensions`, `funkwhaleVersion`).
- **Federation Libraries**: `GET /api/v1/federation/libraries` returns Tunecamp's music catalog in Funkwhale's expected format.
- **NodeInfo 2.0 API**: `GET /api/v1/instance/nodeinfo/2.0` provides instance metadata for Funkwhale-style discovery.
- **Actor Types**: Artists are exposed as `["Person", "Artist", "MusicArtist"]` with Funkwhale namespace extensions.
- **Audio Attachments**: Release broadcasts include `Audio` objects with `funkwhale:bitrate` and `funkwhale:duration` properties.

---

## Subsonic API: Client Compatibility

Tunecamp exposes a full **Subsonic REST API** at `/rest` (API version 1.16.1), enabling connection from any Subsonic-compatible client.

### Authentication Methods

| Method      | Format                        | Description             |
| :---------- | :---------------------------- | :---------------------- |
| Clear-text  | `p=password`                  | Plain password in query |
| Hex-encoded | `p=enc:hex`                   | Password hex-encoded    |
| Token+Salt  | `t=md5(password+salt)&s=salt` | Secure token-based auth |

### Scrobbling & GunDB

When a Subsonic client scrobbles a track (`scrobble.view`), Tunecamp records the play in the local database **and** increments the play count in GunDB for public/unlisted releases, enabling decentralized play statistics.

---

## Architecture Summary

| Feature              | Technology   | Scope                     |
| :------------------- | :----------- | :------------------------ |
| Artist Following     | ActivityPub  | External (Mastodon, etc)  |
| Likes / Favorites    | ActivityPub  | External (Mastodon, etc)  |
| Release Notification | ActivityPub  | External (Mastodon, etc)  |
| Funkwhale Federation | ActivityPub  | External (Funkwhale)      |
| Global Track Search  | GunDB        | Internal (Tunecamp Nodes) |
| Comments & Likes     | GunDB        | Internal (Tunecamp Nodes) |
| Playcounts           | GunDB        | Internal (Tunecamp Nodes) |
| User Playlists       | GunDB        | Internal (Tunecamp Nodes) |
| Mobile Streaming     | Subsonic API | External (Any client)     |
| Starred/Favorites    | Subsonic API | Local (per user)          |
