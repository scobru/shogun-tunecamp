# Codice Condiviso tra Tunecamp Static e Server Mode

Questo documento elenca tutto il codice che può essere **riutilizzato** o **condiviso** tra la versione statica attuale di Tunecamp e la futura versione server mode.

## 📦 Componenti Completamente Riutilizzabili

### 1. **Template Handlebars** ✅ 100% Riutilizzabile
**Percorso**: `tunecamp/templates/default/`

- `layout.hbs` - Layout principale
- `index.hbs` - Homepage con lista release
- `release.hbs` - Pagina release singola
- `assets/style.css` - Stili CSS
- `assets/player.js` - Player audio JavaScript
- `assets/theme-widget.js` - Widget tema
- `assets/community-registry.js` - Registry GunDB (già usato)
- `assets/download-stats.js` - Stats download GunDB
- `assets/unlock-codes.js` - Sistema unlock codes GunDB

**Nota**: I template possono essere usati direttamente per SSR (Server-Side Rendering) nella versione server.

---

### 2. **Template Engine** ✅ 100% Riutilizzabile
**Percorso**: `tunecamp/src/generator/templateEngine.ts`

**Classe**: `TemplateEngine`

**Funzionalità**:
- Caricamento e rendering template Handlebars
- Helper Handlebars registrati:
  - `formatDuration` - Formatta durata tracce
  - `formatAudioFormat` - Formatta tipo file audio
  - `formatDate` - Formatta date
  - `eq` - Confronto uguaglianza
  - `join` - Join array
  - `startsWith` - Controlla inizio stringa
  - `endsWith` - Controlla fine stringa
  - `or` - OR logico
  - `path` - Helper per percorsi con basePath
  - `releasePath` - Helper per percorsi release
  - `assetPath` - Helper per percorsi asset
  - `lowercase` - Minuscole

**Uso Server Mode**: 
```typescript
// Server può usare lo stesso TemplateEngine per SSR
const templateEngine = new TemplateEngine();
const html = templateEngine.renderWithLayout("release", releaseData);
```

---

### 3. **Audio Utils** ✅ 100% Riutilizzabile
**Percorso**: `tunecamp/src/utils/audioUtils.ts`

**Funzioni**:
- `readAudioMetadata(filePath)` - Legge metadati da file audio (MP3, FLAC, OGG, WAV, M4A, OPUS)
- `formatDuration(seconds)` - Formatta durata in MM:SS
- `formatFileSize(bytes)` - Formatta dimensione file
- `getAudioFormat(filename)` - Identifica formato audio

**Uso Server Mode**:
```typescript
// Server può usare per estrarre metadata durante upload
const metadata = await readAudioMetadata(uploadedFile.path);
// Salva metadata in GunDB insieme al file
```

---

### 4. **Config Utils** ✅ 90% Riutilizzabile
**Percorso**: `tunecamp/src/utils/configUtils.ts`

**Funzioni**:
- `readYamlFile<T>(filePath)` - Legge file YAML generico
- `readCatalogConfig(directory)` - Legge catalog.yaml
- `readArtistConfig(directory)` - Legge artist.yaml
- `readReleaseConfig(directory)` - Legge release.yaml
- `validateCatalogConfig(config)` - Valida config catalog
- `validateReleaseConfig(config)` - Valida config release

**Uso Server Mode**:
```typescript
// Server può usare per validare dati YAML dall'upload
// Oppure per importare catalog esistenti
const config = await readReleaseConfig(releaseDir);
validateReleaseConfig(config);
```

**Nota**: Nella versione server, i dati vengono principalmente da GunDB invece che da file YAML, ma le funzioni di validazione sono ancora utili.

---

### 5. **File Utils** ✅ 80% Riutilizzabile
**Percorso**: `tunecamp/src/utils/fileUtils.ts`

**Funzioni Riutilizzabili**:
- `findAudioFiles(directory)` - Trova file audio in directory
- `findImageFiles(directory, name?)` - Trova immagini
- `findCover(directory)` - Trova cover art
- `createSlug(text)` - Crea slug URL-friendly
- `getRelativePath(from, to)` - Percorso relativo
- `ensureDir(dir)` - Crea directory
- `copyFile(src, dest)` - Copia file
- `readFile(filePath)` - Legge file
- `writeFile(filePath, content)` - Scrive file
- `fileExists(filePath)` - Controlla esistenza file

