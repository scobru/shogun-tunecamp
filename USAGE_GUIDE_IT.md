# Usage Guide - Selfcamp

A static site generator for musicians and music labels, written in JavaScript/TypeScript.

## 🎯 What is Selfcamp?

Selfcamp is the JavaScript equivalent of [Faircamp](https://simonrepp.com/faircamp/) - it allows you to create beautiful and fast static websites to showcase your music without the need for databases or complex hosting.

## ✨ Key Features

- 🎵 **Audio-first**: Automatically reads metadata from your audio files
- 📦 **Zero database**: Pure static HTML generation
- 🎨 **Customizable**: Handlebars-based theming system
- 🚀 **Fast**: Static sites that load instantly
- 📱 **Responsive**: Mobile-optimized
- 🔊 **Built-in player**: Modern HTML5 audio player
- 💿 **Multi-format**: Support for MP3, FLAC, OGG, WAV, M4A, OPUS
- 🏷️ **Flexible metadata**: YAML-based configuration files

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd selfcamp
yarn install
yarn build
```

### 2. Try with the Example

```bash
# Generate the site from the example
node dist/cli.js build ./examples/artist-free -o ./output

# Start the local server
node dist/cli.js serve ./output --port 3000
```

Open http://localhost:3000 in your browser!

### 3. Create Your Catalog

```bash
# Initialize a new catalog
node dist/cli.js init ./my-music
```

This creates:

```
my-music/
├── catalog.yaml      # Catalog configuration
├── artist.yaml       # Artist information
├── releases/         # Your music releases
│   └── example-album/
│       ├── release.yaml
│       └── tracks/
└── README.md
```

### 4. Aggiungi la Tua Musica

1. **Aggiungi file audio** in `releases/album-esempio/tracks/`:

   - Formati supportati: MP3, FLAC, OGG, WAV, M4A, OPUS
   - Nominali tipo: `01-nome-traccia.mp3`, `02-altra-traccia.mp3`, ecc.

2. **Aggiungi cover art** (opzionale):

   - Metti `cover.jpg` o `cover.png` in `releases/album-esempio/`

3. **Configura i metadati**:

```yaml
# catalog.yaml
title: "La Mia Musica"
description: "Musica indipendente"
url: "https://miamusica.com"

# artist.yaml
name: "Il Tuo Nome"
bio: "La tua biografia qui"
links:
  - bandcamp: "https://tuonome.bandcamp.com"
  - spotify: "https://open.spotify.com/artist/..."

# releases/album-esempio/release.yaml
title: "Titolo Album"
date: "2024-10-21"
description: "Descrizione album"
download: "free"  # Opzioni: free, paycurtain, codes, none
genres:
  - "Electronic"
  - "Ambient"
```

### 5. Genera il Sito

```bash
node dist/cli.js build ./mia-musica -o ./public
```

### 6. Visualizza in Locale

```bash
node dist/cli.js serve ./public --port 3000
```

Apri http://localhost:3000

## 📂 Struttura del Progetto

```
shogun-faircamp/
├── src/                    # Codice sorgente TypeScript
│   ├── cli.ts             # Interfaccia command-line
│   ├── index.ts           # API principale
│   ├── types/             # Definizioni TypeScript
│   ├── utils/             # Utility (file, audio, config)
│   ├── parser/            # Parser del catalogo
│   └── generator/         # Generatore HTML
│       ├── siteGenerator.ts
│       └── templateEngine.ts
├── templates/             # Temi Handlebars
│   └── default/          # Tema di default
│       ├── layout.hbs
│       ├── index.hbs
│       ├── release.hbs
│       └── assets/
│           ├── style.css
│           └── player.js
├── examples/              # Esempi di cataloghi
│   ├── artist-free/
│   └── label/
├── docs/                  # Documentazione
│   ├── API.md
│   └── THEMES.md
└── dist/                  # Output compilato

```

## 🎨 Modalità di Download

### Download Gratuito

```yaml
download: "free"
```

Tutte le tracce disponibili per download immediato.

### Pay-What-You-Want

```yaml
download: "paycurtain"
price: 10.00
```

Prezzo suggerito ma l'utente decide quanto pagare.

### Codici Download

```yaml
download: "codes"
```

Richiede codici di download per l'accesso.

### Solo Streaming

```yaml
download: "none"
```

Solo ascolto, nessun download.

## 📝 Comandi CLI

```bash
# Genera un sito
node dist/cli.js build <directory-input> -o <directory-output>

# Inizializza nuovo catalogo
node dist/cli.js init <directory>

# Server locale
node dist/cli.js serve <directory> --port 3000

# Con tema personalizzato
node dist/cli.js build ./catalogo -o ./public --theme mio-tema

# Verbose mode
node dist/cli.js build ./catalogo -o ./public --verbose
```

## 🌐 Deployment

Il sito generato è HTML statico puro e può essere deployato ovunque:

### Netlify

```bash
# Drag & drop della cartella public su netlify.com
# Oppure con CLI:
netlify deploy --dir=public --prod
```

### Vercel

```bash
vercel --prod public
```

### GitHub Pages

```bash
cd public
git init
git add .
git commit -m "Deploy music site"
git remote add origin <url-repo>
git push -u origin main
```

### Qualsiasi hosting statico

Carica semplicemente la cartella `public` via FTP/SFTP.

## 🎨 Personalizzazione Temi

I temi usano Handlebars. Struttura minima:

```
mio-tema/
├── layout.hbs       # Layout principale
├── index.hbs        # Homepage
├── release.hbs      # Pagina release
└── assets/
    ├── style.css    # Stili
    └── player.js    # Player (opzionale)
```

Vedi [docs/THEMES.md](docs/THEMES.md) per dettagli completi.

## 💻 Uso Programmatico

```typescript
import { ShogunFaircamp } from "./dist/index.js";

const generator = new ShogunFaircamp({
  inputDir: "./mia-musica",
  outputDir: "./public",
  theme: "default",
  verbose: true,
});

await generator.build();
```

## 🔧 Sviluppo

```bash
# Installa dipendenze
yarn install

# Sviluppo con watch
yarn dev

# Build
yarn build

# Test con esempio
yarn build && node dist/cli.js build ./examples/artist-free -o ./output
```

## 📚 Documentazione

- [README.md](README.md) - Documentazione completa
- [QUICKSTART.md](QUICKSTART.md) - Guida rapida in inglese
- [docs/API.md](docs/API.md) - Documentazione API
- [docs/THEMES.md](docs/THEMES.md) - Guida ai temi
- [CONTRIBUTING.md](CONTRIBUTING.md) - Come contribuire

## 🐛 Troubleshooting

### "Cannot find catalog.yaml"

Assicurati che il file `catalog.yaml` esista nella directory di input.

### "No tracks found"

- Verifica che i file audio siano in un formato supportato
- Controlla che siano nella cartella `tracks/` o nella cartella della release
- Verifica i permessi dei file

### Errori di build

Esegui con modalità verbose:

```bash
node dist/cli.js build ./catalogo -o ./public --verbose
```

## 📄 Formati Audio Supportati

- **MP3** - Più compatibile
- **FLAC** - Qualità lossless
- **OGG Vorbis** - Open source
- **WAV** - Non compresso
- **M4A/AAC** - Apple/iTunes
- **OPUS** - Moderna codifica efficiente

## 🎯 Casi d'Uso

- **Musicisti indipendenti**: Condividi la tua musica senza commissioni
- **Etichette**: Catalogo multi-artista
- **Band**: Discografia completa con streaming e download
- **Podcast**: Distribuzione episodi audio
- **Sound designer**: Portfolio di sound design
- **Field recording**: Collezioni di registrazioni ambientali

## 🆚 Vantaggi vs Servizi Commerciali

| Caratteristica    | Shogun Faircamp   | Bandcamp           | SoundCloud       |
| ----------------- | ----------------- | ------------------ | ---------------- |
| Costi             | Gratis            | Commissioni        | Limiti/Ads       |
| Hosting           | Tuo controllo     | Loro piattaforma   | Loro piattaforma |
| Personalizzazione | Totale            | Limitata           | Molto limitata   |
| File audio        | Tutti disponibili | Solo con pagamento | Stream only      |
| Database          | Nessuno           | Cloud              | Cloud            |
| Privacy           | Totale            | Raccolgono dati    | Raccolgono dati  |

## 🤝 Contribuire

Contributi benvenuti! Vedi [CONTRIBUTING.md](CONTRIBUTING.md).

## 📜 Licenza

MIT License - vedi file [LICENSE](LICENSE)

## 🙏 Crediti

Ispirato a [Faircamp](https://simonrepp.com/faircamp/) di Simon Repp.

## 🔗 Link Utili

- [Faircamp originale](https://simonrepp.com/faircamp/)
- [Handlebars Documentation](https://handlebarsjs.com/)
- [YAML Syntax](https://yaml.org/)

## 💡 Suggerimenti

1. **Usa nomi file descrittivi**: `01-intro.mp3` è meglio di `track1.mp3`
2. **Aggiungi metadati nei file audio**: Il generatore li leggerà automaticamente
3. **Cover art quadrate**: Usa immagini 1:1 (es. 3000x3000px)
4. **Testa in locale**: Usa sempre `serve` prima di deployare
5. **Versiona il tuo catalogo**: Usa Git per tracciare le modifiche

## 📞 Supporto

- Apri una issue su GitHub
- Consulta la documentazione
- Controlla gli esempi nella cartella `examples/`

---

**Buona creazione musicale! 🎵🚀**
