---
name: tunecamp-development
description: Technical knowledge and operational protocols for developing the Tunecamp decentralized music platform.
allowed-tools: WebFetch, AskUserQuestion
model: gemini-3-pro
license: MIT
metadata:
  author: tunecamp
  version: "1.2.0"
---

This skill defines the operational protocols, technical workflows, and architectural alignment for Tunecamp, a decentralized music platform featuring streaming, federation, and blockchain-based ownership.

## 1. Core Identity & Context

- **Platform Core**: Decentralized music server for artists and labels.
- **Network**: Integrated with **Base Mainnet** (Chain ID: 8453) for payments and NFTs.
- **Federation**: Powered by **ActivityPub/Fedify** for decentralized social interaction.
- **Database**: Local metadata in **SQLite**; global registry and stats in **GunDB**.

## 2. Security Mandates

- **SEA Identity**: The server identity is managed via GunDB SEA. Never expose the `gunPair` settings or the private key part of the pair.
- **Wallet Safety**: User wallets are derived deterministically from SEA keys. Private keys must NEVER leave the browser or be logged.
- **API Security**: Subsonic API tokens use `md5(password + salt)` which is more secure than legacy password auth.

## 3. Technical Workflows

### 3.1 Music Library Management (Scanner)

When adding or updating music, follow this sequence:

1. **Scan Directory**: Use `scanner.ts` to walk the music directory and detect audio files/YAML configs.
2. **Handle Configs**: Process `artist.yaml`, `catalog.yaml`, and `release.yaml` to establish metadata hierarchy.
3. **Audio Processing**: Convert WAV to MP3, parse tags, and generate waveforms via `waveform.ts`.
4. **Deduplication**: Calculate file hashes to avoid duplicate track entries across different releases.

### 3.2 Decentralized Registry & Stats (GunDB)

- **Registration**: Sites register their public URL and public key in the `tunecamp-community` namespace.
- **Stats Tracking**: Incremental counts for plays, downloads, and likes are synchronized across the P2P graph.
- **Secure Mode**: Authoritative data (profiles, tracks) is stored in the user-signed graph (`user.get('tunecamp')`).

### 3.3 Federation (ActivityPub)

- **Actor Dispatch**: Actors are mapped to `/users/{handle}` for site nodes and artists.
- **Inbox Logic**: Handles `Follow`, `Accept`, `Announce`, and `Like` activities to synchronize content and interactions across instances.
- **Discovery**: Listens for `Announce` activities containing audio attachments to discover new content in the network.

### 3.4 Blockchain Integration (Base)

- **Wallet Derivation**: Deterministic derivation from the SEA `priv` string.
- **Payment Flow**: Uses `shogun-contracts-sdk` for checkout via `TuneCampCheckout.sol`.
- **Ownership**: NFT-based ownership verification for premium content.

## 4. Architectural Alignment

- **Local Storage**: Metadata is stored in `tunecamp.db` (SQLite). Audio files are relative to the configured `musicDir`.
- **Server Config**: Settings are managed in `src/server/config.ts` and persistent in the `settings` table.
- **Folders Link**: Core smart contracts implementation: [contracts](file:///d:/shogun-2/tunecamp/contracts/).

## 5. Commands Reference

### 5.1 CLI Operations

```bash
# Start the server
npm run start server

# Scan the music library manually
npm run tunecamp scan

# Start in development mode with watch
npm run dev
```

### 5.2 Build & Style

```bash
# Build the project
npm run build

# Build CSS via Tailwind
npm run build:css
```

## 6. Implementation Reference

- **Scanner**: [scanner.ts](file:///d:/shogun-2/tunecamp/src/server/scanner.ts)
- **GunDB Service**: [gundb.ts](file:///d:/shogun-2/tunecamp/src/server/gundb.ts)
- **Fedify Integration**: [fedify.ts](file:///d:/shogun-2/tunecamp/src/server/fedify.ts)
- **Subsonic API**: [subsonic.ts](file:///d:/shogun-2/tunecamp/src/server/routes/subsonic.ts)
- **Wallet Service**: [wallet.ts](file:///d:/shogun-2/tunecamp/webapp/src/services/wallet.ts)