**Uso Server Mode**:
```typescript
// Server può usare per gestire upload files
const coverPath = await findCover(uploadedDir);
const audioFiles = await findAudioFiles(releaseDir);
const slug = createSlug(releaseTitle);
```

---

### 6. **Procedural Cover Generator** ✅ 100% Riutilizzabile
**Percorso**: `tunecamp/src/generator/proceduralCoverGenerator.ts`

**Classe**: `ProceduralCoverGenerator`

**Funzionalità**:
- Genera SVG cover art procedurali basati su metadata
- Deterministico (stesso input = stesso output)
- Nessuna AI, solo algoritmi

**Uso Server Mode**:
```typescript
// Server può generare cover automaticamente se artista non ne carica una
const generator = new ProceduralCoverGenerator();
const svgCover = generator.generateCover(
  release.title,
  artist.name,
  release.date,
  release.genres
);
```

---

### 7. **Feed Generator** ✅ 90% Riutilizzabile
**Percorso**: `tunecamp/src/generator/feedGenerator.ts`

**Classe**: `FeedGenerator`

**Funzionalità**:
- Genera RSS 2.0 feed
- Genera Atom feed
- Include metadati, cover, tracce

**Uso Server Mode**:
```typescript
// Server può generare feed dinamicamente per artista
const feedGen = new FeedGenerator(catalog);
const rssFeed = feedGen.generateRssFeed(); // Genera per tutti gli artisti o per artista singolo
// Serve come stringa HTML o salva per cache
```

**Modifiche Minori**: Server mode potrebbe voler generare feed per artista singolo o per tutti gli artisti.

---

### 8. **Podcast Feed Generator** ✅ 100% Riutilizzabile
**Percorso**: `tunecamp/src/generator/podcastFeedGenerator.ts`

**Classe**: `PodcastFeedGenerator`

**Funzionalità**:
- Genera podcast RSS feed
- Compatibile con Apple Podcasts, Spotify Podcasts, etc.

**Uso Server Mode**: Stesso uso del FeedGenerator.

---

### 9. **Embed Generator** ✅ 100% Riutilizzabile
**Percorso**: `tunecamp/src/generator/embedGenerator.ts`

**Classe**: `EmbedGenerator`

**Funzionalità**:
- Genera embed code per release
- Widget completo e compatto
- HTML standalone per iframe

**Uso Server Mode**:
```typescript
// Server può generare embed dinamicamente per ogni release
const embedGen = new EmbedGenerator(catalog);
const embedCode = embedGen.generateReleaseEmbed(release);
// Serve come endpoint /api/releases/:slug/embed
```

---

### 10. **Type Definitions** ✅ 100% Riutilizzabile
**Percorso**: `tunecamp/src/types/index.ts`

**Interfaces**:
- `CatalogConfig` - Configurazione catalog
- `ArtistConfig` - Configurazione artista
- `ReleaseConfig` - Configurazione release
- `TrackMetadata` - Metadata traccia
- `StreamingLink` - Link streaming
- `Credit` - Crediti release
- `UnlockCodesConfig` - Config unlock codes
- `DownloadMode` - Modalità download
- `LicenseType` - Tipo licenza

**Uso Server Mode**:
```typescript
// Server usa gli stessi tipi per validazione e type safety
import { ReleaseConfig, ArtistConfig } from 'tunecamp/types';
```

---

### 11. **Unlock Codes System** ✅ 100% Riutilizzabile
**Percorso**: 
- `tunecamp/src/tools/generate-codes.ts`
- `tunecamp/src/tools/generate-sea-pair.ts`
- `tunecamp/templates/default/assets/unlock-codes.js`

**Funzionalità**:
- Generazione codici unlock via GunDB
- Validazione codici nel frontend
- Supporto per private space (SEA keys)

**Uso Server Mode**:
```typescript
// Server può riutilizzare gli stessi tool per generare codici
// Il frontend JavaScript rimane identico
```

---

## 🔄 Componenti da Adattare

### 1. **Site Generator** ⚠️ Da Adattare
**Percorso**: `tunecamp/src/generator/siteGenerator.ts`

**Perché**: 
- Attualmente genera file HTML statici
- Server mode deve renderizzare dinamicamente

**Adattamento**:
```typescript
// Versione statica (attuale)
await writeFile(outputPath, html);

// Versione server (nuova)
app.get('/releases/:slug', async (req, res) => {
  const release = await getReleaseFromGunDB(req.params.slug);
  const html = templateEngine.renderWithLayout("release", releaseData);
  res.send(html);
});
```

