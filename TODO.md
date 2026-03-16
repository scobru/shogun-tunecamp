# Tunecamp Project Roadmap

## Phase 1: Core & Federation (Status: Done ✅)
- [x] **Audio Streaming**: Waveform generation and metadata extraction.
- [x] **Subsonic API**: Full compatibility with mobile clients (DSub, Symfonium, etc.).
- [x] **ActivityPub**: Fediverse integration (Mastodon, Funkwhale).
- [x] **GunDB**: Decentralized discovery, comments, and stats.
- [x] **Basic Web3 Payments**: Direct USDC/ETH transfers on Base Network for content unlocking.

## Phase 2: Wallet & Onramp Integration (Status: Planned 🚀)
- [ ] **Hybrid Freemium Business Model**:
  - **Basic Plan (Free)**: Artists can upload music for free (with storage limits, e.g., 2GB). The platform takes a 15% revenue share on sales to cover hosting and infrastructure costs.
    - *Implementation*: A dedicated Smart Contract (`TuneCampCheckout.sol`) on Base Network will instantly split payments at checkout (85% to artist, 15% to platform).
  - **Pro Plan (Paid)**: Artists pay a fixed subscription fee or purchase storage packages via Web3/Crypto for unlimited space. Artists keep 100% of their sales revenue (or pay a minimal 2-3% transaction fee).
    - *Implementation*: Direct transfer of USDC/ETH to the artist, bypassing the split contract.
- [ ] **Buy Storage Space**:
  - Implement dynamic storage quotas for artists.
  - Allow artists to purchase additional upload space (e.g., +1GB, +5GB) using USDC/ETH via the integrated Onramp.
- [ ] **Native Onramp Service**:
  - Integrate a fiat-to-crypto provider (e.g., MoonPay, Stripe Crypto, or similar).
  - Allow users to buy USDC/ETH directly with credit card inside the Tunecamp app.
- [ ] **Direct Artist Tipping**:
  - Seamless tipping button on artist profiles and track pages.
  - Support for multiple tokens (USDC, ETH, DEGEN) on Base Network.
- [ ] **Smart Wallet Creation**:
  - Abstract wallet complexity for new users using account abstraction (ERC-4337) or embedded wallets.

## Phase 3: Expansion & Ecosystem
- [ ] **Advanced Analytics**: GunDB-powered global trending charts.
- [ ] **Split Payments**: Automatic revenue sharing between collaborators on a single release.
