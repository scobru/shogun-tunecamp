# Network & Federation

TuneCamp features rich integration with the decentralized web, primarily through ActivityPub and GunDB.

## ActivityPub

The server includes native ActivityPub support powered by `fedify`.
- **Actor Profiles**: Artists created in your library are exposed as ActivityPub actors (e.g., `@artist@yourdomain.com`).
- **Releases & Posts**: New public releases and posts are broadcasted to followers on the Fediverse (Mastodon, Pleroma, etc.).

## GunDB Integration

TuneCamp utilizes GunDB to store decentralized user data, allowing features like:
- **Decentralized Comments**: Listeners can leave comments on tracks that are not tied to a central database.
- **Global Network Directory**: Instances can auto-register to a public directory to be discovered by other TuneCamp nodes.

## Configuration

To ensure federation works correctly, configure your instance's public URL in the Admin Settings panel or via environment variables (`TUNECAMP_PUBLIC_URL`).