**Cosa mantenere**:
- Logica di rendering template
- Logica di generazione M3U
- Logica di generazione feed (usata dinamicamente)

**Cosa rimuovere**:
- Scrittura file su disco
- Copia file durante build
- Generazione batch

---

### 2. **Catalog Parser** ⚠️ Da Adattare
**Percorso**: `tunecamp/src/parser/catalogParser.ts`

**Perché**:
- Attualmente legge da file system (YAML files)
- Server mode legge da GunDB

**Adattamento**:
```typescript
// Versione statica (attuale)
const catalog = await catalogParser.parse(); // Legge da file system

// Versione server (nuova)
const catalog = await catalogParser.parseFromGunDB(artistPublicKey); // Legge da GunDB
```

**Cosa mantenere**:
- Logica di validazione
- Logica di parsing metadati audio
- Helper functions

**Cosa aggiungere**:
- Metodi per leggere da GunDB invece che file system
- Metodi per convertire dati GunDB in formato Catalog

---

## 📋 Struttura Codice Condiviso Suggerita

### Opzione 1: Monorepo con Pacchetti
```
tunecamp/
  packages/
    core/              # Codice condiviso
      src/
        utils/         # Audio, File, Config utils
        generator/     # TemplateEngine, FeedGenerator, etc.
        types/         # Type definitions
    static/            # Versione statica attuale
      src/
        cli.ts
        generator/
          siteGenerator.ts
        parser/
          catalogParser.ts
    server/            # Nuova versione server
      src/
        server.ts
        routes/
        gun/
          catalog.ts
          artist.ts
```

### Opzione 2: Shared Lib in stesso repo
```
tunecamp/
  src/
    shared/            # Codice condiviso
      utils/
      generator/
      types/
    static/            # Versione statica
      cli.ts
      generator/
        siteGenerator.ts
    server/            # Versione server
      server.ts
      routes/
```

---

## 🎯 Priorità Riutilizzo

### Alta Priorità (Subito Riutilizzabili)
1. ✅ Template Handlebars (100%)
2. ✅ Template Engine (100%)
3. ✅ Audio Utils (100%)
4. ✅ Type Definitions (100%)
5. ✅ Procedural Cover Generator (100%)

### Media Priorità (Piccole Modifiche)
6. ⚠️ Feed Generator (90%)
7. ⚠️ Embed Generator (90%)
8. ⚠️ Config Utils (90%)
9. ⚠️ File Utils (80%)

### Bassa Priorità (Richiedono Refactoring)
10. ⚠️ Site Generator (da adattare per SSR)
11. ⚠️ Catalog Parser (da adattare per GunDB)

---

## 💡 Vantaggi Riutilizzo

1. **Consistenza**: Stesso look & feel tra versione statica e server
2. **Manutenzione**: Bug fixes e feature nuove beneficiano entrambe le versioni
3. **Velocità Sviluppo**: ~70% del codice è già pronto
4. **Testing**: Codice già testato funziona in entrambi i contesti
5. **Documentazione**: Documentazione esistente rimane valida

---

## 🔧 Esempio Pratico: Rendering Release

### Versione Statica (Attuale)
```typescript
// src/generator/siteGenerator.ts
const html = this.templateEngine.renderWithLayout("release", data);
await writeFile(outputPath, html);
```

### Versione Server (Futura)
```typescript
// src/server/routes/releases.ts
app.get('/artists/:slug/:release', async (req, res) => {
  // 1. Leggi da GunDB (invece di file system)
  const release = await getReleaseFromGunDB(req.params.slug, req.params.release);
  
  // 2. Usa STESSO template engine
  const templateEngine = new TemplateEngine(); // Riutilizzato!
  
  // 3. Renderizza STESSO template
  const html = templateEngine.renderWithLayout("release", release); // Riutilizzato!
  
  // 4. Serve HTML invece di scrivere file
  res.send(html);
});
```

---

## 📊 Stima Riutilizzo

**Totale Codice**: ~5000 righe
**Codice Riutilizzabile**: ~3500 righe (~70%)
**Codice da Adattare**: ~1000 righe (~20%)
**Codice Nuovo**: ~500 righe (~10%)

**Conclusione**: La maggior parte del codice esistente può essere riutilizzato direttamente o con piccole modifiche! 🎉
