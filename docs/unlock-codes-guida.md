# Tunecamp Unlock Codes - Guida per Neofiti

## 📋 Panoramica

Il sistema Unlock Codes permette di proteggere i download delle tue release con codici univoci, validati in modo **decentralizzato** usando GunDB e peer pubblici. Non serve un server backend!

---

## 🚀 Quick Start

### 1. Installa le dipendenze

```bash
cd tunecamp
npm install gun
```

### 2. Genera una coppia di chiavi SEA (raccomandato)

Per salvare i codici nel tuo spazio privato GunDB invece che pubblico:

```bash
npx ts-node src/tools/generate-sea-pair.ts
```

Questo creerà `gundb-keypair.json` con le tue chiavi di autenticazione. **Mantieni questo file segreto!**

### 3. Genera i codici per la tua release

**Con autenticazione (spazio privato - raccomandato):**
```bash
npx ts-node src/tools/generate-codes.ts mia-release --count 20 --keypair ./gundb-keypair.json
```

**Senza autenticazione (spazio pubblico - per test):**
```bash
npx ts-node src/tools/generate-codes.ts mia-release --count 20
```

Output esempio (con autenticazione):
```
🔐 Tunecamp Unlock Codes Generator
================================
Release: mia-release
Count: 20
🔒 Using authenticated private space

Connecting to GunDB peers...
Authenticating with SEA pair...
✅ Authenticated successfully

Generating 20 codes...
  Progress: 20/20

Syncing to peers...

✅ Generated 20 codes:
──────────────────────────────────────────────────
    1. ABCD-1234-EFGH
    2. JKLM-5678-NPQR
    3. STUV-9ABC-WXYZ
    ...
──────────────────────────────────────────────────

🔒 Codes stored in your private GunDB space
   Only you can access and manage these codes
```

### 4. Configura la release

Nel tuo `release.yaml`:

```yaml
title: "La Mia Release"
date: "2024-01-15"
download: codes   # <-- Imposta 'codes' come modalità download
unlockCodes:
  enabled: true
  namespace: tunecamp  # Opzionale, default: tunecamp
```

### 5. Genera il sito

```bash
npm run build
node dist/cli.js build ./mio-catalogo -o ./output
```

---

## 📖 Come Funziona

### Spazio Privato (Raccomandato)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Artista    │────>│    GunDB     │<────│     Fan      │
│ Genera codici│     │ Peer Pubblici│     │ Valida codice│
│ (autenticato)│     │ (spazio priv)│     │ (pubblico)   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                     ┌──────┴──────┐
                     │ Decentraliz │
                     │    zato!    │
                     └─────────────┘
```

1. **Generazione coppia**: L'artista genera una coppia SEA con `generate-sea-pair.ts`
2. **Generazione codici**: L'artista genera codici autenticandosi con la coppia SEA
3. **Storage privato**: I codici (hashati) vengono salvati nello spazio privato GunDB dell'artista
4. **Sincronizzazione**: I peer pubblici sincronizzano i dati (crittografati)
5. **Validazione**: Il fan inserisce il codice nella pagina release
6. **Verifica**: JavaScript verifica il codice via GunDB (accesso pubblico in sola lettura)
7. **Download**: Se valido, il download viene sbloccato

**Vantaggi dello spazio privato:**
- Solo tu puoi modificare/gestire i codici
- I codici sono crittografati nel tuo spazio privato
- Maggiore sicurezza e controllo

---

## ⚙️ Opzioni CLI

### Generare coppia SEA

```bash
npx ts-node src/tools/generate-sea-pair.ts [opzioni]

Opzioni:
  --output <file>   File di output (default: ./gundb-keypair.json)
  --help, -h        Mostra aiuto
```

### Generare codici

```bash
npx ts-node src/tools/generate-codes.ts <slug> [opzioni]

