# Material Expressive Design System (Google 2026)

Questo documento definisce l'identità visiva e le linee guida UI/UX per l'ecosistema Shogun, ispirato all'evoluzione "Expressive Bloom" del Material Design. Il focus è su forme organiche, accessibilità ad alto contrasto, tipografia fluida e micro-interazioni tattili.

## 🎨 Identità Visiva

### 1. Palette Colori (Tonalità Dinamiche e State Layers)

Il sistema abbandona le tinte piatte a favore di un approccio tonale, garantendo un'elevata leggibilità. I colori interagiscono tramite _State Layers_ (livelli di opacità sovrapposti per indicare gli stati di interazione).

- **Primary (Vibrant Lime)**: `#D4E157` — Usato per FAB, azioni primarie e slider.
- **On-Primary (Deep Charcoal)**: `#131314` — Colore del testo o delle icone posizionate sopra elementi Primary per garantire il massimo contrasto.
- **Accent (Muted Pink/Lavender)**: `#F4B4CE` — Usato per indicatori di stato, switch e accenti espressivi secondari.
- **Superfici (Surfaces)**:
  - `base-100`: `#131314` (Background principale)
  - `base-200`: `#1E1F20` (Card di primo livello, Sidebar)
  - `base-300`: `#2B2C2E` (Modali, Dropdown, Elementi attivi)

### 2. Tipografia Variabile e Ritmica

L'uso di font variabili permette transizioni di peso fluide senza caricare file aggiuntivi.

| Elemento                 | Font Family       | Peso (Weight)   | Spaziatura (Tracking) | Altezza Linea (Leading) |
| :----------------------- | :---------------- | :-------------- | :-------------------- | :---------------------- |
| **Display / Eroi**       | `Outfit Variable` | Bold (700)      | `-0.03em`             | `1.1`                   |
| **Intestazioni (H1-H4)** | `Outfit Variable` | Semi-Bold (600) | `-0.01em`             | `1.2`                   |
| **Body / Paragrafi**     | `Inter Variable`  | Regular (400)   | `0.0em`               | `1.6`                   |
| **Label / Bottoni**      | `Inter Variable`  | Medium (500)    | `+0.01em`             | `1.0` (Centrato)        |

---

## 📐 Layout e Superfici

### 1. Sistema di Forme (Curvatura Adattiva)

Le forme sono fluide e comunicano l'importanza e l'interattività dell'elemento.

- **Completamente Arrotondati (`rounded-full`)**: Bottoni, Chip, Indicatori attivi.
- **Arrotondamento Ampio (`rounded-[28px]` o `3xl`)**: Card generiche, Immagini in evidenza, Moduli ampi.
- **Asimmetrici (Expressive)**: `rounded-tr-[32px] rounded-bl-[32px] rounded-tl-xl rounded-br-xl` per elementi creativi o chat bubbles.

### 2. Altitudine (Elevation) ed Effetti "Gloom"

Il Material Expressive 2026 sostituisce le ombre nette con il **Surface Toning** (cambio di luminosità) e i **Color Glows** (ombre colorate e diffuse per trasmettere energia).

- **Elevation 0**: Nessun bordo, sfondo `base-100`.
- **Elevation 1 (Card)**: Sfondo `base-200` + bordo interno di `1px` semitrasparente (`rgba(255,255,255,0.05)`).
- **Elevation 2 (Floating/Modali)**: Sfondo `base-300` + **Gloom effect** `shadow-[0_8px_40px_-12px_rgba(212,225,87,0.15)]`.

---

## 🧩 Interazioni e Componenti

### 1. Movimento ed Easing (Curve Espressive)

Le animazioni devono sembrare fisiche, con un'accelerazione rapida e una decelerazione morbida.

- **Standard Easing**: `cubic-bezier(0.2, 0.0, 0, 1.0)` (Durata `300ms`). Da usare per quasi tutto.
- **Emphasized Decelerate**: `cubic-bezier(0.05, 0.7, 0.1, 1.0)` (Durata `500ms`). Da usare per l'apertura di modali o l'ingresso di nuove pagine.

### 2. Pulsanti e Azioni

- **State Layers**:
  - _Hover_: Aggiunge un overlay bianco all'8% sul colore di base.
  - _Press/Active_: Aggiunge un overlay nero al 12% sul colore di base e riduce la scala `scale-95`.
- **FAB (Floating Action Button)**: Deve sempre avere il _Gloom effect_ del colore primario per staccarsi visivamente dal fondo.

### 3. Navigazione

