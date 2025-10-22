# Deployment Guide - Selfcamp

## Problema Risolto

Gli stili e gli script non si caricavano correttamente quando il sito veniva pubblicato su piattaforme come GitHub Pages, Netlify o Vercel, specialmente quando il sito era servito da una sottocartella invece che dalla root del dominio.

## Soluzione

È stata aggiunta l'opzione `basePath` che permette di configurare il percorso base dove il sito sarà pubblicato.

## Come Usare

### Opzione 1: Configurazione nel catalog.yaml

Aggiungi il campo `basePath` nel tuo file `catalog.yaml`:

```yaml
title: "Il Mio Catalogo"
description: "Le mie release musicali"
url: "https://ilmiosito.com"
basePath: "" # Lascia vuoto per deployment nella root, usa "/nome-repo" per sottocartelle
theme: "default"
language: "it"
```

### Opzione 2: Flag da CLI

Puoi anche specificare il `basePath` quando costruisci il sito:

```bash
shogun-faircamp build ./mio-catalogo --output ./public --basePath /mio-repo
```

## Esempi Pratici

### GitHub Pages (sito progetto)

Se il tuo sito sarà su `username.github.io/mio-repo/`:

```yaml
basePath: "/mio-repo"
```

Poi costruisci:

```bash
shogun-faircamp build . --output ./public
```

### Dominio personalizzato (root)

Se il tuo sito sarà su `miosito.com/`:

```yaml
basePath: ""
```

Oppure ometti completamente il campo `basePath`.

### Deployment in sottocartella

Se il tuo sito sarà su `miosito.com/musica/`:

```yaml
basePath: "/musica"
```

## Valori del basePath

| Tipo di Deployment | Valore basePath | URL Esempio |
|-------------------|-----------------|-------------|
| Dominio root | `""` (vuoto) | `https://miosito.com/` |
| Sottocartella | `"/cartella"` | `https://esempio.com/musica/` |
| GitHub Pages (progetto) | `"/nome-repo"` | `https://user.github.io/repo/` |
| GitHub Pages (utente) | `""` (vuoto) | `https://user.github.io/` |

**Importante**: Inizia sempre con `/` e non terminare mai con `/`

✓ Corretto: `basePath: "/mia-musica"`  
✗ Sbagliato: `basePath: "mia-musica"` o `basePath: "/mia-musica/"`

## Verifica

Dopo aver ricostruito il sito, controlla i file HTML generati. I percorsi dovrebbero essere simili a:

**Senza basePath** (root):
```html
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/player.js"></script>
```

**Con basePath `/mio-repo`**:
```html
<link rel="stylesheet" href="/mio-repo/assets/style.css">
<script src="/mio-repo/assets/player.js"></script>
```

## Risoluzione Problemi

### Gli stili non si caricano

1. Apri la console del browser (F12)
2. Vai alla tab "Network"
3. Cerca errori 404 sui file CSS/JS
4. Confronta i percorsi richiesti con il percorso effettivo di deployment
5. Correggi il `basePath` di conseguenza

### Esempio pratico

Se il browser cerca `/assets/style.css` ma il tuo sito è su `/mio-repo/`:
- Il file CSS dovrebbe essere a `/mio-repo/assets/style.css`
- Imposta `basePath: "/mio-repo"` e ricostruisci

## Test Locale

Per testare localmente con un basePath specifico:

```bash
# Costruisci con il basePath
shogun-faircamp build . --output ./public --basePath /mio-repo

# Servi con un server HTTP
cd public
python -m http.server 8000

# Visita http://localhost:8000/mio-repo/ nel browser
```

## Workflow GitHub Actions (Esempio)

```yaml
name: Deploy Sito

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Installa Shogun Faircamp
        run: npm install -g shogun-faircamp
      
      - name: Costruisci il sito
        run: shogun-faircamp build . --output ./public --basePath /mio-repo
      
      - name: Deploy su GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

## Migrazione Siti Esistenti

Se hai già un sito generato prima di questa correzione:

1. Determina dove è pubblicato il tuo sito
2. Aggiungi il `basePath` appropriato in `catalog.yaml`
3. Ricostruisci: `shogun-faircamp build . --output ./public`
4. Ricarica i file sul tuo servizio di hosting
5. Verifica che tutto funzioni correttamente

## Documentazione Completa

Per maggiori dettagli, consulta:
- [Guida al Deployment (inglese)](./docs/DEPLOYMENT.md)
- [README principale](./README.md)
- [Changelog](./CHANGELOG.md)

## Supporto

Se hai ancora problemi:
1. Controlla gli [Issues su GitHub](https://github.com/yourusername/shogun-faircamp/issues)
2. Apri un nuovo issue con:
   - La tua configurazione `catalog.yaml`
   - La piattaforma di deployment che stai usando
   - Eventuali messaggi di errore dalla console del browser

