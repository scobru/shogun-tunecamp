# Themes / Temi Grafici

Shogun Faircamp supporta diversi temi grafici per personalizzare l'aspetto del tuo sito musicale.

## Temi Disponibili

### 1. **default** (Tema Predefinito)
Un tema scuro e moderno con gradienti viola e blu. Perfetto per un look professionale e contemporaneo.

**Caratteristiche:**
- Colori: Indigo (#6366f1) e viola (#8b5cf6)
- Sfondo scuro con superfici grigio scuro
- Design pulito e moderno con bordi arrotondati
- Effetti hover con ombre luminose

### 2. **minimal** (Minimalista)
Un tema chiaro e pulito con molto spazio bianco. Ideale per chi preferisce un approccio minimalista ed elegante.

**Caratteristiche:**
- Colori: Blu (#2563eb) su sfondo bianco
- Design leggero con bordi sottili
- Tipografia raffinata con font sans-serif
- Estetica pulita e spaziosa

### 3. **dark** (Scuro Aggressivo)
Un tema scuro intenso con accenti rossi vibranti. Perfetto per generi musicali come rock, metal, electronic.

**Caratteristiche:**
- Colori: Rosso (#ef4444) su sfondo nero assoluto
- Design audace con bordi quadrati
- Tipografia bold e uppercase
- Effetti glow e ombre rosse intense

### 4. **retro** (Anni '80)
Un tema ispirato agli anni '80 con colori neon e effetti nostalgici. Ideale per synthwave, vaporwave, e musica elettronica retro.

**Caratteristiche:**
- Colori: Rosa neon (#ff1493), ciano (#00ffff), giallo (#ffff00)
- Sfondo viola scuro con effetti scanline
- Font monospace (Courier)
- Effetti neon glow e animazioni luminose
- Ombre colorate e bordi multipli

## Come Usare un Tema

### Metodo 1: Configurazione nel catalog.yaml

Aggiungi il campo `theme` nella sezione `catalog` del tuo file `catalog.yaml`:

```yaml
catalog:
  title: "My Music Label"
  description: "Independent music for free souls"
  language: "en"
  theme: "dark"  # Cambia questo per scegliere il tema
  basePath: ""

artist:
  name: "Artist Name"
  bio: "Bio goes here"
```

### Metodo 2: Opzione da riga di comando

Puoi specificare il tema quando generi il sito:

```bash
shogun-faircamp build --theme retro
```

**Nota:** L'opzione da riga di comando ha precedenza sulla configurazione nel `catalog.yaml`.

## Personalizzazione

Se vuoi creare il tuo tema personalizzato:

1. Crea una nuova cartella in `templates/` con il nome del tuo tema (es. `templates/mytheme/`)

2. Aggiungi i file necessari:
   ```
   templates/mytheme/
   ├── layout.hbs       # Template principale
   ├── index.hbs        # Pagina index
   ├── release.hbs      # Pagina dettaglio release
   └── assets/
       ├── style.css    # Stili CSS
       └── player.js    # Player audio
   ```

3. Copia i file da uno dei temi esistenti come base e personalizza i colori e lo stile nel file `style.css`

4. Usa il tuo tema specificando il nome della cartella:
   ```yaml
   catalog:
     theme: "mytheme"
   ```

## Variabili CSS

Ogni tema utilizza variabili CSS (CSS custom properties) per i colori principali. Puoi modificare facilmente i colori editando le variabili `:root` nel file `style.css`:

```css
:root {
  --primary-color: #6366f1;
  --secondary-color: #8b5cf6;
  --bg-color: #0f172a;
  --surface-color: #1e293b;
  --text-color: #f1f5f9;
  --text-muted: #94a3b8;
  --border-color: #334155;
  --success-color: #10b981;
}
```

## Anteprima dei Temi

Per vedere come appare il tuo sito con diversi temi, genera il sito più volte con temi diversi:

```bash
# Genera con tema default
shogun-faircamp build

# Genera con tema minimal
shogun-faircamp build --theme minimal --output ./output-minimal

# Genera con tema dark
shogun-faircamp build --theme dark --output ./output-dark

# Genera con tema retro
shogun-faircamp build --theme retro --output ./output-retro
```

Poi apri i file `index.html` nelle rispettive cartelle di output per confrontare i temi.

## Suggerimenti per Genere Musicale

**Consigliati per genere:**
- **Rock/Metal/Punk:** `dark`
- **Electronic/Synthwave/Vaporwave:** `retro`
- **Classical/Jazz/Acoustic:** `minimal`
- **Pop/Indie/Alternative:** `default`

## Supporto Browser

Tutti i temi sono ottimizzati per i browser moderni e sono completamente responsive su dispositivi mobili.

**Browser supportati:**
- Chrome/Edge (versioni recenti)
- Firefox (versioni recenti)
- Safari (versioni recenti)
- Opera (versioni recenti)