- **Top Bar (Material Glass)**: Non più completamente trasparente, ma un `backdrop-blur-xl` abbinato a un `base-100` con opacità al 70%.
- **Bottom Nav**: Indicatori a forma di "Pill" che si espandono in larghezza quando attivi, ospitando sia l'icona che il testo dell'etichetta (animati).

---

## 🛠️ Tailwind & DaisyUI Config Aggiornata

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        display: ["Outfit", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        "gloom-primary": "0 8px 40px -12px rgba(212,225,87,0.25)",
        "gloom-accent": "0 8px 40px -12px rgba(244,180,206,0.25)",
      },
      transitionTimingFunction: {
        "material-standard": "cubic-bezier(0.2, 0.0, 0, 1.0)",
        "material-emphasized": "cubic-bezier(0.05, 0.7, 0.1, 1.0)",
      },
    },
  },
  daisyui: {
    themes: [
      {
        materialExpressive: {
          primary: "#D4E157", // Vibrant Lime
          "primary-content": "#131314", // Testo su bottoni primari
          secondary: "#F4B4CE", // Soft Pink
          "secondary-content": "#131314",
          accent: "#C1E8FF", // Light Blue
          neutral: "#1E1F20",
          "base-100": "#131314", // Core Surface / App background
          "base-200": "#1E1F20", // Surface Container (Cards)
          "base-300": "#2B2C2E", // Surface Container High (Modals)
          "base-content": "#E3E3E3", // Testo principale
          info: "#7CAFEC",
          success: "#B9E9B3",
          warning: "#F1E5AC",
          error: "#F3B4AD",

          "--rounded-box": "1.75rem", // 28px per le card
          "--rounded-btn": "9999px", // Formato Pill per bottoni
          "--rounded-badge": "9999px",

          "--animation-btn": "0.3s", // Usa il material-standard timing
          "--animation-input": "0.2s",
          "--btn-focus-scale": "0.95", // Effetto pressione fisico
          "--border-btn": "0px", // Rimozione bordi nativi per stile flat/gloom
        },
      },
    ],
  },
};
```

## 📚 Esempio di Component

```javascript
<button
  class="btn btn-primary rounded-full px-8 hover:brightness-110 hover:shadow-gloom-primary transition-all ease-material-standard duration-300"
>
  Inizia Ora
</button>

<button
  class="btn bg-base-300 text-base-content border-none rounded-full px-8 hover:bg-base-300/80 transition-all ease-material-standard duration-300"
>
  Scopri di più
</button>

<button
  class="btn btn-primary btn-circle h-16 w-16 fixed bottom-6 right-6 shadow-gloom-primary hover:scale-105 active:scale-95 transition-all ease-material-emphasized duration-500"
>
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
</button>

<div
  class="card bg-base-200 w-96 rounded-[28px] border border-white/5 overflow-hidden transition-all ease-material-standard duration-300 hover:shadow-gloom-accent hover:-translate-y-1"
>
  <figure>
    <img
      src="[https://placehold.co/600x400](https://placehold.co/600x400)"
      alt="Immagine Card"
      class="w-full object-cover h-48"
    />
  </figure>
  <div class="card-body p-6">
    <h2 class="card-title font-display text-2xl tracking-tight text-white">
      Titolo Espressivo
    </h2>
    <p class="text-base-content/70 font-body">
      Questa card utilizza un arrotondamento ampio e reagisce all'hover con un
      delicato gloom effect colorato.
    </p>
    <div class="card-actions justify-end mt-4">
      <button class="btn btn-secondary rounded-full">Azione</button>
    </div>
  </div>
</div>

<div class="form-control w-full max-w-xs">
  <label class="label">
    <span class="label-text font-medium text-base-content/80"
      >Indirizzo Email</span
    >
  </label>
  <input
    type="email"
    placeholder="nome@shogun.com"
    class="input bg-base-200 border border-white/5 rounded-2xl focus:border-primary focus:ring-1 focus:ring-primary focus:bg-base-300 transition-all ease-material-standard duration-200"
  />
</div>

<div
  class="btm-nav bg-base-100/80 backdrop-blur-xl border-t border-white/5 h-20 pb-2"
>
  <button
    class="text-base-content/60 hover:text-base-content transition-colors"
  >
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    </svg>
    <span class="btm-nav-label text-xs mt-1 font-medium">Home</span>
  </button>

  <button class="text-primary active">
    <div class="bg-primary/20 px-5 py-1 rounded-full mb-1">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
      >
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
    </div>
    <span class="btm-nav-label text-xs font-medium">Esplora</span>
  </button>

  <button
    class="text-base-content/60 hover:text-base-content transition-colors"
  >
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
    <span class="btm-nav-label text-xs mt-1 font-medium">Profilo</span>
  </button>
</div>
```
