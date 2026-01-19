# Tunecamp Server Mode - Design Document

## Overview

Tunecamp Server Mode è una versione multi-artista di Tunecamp che trasforma il generatore statico in una piattaforma self-hosted per ospitare più artisti, simile a Navidrome ma per la distribuzione di musica (come Bandcamp self-hosted).

## Architettura

### Componenti Principali

1. **Backend Server** (Node.js/Express)
   - API REST per gestione artisti, release, tracce
   - Autenticazione via GunDB SEA
   - Storage file (locale o S3-compatible)
   - Rendering dinamico delle pagine (non pre-generate)

2. **Database Decentralizzato** (GunDB)
   - Profili artisti (username, bio, links, settings)
   - Catalogo release per artista
   - Metadati tracce
   - Autenticazione e autorizzazione
   - Settings globali del server

3. **Frontend Dinamico**
   - Reuse dei template Handlebars esistenti
   - Rendering server-side (SSR) o client-side con API
   - Admin panel per artisti
   - Public-facing pages per artisti e release

### Stack Tecnologico

- **Backend**: Node.js + Express
- **Database**: GunDB (già usato in Tunecamp)
- **Storage**: File system locale o S3-compatible (MinIO, Cloudflare R2, etc.)
- **Templates**: Handlebars (reuse dei template esistenti)
- **Authentication**: GunDB SEA (Secure Encryption Algorithm)

## Funzionalità

### Per gli Artisti

1. **Registrazione e Autenticazione**
   - Registrazione con username/password (stored in GunDB)
   - Login con GunDB SEA
   - Gestione profilo (name, bio, photo, links, donationLinks)

2. **Gestione Release**
   - Creazione nuova release (title, date, description, cover)
   - Upload cover art (auto-resize se necessario)
   - Upload tracce audio (MP3, FLAC, OGG, WAV, etc.)
   - Configurazione download (free, paycurtain, codes, none)
   - Gestione streaming links
   - Setting genres, credits, license
   - Unlisted releases

3. **Admin Panel**
   - Dashboard con statistiche (download counts, views)
   - Editor YAML visuale per release
   - Preview delle pagine prima della pubblicazione
   - Gestione tracce (reorder, edit metadata)

### Per gli Utenti Finali

1. **Discovery**
   - Homepage con tutti gli artisti registrati
   - Browse per artista
   - Browse per genere
   - Search releases

2. **Pagina Artista**
   - Profilo artista (bio, photo, links)
   - Lista release
   - Social links
   - Donation links

3. **Pagina Release**
   - Stesso layout delle versioni statiche
   - Player audio integrato
   - Download (se abilitato)
   - Streaming links
   - Embed codes

4. **Community Features**
   - Community player (già esistente, esteso)
   - Community directory (già esistente)
   - Real-time updates

## Struttura Dati GunDB

```
shogun/
  tunecamp-server/
    artists/
      {artistPublicKey}/
        profile/
          name: string
          bio: string
          photo: string
          links: array
          donationLinks: array
          slug: string
          settings: object
        releases/
          {releaseSlug}/
            config: ReleaseConfig (YAML-like object)
            tracks: array
            cover: string (path)
            createdAt: timestamp
            updatedAt: timestamp
        stats/
          totalReleases: number
          totalDownloads: number
    server/
      settings/
        title: string
        description: string
        domain: string
        allowRegistration: boolean
        storagePath: string
```

## API Endpoints

### Public API
```
GET  /                           # Homepage
GET  /artists                    # Lista artisti
GET  /artists/:slug              # Pagina artista
GET  /artists/:slug/:release     # Pagina release
GET  /api/releases               # API releases (JSON)
GET  /api/artists/:slug/releases # API releases artista
```

### Authenticated API (Artist)
```
POST   /api/auth/register        # Registrazione
POST   /api/auth/login           # Login
GET    /api/me                   # Profilo corrente
PUT    /api/me                   # Aggiorna profilo

GET    /api/me/releases          # Mie release
POST   /api/me/releases          # Crea release
GET    /api/me/releases/:slug    # Dettagli release
PUT    /api/me/releases/:slug    # Aggiorna release
DELETE /api/me/releases/:slug    # Elimina release

POST   /api/me/releases/:slug/tracks    # Upload tracce
POST   /api/me/releases/:slug/cover     # Upload cover
DELETE /api/me/releases/:slug/tracks/:id # Elimina traccia
```

