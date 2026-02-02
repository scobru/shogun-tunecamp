# Verifica porting legacy-src → webapp (React/Vite)

## Riepilogo

Il porting da `legacy-src` (HTML + JS vanilla) alla webapp React/Vite è **completo** a livello di route, funzionalità principali e API. Sono state aggiunte le funzioni API mancanti e il flusso di first-time admin setup.

---

## Route e pagine

| Legacy (hash) | Nuova app (path) | Pagina | Stato |
|---------------|------------------|--------|--------|
| `#/` | `/` | Home | ✅ |
| `#/search` | `/search` | Search | ✅ |
| `#/network` | `/network` | Network | ✅ |
| `#/albums` | `/albums` | Albums | ✅ |
| `#/album/:id` | `/albums/:id` | AlbumDetails | ✅ |
| `#/artists` | `/artists` | Artists | ✅ |
| `#/artist/:id` | `/artists/:id` | ArtistDetails | ✅ |
| `#/tracks` | `/tracks` | Tracks | ✅ |
| `#/stats` | `/stats` | Stats | ✅ |
| `#/browser` / `#/browser/:path` | `/browser` (path via `?path=`) | Files | ✅ |
| `#/playlists` | `/playlists` | Playlists | ✅ |
| `#/playlist/:id` | `/playlists/:id` | PlaylistDetails | ✅ |
| `#/post/:slug` | `/post/:slug` | Post | ✅ |
| `#/admin` | `/admin` | Admin | ✅ |
| `#/support` | `/support` | Support | ✅ |

**Nota:** Il browser (Files) usa `?path=...` invece di `#/browser/subpath`; comportamento equivalente.

---

## Moduli e funzionalità

### API (`js/api.js` → `src/services/api.ts`)
- Auth: login, logout, getAuthStatus, **setup** (aggiunto)
- Catalog: getCatalog, getSiteSettings, search
- Library: albums, artists, tracks, playlists, getStreamUrl, getLyrics, recordPlay
- Admin: releases, uploads, settings, **getAdminSettings** (aggiunto), rescan, consolidate, getAdminStats
- Browser: getBrowser
- Stats: getRecentPlays, getTopTracks, getTopArtists, getListeningStats
- Network: getNetworkSites, getNetworkTracks
- Comments: getComments, postComment, deleteComment
- Identity: getIdentity, importIdentity, **getArtistIdentity** (aggiunto)
- Users: getUsers, createUser, updateUser, deleteUser, resetUserPassword
- Unlock: validateUnlockCode, createUnlockCodes, getUnlockCodes
- Posts: getArtistPosts, getPostBySlug, createPost, deletePost

### Player (`js/player.js` → `usePlayerStore` + PlayerBar, QueuePanel, LyricsPanel, Waveform)
- Queue, play/pause, prev/next, volume, progress
- Waveform con hover e click per seek
- Lyrics panel, Queue panel
- recordPlay su play

### Auth utente (Gun)
- `js/user-auth.js` → `src/services/gun.ts` + useAuthStore
- Login/Register community (Gun), Login admin (API)

### Utils Gleam
- `js/gleam-string-utils.js` → `src/utils/gleam.ts`
- escapeHtml, formatTimeAgo, slugify, generateTrackSlug, getFileExtension, sanitizeFilename
- In legacy esistono anche `normalize_url`, `pad_left`, `validate_username`: non usati nella nuova app; si possono aggiungere in `gleam.ts` se servono.

### PWA / Service worker
- Legacy: `legacy-src/sw.js` (cache per app legacy)
- Nuova app: `public/sw.js` (tunecamp-v2, cache per `/assets/`, cover API, navigate → index.html) + `src/pwa.ts` che registra `/sw.js`

### Modali
- Login/Admin/User/Register: `AuthModal.tsx` (con **first-time setup** se il backend indica “no admin”)
- Add to playlist: `PlaylistModal.tsx` (evento `open-playlist-modal`)
- Unlock download: `UnlockModal.tsx`
- Admin: AdminReleaseModal, AdminArtistModal, AdminUserModal, UploadTracksModal, CreatePostModal, CreatePlaylistModal

### Sidebar e layout
- Nav come in legacy (Home, Search, Network, Library, Support)
- Link “Files” (browser) visibile solo se admin
- Footer con Login/Logout e link Admin

---

## Correzioni applicate

1. **API**
   - Aggiunto `API.setup(username, password)` per first-time admin.
   - Aggiunto `API.getAdminSettings()` per impostazioni admin (opzionale se il backend differenzia da getSiteSettings).
   - Aggiunto `API.getArtistIdentity(artistId)` per export identity per artista (usabile in Admin Artists).

2. **AuthModal**
   - Se il login admin fallisce con messaggio che indica assenza di admin (es. “setup”, “no admin”, “first”), viene mostrato il pulsante “Create Admin Account” che chiama `API.setup` con le credenziali inserite.

---

## File legacy non riportati come codice

- `legacy-src/index.html`: struttura e modali sostituiti da React (App, MainLayout, modali).
- `legacy-src/css/style.css`, `input.css`: stili sostituiti da Tailwind + `index.css` / `App.css`.
- `legacy-src/tunecamp.svg`: asset; nella nuova app si usa il placeholder con icona (Music) in Sidebar; si può copiare `tunecamp.svg` in `public/` se si vuole lo stesso logo.

---

## Conclusione

Il porting è **completo**. Route, player, auth (user + admin + setup), API, modali, sidebar e PWA sono coperti. Le uniche aggiunte effettuate sono le tre funzioni API e il flusso di first-time admin nell’AuthModal.
