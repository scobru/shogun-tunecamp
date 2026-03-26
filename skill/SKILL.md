# Tunecamp Development Skills

This document provides essential technical information for developing and maintaining the Tunecamp platform.

## GunDB (Decentralized Database)
Tunecamp uses [GunDB](https://gun.eco/) for community registry, track discovery, and real-time statistics (plays, downloads, likes).

- **Implementation**: [gundb.ts](file:///d:/shogun-2/tunecamp/src/server/gundb.ts)
- **Key Concepts**:
  - **Peers**: Connected nodes in the graph. Default peers are defined in `REGISTRY_PEERS`.
  - **SEA (Security, Encryption, Authorization)**: Used for server/user identity. Each instance generates a deterministic SEA pair stored in the database settings (`gunPair`).
  - **Graphs**:
    - `shogun/tunecamp-community/sites`: Public directory of instances.
    - `shogun/tunecamp-stats`: Public statistics graph.
    - `user.get('tunecamp')`: Authoritative user-signed graph for profiles and tracks.
- **Recovery**: Includes automatic `radata` clearance on JSON corruption errors.

## Subsonic API
Tunecamp implements a compatible Subsonic API (v1.16.1) to support various mobile and desktop clients (DSub, Ample, etc.).

- **Implementation**: [subsonic.ts](file:///d:/shogun-2/tunecamp/src/server/routes/subsonic.ts)
- **Extensions**: Supports [OpenSubsonic](https://opensubsonic.netlify.app/) extensions (e.g., `X-OpenSubsonic-Server` header).
- **Authentication**: Supports both legacy password and modern salt/token (`md5(password + salt)`) methods.
- **Key Endpoints**:
  - `/rest/ping.view`: Connectivity check.
  - `/rest/getIndexes.view` / `/rest/getArtists.view`: Browsing hierarchy.
  - `/rest/stream.view`: Audio streaming.
  - `/rest/scrobble.view`: Playback reporting (also increments GunDB play counts).

## Fedify & ActivityPub
Federation is powered by [Fedify](https://fedify.dev/), allowing Tunecamp instances to communicate with the Fediverse (Mastodon, Funkwhale, etc.).

- **Implementation**: [fedify.ts](file:///d:/shogun-2/tunecamp/src/server/fedify.ts)
- **Actor Model**:
  - `/users/site`: Representative actor for the instance.
  - `/users/{slug}`: Individual artist actors.
- **Activities**:
  - `Follow`/`Accept`: Management of remote followers.
  - `Announce`: Used for content discovery (Notes with audio attachments).
  - `Like`: Social interaction synchronization.
- **Storage**: Uses `BetterSqliteKvStore` ([fedify-kv.ts](file:///d:/shogun-2/tunecamp/src/server/fedify-kv.ts)) for Fedify internal state.

## Blockchain & Ethereum (Base)
Tunecamp integrates with the Ethereum ecosystem (specifically the **Base** L2) for payments and digital ownership.

- **Implementation**: [wallet.ts](file:///d:/shogun-2/tunecamp/webapp/src/services/wallet.ts), [useWalletStore.ts](file:///d:/shogun-2/tunecamp/webapp/src/stores/useWalletStore.ts)
- **Wallet Derivation**: Deterministically derives an Ethereum wallet from the GunDB SEA `priv` key. This ensures the user's decentralized identity is unified across the graph and the chain.
- **Smart Contracts**: Implementation and deployment scripts are located in the [contracts](file:///d:/shogun-2/tunecamp/contracts/) folder. Core contracts include `TuneCampCheckout.sol`, `TuneCampFactory.sol`, and `TuneCampNFT.sol`. Tunecamp interacts with `shogun-contracts-sdk` for checkout and NFT ownership verification.
- **Network**: Defaults to Base Mainnet (Chain ID 8453).

## External Metadata (MusicBrainz)
Tunecamp integrates with [MusicBrainz](https://musicbrainz.org/) to fetch high-quality metadata and cover art for tracks and releases.

- **Implementation**: [metadata.ts](file:///d:/shogun-2/tunecamp/src/server/metadata.ts)
- **Features**:
  - **Search**: Search for releases and recordings via the MusicBrainz API.
  - **Cover Art**: Automatic cover art resolution via the [Cover Art Archive](https://coverartarchive.org/).
  - **Matching UI**: [MetadataMatchModal.tsx](file:///d:/shogun-2/tunecamp/webapp/src/components/MetadataMatchModal.tsx) allows admins to manually match tracks to MusicBrainz records.

## Core Systems
- **Scanner**: [scanner.ts](file:///d:/shogun-2/tunecamp/src/server/scanner.ts) handles importing local music folders, parsing metadata, and generating waveforms.
- **Authentication**: [auth.ts](file:///d:/shogun-2/tunecamp/src/server/auth.ts) provides JWT-based session management and identity verification.
- **Database**: [database.ts](file:///d:/shogun-2/tunecamp/src/server/database.ts) uses SQLite (better-sqlite3) for local metadata storage.