### Admin API (Optional)
```
GET  /api/admin/stats            # Statistiche server
GET  /api/admin/artists          # Lista artisti (admin)
PUT  /api/admin/artists/:key     # Modifica artista (admin)
```

## Flusso di Upload

1. **Upload Release Cover**
   - Artist uploads image
   - Server validates (size, format)
   - Server stores in `storage/{artistPublicKey}/releases/{slug}/cover.{ext}`
   - Server creates thumbnails if needed
   - Metadata saved to GunDB

2. **Upload Track**
   - Artist uploads audio file
   - Server validates format (MP3, FLAC, etc.)
   - Server extracts metadata using `music-metadata` (già in use)
   - Server stores in `storage/{artistPublicKey}/releases/{slug}/tracks/{filename}`
   - Track metadata saved to GunDB
   - Optional: server can generate waveforms for visualization

## Storage Strategy

### File System Layout
```
storage/
  {artistPublicKey}/
    profile/
      photo.jpg
    releases/
      {releaseSlug}/
        cover.jpg
        tracks/
          01-track.mp3
          02-track.flac
        artwork/
          waveform.svg (optional)
```

### Alternative: Object Storage
- S3-compatible storage (MinIO, Cloudflare R2, AWS S3)
- GunDB stores only paths/URLs
- CDN integration per delivery veloce

## Rendering Dinamico

### Server-Side Rendering (SSR)
- Reuse dei template Handlebars esistenti
- Render on-demand quando viene richiesta la pagina
- Cache HTML per performance (opzionale)
- Invalidate cache quando artista aggiorna release

### Hybrid Approach
- Static files per assets (CSS, JS)
- SSR per HTML pages
- API JSON per client-side rendering (opzionale)

## Sicurezza

1. **Authentication**
   - GunDB SEA per password hashing
   - JWT tokens o GunDB sessions
   - Rate limiting per uploads

2. **Authorization**
   - Solo artista può modificare le proprie release
   - Admin può moderare (opzionale)

3. **File Upload**
   - Validation file type
   - Size limits
   - Virus scanning (opzionale)
   - Secure filename handling

4. **Storage**
   - Files accessibili solo via server
   - Optional: signed URLs per download protetti

## Implementazione

### Fase 1: Core Server
- [ ] Setup Express server
- [ ] GunDB integration per storage
- [ ] Authentication system
- [ ] Basic API endpoints
- [ ] Reuse template rendering

### Fase 2: Artist Features
- [ ] Registration/login
- [ ] Profile management
- [ ] Release creation (metadata only)
- [ ] File upload (cover + tracks)
- [ ] Release editing

### Fase 3: Public Pages
- [ ] Homepage con lista artisti
- [ ] Artist pages
- [ ] Release pages (reuse templates)
- [ ] Search e browse

### Fase 4: Admin Panel
- [ ] Dashboard artisti
- [ ] Visual editor per release
- [ ] Statistics
- [ ] Settings

### Fase 5: Advanced Features
- [ ] CDN integration
- [ ] Caching strategy
- [ ] Waveform generation
- [ ] Bulk operations
- [ ] Import da Tunecamp static catalogs

## Vantaggi

1. **Reuse di Codice**: Template e logica esistenti possono essere riutilizzati
2. **Decentralizzato**: GunDB già integrato, no database tradizionale
3. **Scalabile**: Storage può essere distribuito
4. **Open Source**: Self-hosted, privacy-first
5. **Familiarità**: Artist che conoscono Tunecamp si trovano a loro agio

## Sfide

1. **Storage Management**: Gestire grandi quantità di file audio
2. **Performance**: Rendering dinamico vs static pre-generated
3. **Bandwidth**: Delivery file audio può essere costoso
4. **Backup**: Strategia backup per GunDB e storage files
5. **Moderation**: Se pubblico, necessita moderazione contenuti

## Possibili Estensioni

- **Subscriptions**: Artist subscription tiers
- **Analytics**: Detailed stats per artisti
- **Social Features**: Comments, likes, follows
- **Monetization**: Payment processing integrato
- **Mobile App**: API-first permette app mobile
- **Podcast Mode**: Automatic podcast feed generation
- **Live Streaming**: Integration con streaming services

## Conclusioni

Tunecamp Server Mode può essere un'evoluzione naturale del progetto, trasformando Tunecamp da tool per artisti singoli a piattaforma self-hosted multi-artista. Il reuse di template e logica esistenti rende l'implementazione più semplice, mentre GunDB fornisce un backend decentralizzato senza bisogno di database tradizionale.
