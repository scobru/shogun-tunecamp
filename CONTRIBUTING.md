# Contributing to Shogun Faircamp

Thank you for your interest in contributing to Shogun Faircamp! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/shogun-faircamp.git
cd shogun-faircamp
```

2. **Install dependencies:**
```bash
npm install
# or
yarn install
```

3. **Build the project:**
```bash
npm run build
```

4. **Link for local testing:**
```bash
npm link
```

## Project Structure

```
shogun-faircamp/
├── src/
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   ├── parser/          # Catalog parsing logic
│   ├── generator/       # Site generation logic
│   ├── index.ts         # Main API
│   └── cli.ts           # Command-line interface
├── templates/
│   └── default/         # Default theme
│       ├── *.hbs        # Handlebars templates
│       └── assets/      # CSS and JS
└── examples/            # Example catalogs
```

## Making Changes

1. **Create a branch:**
```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes and test:**
```bash
npm run build
npm test  # when tests are available
```

3. **Test with examples:**
```bash
shogun-faircamp build ./examples/artist-free -o ./test-output
```

4. **Commit your changes:**
```bash
git add .
git commit -m "Description of changes"
```

5. **Push and create a pull request:**
```bash
git push origin feature/your-feature-name
```

## Coding Standards

- Use TypeScript for all source code
- Follow the existing code style
- Add comments for complex logic
- Keep functions small and focused
- Use descriptive variable names

## Adding Features

### New Template Helpers

Add helpers in `src/generator/templateEngine.ts`:

```typescript
Handlebars.registerHelper('yourHelper', (arg) => {
  // Your helper logic
});
```

### New Configuration Options

1. Add type definitions in `src/types/index.ts`
2. Update parsing logic in `src/parser/catalogParser.ts`
3. Update generation logic in `src/generator/siteGenerator.ts`
4. Document in README.md

### New Themes

1. Create a new directory in `templates/`
2. Add required templates: `layout.hbs`, `index.hbs`, `release.hbs`
3. Add assets in `assets/` subdirectory
4. Document in a README within the theme directory

## Testing

Currently, testing is done manually. We welcome contributions to add automated tests!

## Documentation

- Update README.md for user-facing changes
- Add examples for new features
- Comment complex code

## Code of Conduct

- Be respectful and inclusive
- Help others learn and grow
- Focus on constructive feedback

## Questions?

Open an issue for questions or discussions!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

