# Creating Custom Themes

Shogun Faircamp uses Handlebars templates for theming, making it easy to create custom designs.

## Theme Structure

A theme is a directory containing:

```
my-theme/
├── layout.hbs       # Main layout (required)
├── index.hbs        # Homepage template (required)
├── release.hbs      # Release page template (required)
└── assets/
    ├── style.css    # Styles
    ├── player.js    # Audio player (optional)
    └── ...          # Other assets
```

## Template Files

### layout.hbs

The main layout wraps all pages. Must include `{{{content}}}` placeholder.

```handlebars
<!DOCTYPE html>
<html>
<head>
  <title>{{catalog.title}}</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <header>
    <h1>{{catalog.title}}</h1>
  </header>
  
  <main>
    {{{content}}}
  </main>
  
  <footer>
    <!-- Footer content -->
  </footer>
</body>
</html>
```

### index.hbs

Homepage showing all releases:

```handlebars
<div class="releases">
  {{#each releases}}
  <article class="release">
    <a href="{{url}}">
      <img src="{{coverUrl}}" alt="{{config.title}}">
      <h2>{{config.title}}</h2>
      <p>{{formatDate config.date}}</p>
    </a>
  </article>
  {{/each}}
</div>
```

### release.hbs

Individual release page:

```handlebars
<article class="release-detail">
  <h1>{{release.config.title}}</h1>
  
  {{#if release.coverUrl}}
  <img src="{{release.coverUrl}}" alt="{{release.config.title}}">
  {{/if}}
  
  <ol class="tracklist">
    {{#each release.tracks}}
    <li>
      <span>{{title}}</span>
      <span>{{formatDuration duration}}</span>
    </li>
    {{/each}}
  </ol>
</article>
```

## Available Data

### Catalog Data
- `catalog.title`
- `catalog.description`
- `catalog.url`
- `catalog.language`

### Artist Data
- `artist.name`
- `artist.bio`
- `artist.photo`
- `artist.links[]`

### Release Data
- `release.config.title`
- `release.config.date`
- `release.config.description`
- `release.config.genres[]`
- `release.config.download`
- `release.config.price`
- `release.coverUrl`
- `release.tracks[]`

### Track Data
- `track.title`
- `track.artist`
- `track.duration`
- `track.filename`
- `track.url`

## Template Helpers

Built-in Handlebars helpers:

### formatDuration
```handlebars
{{formatDuration seconds}}
<!-- Output: 3:45 -->
```

### formatDate
```handlebars
{{formatDate "2024-01-15"}}
<!-- Output: January 15, 2024 -->
```

### formatAudioFormat
```handlebars
{{formatAudioFormat "track.mp3"}}
<!-- Output: MP3 -->
```

### eq (equals)
```handlebars
{{#if (eq download "free")}}
  Free Download
{{/if}}
```

### join
```handlebars
{{join genres ", "}}
<!-- Output: Electronic, Ambient -->
```

## Using Your Theme

### Option 1: Command Line
```bash
shogun-faircamp build ./catalog -o ./public --theme my-theme
```

### Option 2: Catalog Config
```yaml
# catalog.yaml
theme: "my-theme"
```

### Option 3: Programmatic
```javascript
const generator = new ShogunFaircamp({
  inputDir: './catalog',
  outputDir: './public',
  theme: 'my-theme'
});
```

## Theme Location

Place custom themes in:
- `./templates/my-theme/` (in the project directory)
- Or specify absolute path

## Styling Tips

### CSS Variables
Use CSS custom properties for easy customization:

```css
:root {
  --primary-color: #6366f1;
  --bg-color: #0f172a;
  --text-color: #f1f5f9;
}
```

### Responsive Design
Always include viewport meta:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

Use media queries:

```css
@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
```

## Audio Player

You can customize or replace the default player. The player receives:

```javascript
window.tracks = [
  {
    url: 'track.mp3',
    title: 'Track Title',
    artist: 'Artist Name',
    duration: 225
  }
];
```

## Examples

Check the `templates/` directory for:
- `default` - Dark theme with modern design
- More themes coming soon!

## Sharing Themes

To share your theme:

1. Create a repository
2. Include all template files
3. Add a README with screenshots
4. Submit to the Shogun Faircamp themes gallery

## Best Practices

- Keep templates simple and readable
- Use semantic HTML
- Ensure accessibility (ARIA labels, alt text)
- Test on multiple screen sizes
- Optimize images and assets
- Include fallbacks for missing data
- Document custom configuration options

## Need Help?

- Check existing themes for examples
- Open an issue for questions
- Join the community discussions