Opzioni:
  --count <n>       Numero di codici (default: 10)
  --downloads <n>   Download massimi per codice (default: 1)
  --expires <days>  Giorni di validità (opzionale)
  --keypair <file>  File con coppia SEA per spazio privato (raccomandato)
  --output <file>   Salva codici in file
  --namespace <ns>  Namespace GunDB (default: tunecamp)
```

### Esempi

```bash
# 1. Genera coppia SEA (una volta sola)
npx ts-node src/tools/generate-sea-pair.ts

# 2. Genera 50 codici nello spazio privato
npx ts-node src/tools/generate-codes.ts album-2024 --count 50 --keypair ./gundb-keypair.json

# 3. 100 codici con 3 download ciascuno, scadenza 30 giorni (spazio privato)
npx ts-node src/tools/generate-codes.ts album-2024 --count 100 --downloads 3 --expires 30 --keypair ./gundb-keypair.json

# 4. Salva codici in file
npx ts-node src/tools/generate-codes.ts album-2024 --count 50 --keypair ./gundb-keypair.json --output codici.txt

# 5. Spazio pubblico (solo per test, non raccomandato)
npx ts-node src/tools/generate-codes.ts album-2024 --count 50
```

---

## 🔧 Configurazione Avanzata

### Peer Personalizzati

Se hai il tuo relay GunDB (es. shogun-relay):

```yaml
# release.yaml
unlockCodes:
  enabled: true
  peers:
    - "https://tuo-relay.com/gun"
    - "https://gun-manhattan.herokuapp.com/gun"
```

### Namespace Multipli

Per separare cataloghi diversi:

```yaml
# release.yaml
unlockCodes:
  enabled: true
  namespace: mio-catalogo-unico
```

---

## 🎨 Personalizzazione UI

Il form di sblocco è stilizzato in `style.css`. Modifica le classi:

- `.unlock-codes-section` - Container principale
- `.unlock-header` - Titolo e icona
- `.code-input-group` - Input + bottone
- `.unlock-success` - Stato di successo
- `.unlock-error` - Messaggio di errore

---

## ❓ FAQ

### I codici sono sicuri?
Sì! I codici vengono hashati con SHA-256 prima del salvataggio. Solo l'hash è visibile su GunDB. Con lo spazio privato, i dati sono anche crittografati.

### Perché usare lo spazio privato?
Lo spazio privato ti permette di:
- Controllare chi può modificare i codici (solo tu)
- Crittografare i dati nel tuo spazio personale
- Gestire meglio la sicurezza dei tuoi codici

### Cosa succede se i peer sono offline?
GunDB usa localStorage come cache. Se hai già visitato la pagina, funzionerà offline.

### Posso usare il mio relay?
Sì! Aggiungi il tuo URL nel campo `peers` della configurazione.

### Un codice può essere usato da più persone?
Dipende da `--downloads`. Con `--downloads 3`, il codice funziona per 3 download.

### Devo rigenerare la coppia SEA?
Solo se:
- Hai perso il file `gundb-keypair.json`
- Il file è stato compromesso
- Vuoi creare un nuovo account GunDB

**Nota**: Se rigeneri la coppia, i codici vecchi non saranno più accessibili!

---

## 🆘 Troubleshooting

**"GunDB not loaded"**
- Verifica che il CDN di GunDB sia accessibile
- Controlla la console del browser per errori

**"Invalid code"**
- Verifica che il codice sia stato generato per quella release
- I codici sono case-insensitive

**"Code already used"**
- Il codice ha raggiunto il limite di download
- Genera nuovi codici se necessario

---

## 📁 File di Riferimento

| File | Descrizione |
|------|-------------|
| `src/tools/generate-codes.ts` | CLI per generare codici |
| `templates/default/assets/unlock-codes.js` | Client GunDB lato browser |
| `templates/default/release.hbs` | Template con UI sblocco |
| `templates/default/assets/style.css` | Stili CSS per UI |
