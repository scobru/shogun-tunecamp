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

### 2. Genera i codici per la tua release

```bash
npx ts-node src/tools/generate-codes.ts mia-release --count 20
```

Output esempio:
```
🔐 Tunecamp Unlock Codes Generator
================================
Release: mia-release
Count: 20

✅ Generated 20 codes:
──────────────────────────────────────────────────
    1. ABCD-1234-EFGH
    2. JKLM-5678-NPQR
    3. STUV-9ABC-WXYZ
    ...
──────────────────────────────────────────────────
```

### 3. Configura la release

Nel tuo `release.yaml`:

```yaml
title: "La Mia Release"
date: "2024-01-15"
download: codes   # <-- Imposta 'codes' come modalità download
unlockCodes:
  enabled: true
  namespace: tunecamp  # Opzionale, default: tunecamp
```

### 4. Genera il sito

```bash
npm run build
node dist/cli.js build ./mio-catalogo -o ./output
```

---

## 📖 Come Funziona

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Artista    │────>│    GunDB     │<────│     Fan      │
│ Genera codici│     │ Peer Pubblici│     │ Valida codice│
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                     ┌──────┴──────┐
                     │ Decentraliz │
                     │    zato!    │
                     └─────────────┘
```

1. **Generazione**: L'artista genera codici con lo script CLI
2. **Storage**: I codici (hashati) vengono salvati su GunDB
3. **Sincronizzazione**: I peer pubblici sincronizzano i dati
4. **Validazione**: Il fan inserisce il codice nella pagina release
5. **Verifica**: JavaScript verifica il codice via GunDB
6. **Download**: Se valido, il download viene sbloccato

---

## ⚙️ Opzioni CLI

```bash
npx ts-node src/tools/generate-codes.ts <slug> [opzioni]

Opzioni:
  --count <n>       Numero di codici (default: 10)
  --downloads <n>   Download massimi per codice (default: 1)
  --expires <days>  Giorni di validità (opzionale)
  --output <file>   Salva codici in file
  --namespace <ns>  Namespace GunDB (default: tunecamp)
```

### Esempi

```bash
# 50 codici per "album-2024"
npx ts-node src/tools/generate-codes.ts album-2024 --count 50

# 100 codici con 3 download ciascuno, scadenza 30 giorni
npx ts-node src/tools/generate-codes.ts album-2024 --count 100 --downloads 3 --expires 30

# Salva codici in file
npx ts-node src/tools/generate-codes.ts album-2024 --count 50 --output codici.txt
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
Sì! I codici vengono hashati con SHA-256 prima del salvataggio. Solo l'hash è visibile su GunDB.

### Cosa succede se i peer sono offline?
GunDB usa localStorage come cache. Se hai già visitato la pagina, funzionerà offline.

### Posso usare il mio relay?
Sì! Aggiungi il tuo URL nel campo `peers` della configurazione.

### Un codice può essere usato da più persone?
Dipende da `--downloads`. Con `--downloads 3`, il codice funziona per 3 download.

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
