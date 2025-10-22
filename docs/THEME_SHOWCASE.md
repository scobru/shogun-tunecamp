# Theme Showcase

Visual comparison of all available themes for Shogun Faircamp.

## Preview Generation

To preview all themes locally, run:

```bash
# Build with default theme
yarn build
node dist/cli.js build ./examples/artist-free -o ./preview-default

# Build with minimal theme
node dist/cli.js build ./examples/artist-free -o ./preview-minimal --theme minimal

# Build with dark theme
node dist/cli.js build ./examples/artist-free -o ./preview-dark --theme dark

# Build with retro theme
node dist/cli.js build ./examples/artist-free -o ./preview-retro --theme retro

# Serve one to view
node dist/cli.js serve ./preview-retro
```

## Theme Comparison

### 1. Default Theme
**Best for:** Pop, Indie, Alternative, General use

**Color Palette:**
- Primary: Indigo (#6366f1)
- Secondary: Purple (#8b5cf6)
- Background: Dark slate (#0f172a)
- Surface: Slate (#1e293b)

**Characteristics:**
- Modern and professional
- Dark theme with purple/blue gradients
- Smooth rounded corners
- Hover effects with glowing shadows
- Sans-serif typography
- Great readability

---

### 2. Minimal Theme
**Best for:** Classical, Jazz, Acoustic, Folk, Ambient

**Color Palette:**
- Primary: Blue (#2563eb)
- Background: White (#ffffff)
- Surface: Light gray (#f8fafc)
- Text: Dark slate (#0f172a)

**Characteristics:**
- Clean and spacious
- Light theme with lots of white space
- Subtle borders
- Refined typography
- Minimal distractions
- Focus on content

---

### 3. Dark Theme
**Best for:** Rock, Metal, Punk, Heavy Music, Electronic (dark)

**Color Palette:**
- Primary: Red (#ef4444)
- Secondary: Dark red (#dc2626)
- Background: Pure black (#000000)
- Surface: Dark gray (#0a0a0a)

**Characteristics:**
- Bold and aggressive
- Pure black background
- Intense red accents
- Square corners (no rounding)
- Strong shadows with red glow
- Uppercase typography
- High contrast
- Powerful visual impact

---

### 4. Retro Theme
**Best for:** Synthwave, Vaporwave, Electronic (80s), Retro, Chiptune

**Color Palette:**
- Primary: Hot pink (#ff1493)
- Secondary: Cyan (#00ffff)
- Accent: Yellow (#ffff00)
- Background: Deep purple (#1a0033)
- Surface: Dark purple (#2d0052)

**Characteristics:**
- 80s nostalgic aesthetic
- Neon colors and glow effects
- Monospace font (Courier)
- Scanline background effect
- Animated neon pulses
- Multiple color shadows
- Cyberpunk vibes
- High energy

---

## Typography Comparison

| Theme     | Font Family                    | Style        |
|-----------|--------------------------------|--------------|
| default   | System sans-serif              | Modern       |
| minimal   | System sans-serif              | Refined      |
| dark      | System sans-serif              | Bold/Heavy   |
| retro     | Courier New (monospace)        | Nostalgic    |

## Interactive Elements

### Buttons

**default:** Gradient background with smooth hover lift
**minimal:** Outlined style with fill on hover
**dark:** Solid red with glow on hover
**retro:** Neon border with color shift animation

### Track List

**default:** Smooth highlights with purple glow
**minimal:** Subtle gray background on hover
**dark:** Red accent bar on hover/playing
**retro:** Cyan glow with horizontal slide

### Audio Player

**default:** Modern controls with gradient play button
**minimal:** Clean controls with subtle styling
**dark:** Angular controls with red accents
**retro:** Circular controls with neon effects

## Responsive Design

All themes are fully responsive and optimized for:
- Desktop (1920px+)
- Laptop (1024px - 1920px)
- Tablet (768px - 1024px)
- Mobile (< 768px)

## Browser Support

All themes work on:
- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Opera (latest 2 versions)

## Customization

Each theme uses CSS custom properties (variables) making it easy to customize colors without editing the entire stylesheet.

Example:
```css
:root {
  --primary-color: #6366f1;  /* Change this */
  --secondary-color: #8b5cf6;  /* And this */
  /* ... */
}
```

## Creating Your Own Theme

1. Copy one of the existing themes from `templates/`
2. Rename the folder to your theme name
3. Edit `assets/style.css` to change colors and styles
4. Test with: `node dist/cli.js build ./examples/artist-free -o ./test --theme yourtheme`

## Community Themes

Want to share your theme? Submit a PR with:
- Theme files in `templates/yourtheme/`
- Screenshots in `docs/screenshots/`
- Description in this file

## Theme Requests

Have an idea for a theme? Open an issue with:
- Theme name
- Target music genre
- Color palette suggestions
- Design inspiration/references

