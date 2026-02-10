# Network Architecture

TuneCamp employs a hybrid networking strategy to allow instances to communicate with each other and with the broader decentralized web. This architecture leverages two primary protocols: **GunDB** and **ActivityPub**.

## 1. GunDB: The TuneCamp Community Layer

GunDB is used to create a decentralized, peer-to-peer mesh network specifically for TuneCamp instances. It acts as the "connective tissue" between different TuneCamp servers, enabling discovery and interaction without a central authority.

### Key Functions
- **Service Discovery**: Each TuneCamp instance registers itself in a shared, decentralized directory. This allows your node to find other TuneCamp nodes and vice versa.
- **Global Track Registry**: When you publish a release, its metadata is pushed to the GunDB graph. This creates a searchable, global index of music across the entire network.
- **Decentralized Comments**: User comments on tracks are stored in GunDB. This means a user on Node A can comment on a track hosted on Node B, and the comment is synced across the network, visible to everyone.
- **User Profiles**: Listener profiles (usernames, avatars) are stored in GunDB, allowing users to maintain a persistent identity across different TuneCamp sites.

### Technical Implementation (`src/server/gundb.ts`)
- **Peers**: Nodes connect to a set of public relay peers (e.g., `shogun-relay.scobrudot.dev`).
- **Security**: It uses specific "namespaces" (`shogun/tunecamp-community`) and SEA (Security, Encryption, Authorization) key pairs to sign data, ensuring that only the owner of a node can update its registry entry.
- **Data Flow**: Use `Gun.user()` to write to a graph. Metadata is replicated to connected peers.

## 2. ActivityPub: The Federation Layer

ActivityPub is the standard protocol for the Fediverse (Mastodon, Lemmy, PixelFed, etc.). TuneCamp implements this protocol to treat every Artist on your instance as a fully-fledged Fediverse actor.

### Key Functions
- **Federation**: Artists on your TuneCamp instance can be searched for and followed by users on Mastodon or other ActivityPub-compatible platforms.
- **Broadcasting**: When an artist creates a new Release or Post, it is broadcast as a `Note` object to all their followers on the Fediverse.
- **Follower Management**: The system handles `Follow` requests and maintains a database of external followers (inboxes).

### Technical Implementation (`src/server/activitypub.ts`)
- **Library**: Built using `@fedify/fedify`.
- **Actors**: Each Artist is mapped to an ActivityPub `Person` actor.
- **WebFinger**: Implements the `.well-known/webfinger` endpoint so artists can be discovered via `@slug@your-domain.com`.
- **Inbox/Outbox**: Handles incoming activities (like Follows) and sends outgoing activities (Create Note) to followers' inboxes.

## Summary of Interaction

| Feature | GunDB (Internal Network) | ActivityPub (External Federation) |
| :--- | :--- | :--- |
| **Audience** | Other TuneCamp Instances | Mastodon, Pleroma, etc. |
| **Primary Goal** | Music Discovery & Comments | Social Following & Updates |
| **Data Types** | Site Info, Track Metadata, Comments | Notes (Statuses), Articles, Profiles |
| **Discovery** | Auto-discovery via Relay | Manual search via WebFinger |

In essence, **GunDB connects TuneCamp nodes to each other**, while **ActivityPub connects TuneCamp artists to the rest of the social web**.
