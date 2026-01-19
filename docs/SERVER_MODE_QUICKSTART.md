# Tunecamp Server Mode - Quick Start

## 🎵 Overview

Tunecamp Server Mode è una versione multi-artista self-hosted di Tunecamp. Gli artisti possono registrarsi, caricare le loro release e tracce, e il server genera dinamicamente le pagine (usando gli stessi template della versione statica).

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd tunecamp
npm install
npm run build
```

### 2. Start Server

```bash
npm run server
```

Il server sarà disponibile su `http://localhost:3000`

### 3. Environment Variables

Crea un file `.env` (opzionale):

```env
PORT=3000
STORAGE_PATH=./storage
SERVER_TITLE=Tunecamp Server
SERVER_DESCRIPTION=Multi-artist music platform
GUN_PEERS=https://gun.defucc.me/gun,https://gun.o8.is/gun
```

### 4. Register an Artist

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "myartist",
    "password": "mypassword",
    "profile": {
      "name": "My Artist",
      "bio": "Artist biography"
    }
  }'
```

### 5. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "myartist",
    "password": "mypassword"
  }'
```

Riceverai un `publicKey` che puoi usare per le chiamate autenticate.

### 6. Create a Release

```bash
curl -X POST http://localhost:3000/api/me/releases \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Album",
    "date": "2024-01-15",
    "description": "An amazing album",
    "download": "free",
    "genres": ["Electronic", "Ambient"]
  }'
```

### 7. Upload Cover Art

```bash
curl -X POST http://localhost:3000/api/me/releases/my-first-album/cover \
  -F "cover=@/path/to/cover.jpg"
```

### 8. Upload Tracks

```bash
curl -X POST http://localhost:3000/api/me/releases/my-first-album/tracks \
  -F "track=@/path/to/01-track.mp3"
```

### 9. View Release

Visita `http://localhost:3000/artists/myartist/my-first-album` nel browser!

## 📂 File Structure

```
storage/
  {artistPublicKey}/
    releases/
      {releaseSlug}/
        cover.jpg
        tracks/
          01-track.mp3
          02-track.flac
```

## 🔐 Authentication

Attualmente, l'autenticazione usa GunDB SEA. Il client deve:
1. Fare login per ottenere il `publicKey`
2. Usare il `publicKey` come token (da migliorare con JWT/sessions)

**TODO**: Implementare JWT tokens o session-based authentication per una migliore sicurezza.

## 🌐 API Endpoints

### Public Routes

- `GET /` - Homepage (lista artisti)
- `GET /artists/:slug` - Pagina artista
- `GET /artists/:slug/:release` - Pagina release
- `GET /api/artists` - Lista artisti (JSON)
- `GET /api/artists/:slug/releases` - Lista release artista (JSON)

### Authenticated Routes

- `POST /api/auth/register` - Registrazione
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Profilo corrente
- `PUT /api/me` - Aggiorna profilo
- `GET /api/me/releases` - Mie release
- `POST /api/me/releases` - Crea release
- `GET /api/me/releases/:slug` - Dettagli release
- `PUT /api/me/releases/:slug` - Aggiorna release
- `DELETE /api/me/releases/:slug` - Elimina release
- `POST /api/me/releases/:slug/cover` - Upload cover
- `POST /api/me/releases/:slug/tracks` - Upload traccia
- `DELETE /api/me/releases/:slug/tracks/:filename` - Elimina traccia

## 🎨 Features

- ✅ Multi-artista support
- ✅ Autenticazione GunDB SEA
- ✅ Upload cover art
- ✅ Upload tracce audio (MP3, FLAC, OGG, WAV, M4A, OPUS)
- ✅ Metadata extraction automatica
- ✅ SSR con template Handlebars esistenti
- ✅ Storage locale file
- ✅ API REST completa

## 🚧 TODO / Known Issues

- [ ] JWT/Session authentication (attualmente usa solo GunDB SEA)
- [ ] Admin panel frontend
- [ ] Upload progress tracking
- [ ] Image resizing/optimization
- [ ] Audio transcoding
- [ ] CDN integration
- [ ] Caching strategy
- [ ] Rate limiting
- [ ] File validation più robusto
- [ ] Delete track implementation
- [ ] Batch upload

## 📝 Notes

- Il server usa gli stessi template Handlebars della versione statica
- I file vengono salvati localmente in `./storage`
- GunDB viene usato per metadati e autenticazione
- I file audio non vengono processati, solo salvati (metadata extraction automatica)

## 🆘 Troubleshooting

### Port already in use
```bash
PORT=3001 npm run server
```

### Storage directory issues
```bash
mkdir -p storage
chmod 755 storage
```

### GunDB connection issues
Controlla che i peer siano raggiungibili. Puoi usare peer personalizzati:
```env
GUN_PEERS=https://your-gun-peer.com/gun
```

## 🔗 Related Documentation

- [Server Mode Design](./SERVER_MODE.md)
- [Shared Code](./SHARED_CODE.md)
