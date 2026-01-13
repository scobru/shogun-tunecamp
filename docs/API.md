# API Documentation

Tunecamp can be used programmatically in your JavaScript/TypeScript projects.

## Installation

```bash
npm install tunecamp
# or
yarn add tunecamp
```

## Basic Usage

```typescript
import { Tunecamp } from "tunecamp";

const generator = new Tunecamp({
  inputDir: "./my-catalog",
  outputDir: "./public",
  theme: "default",
  verbose: true,
});

await generator.build();
```

## API Reference

### Tunecamp Class

Main class for generating sites.

#### Constructor

```typescript
constructor(options: BuildOptions)
```

**Parameters:**

```typescript
interface BuildOptions {
  inputDir: string; // Input directory with catalog
  outputDir: string; // Output directory for generated site
  theme?: string; // Theme name (default: 'default')
  verbose?: boolean; // Enable verbose logging
}
```

#### Methods

##### build()

Builds the static site.

```typescript
async build(): Promise<void>
```

**Example:**

```typescript
const generator = new Tunecamp({
  inputDir: "./catalog",
  outputDir: "./dist",
});

try {
  await generator.build();
  console.log("Build successful!");
} catch (error) {
  console.error("Build failed:", error);
}
```

## Type Definitions

### CatalogConfig

```typescript
interface CatalogConfig {
  title: string;
  description?: string;
  url?: string;
  basePath?: string;
  theme?: string;
  language?: string;
  headerImage?: string; // Header image path (replaces title text, like Bandcamp)
  customFont?: string; // Custom font URL (e.g., Google Fonts) or local file path
  customCSS?: string; // Custom CSS file path (relative to input directory) or URL
  labelMode?: boolean;
  podcast?: PodcastConfig;
  metadata?: Record<string, any>;
}

interface PodcastConfig {
  enabled?: boolean;
  title?: string;
  description?: string;
  author?: string;
  email?: string;
  category?: string;
  image?: string;
  explicit?: boolean;
}
```

### ArtistConfig

```typescript
interface ArtistConfig {
  name: string;
  bio?: string;
  photo?: string;
  links?: ArtistLink[];
  metadata?: Record<string, any>;
}

interface ArtistLink {
  [platform: string]: string;
}
```

### ReleaseConfig

```typescript
interface ReleaseConfig {
  title: string;
  date: string;
  description?: string;
  cover?: string;
  download?: DownloadMode;
  unlockCodes?: UnlockCodesConfig;
  price?: number;
  genres?: string[];
  credits?: Credit[];
  unlisted?: boolean;
  artistSlug?: string;
  metadata?: Record<string, any>;
}

type DownloadMode = "free" | "paycurtain" | "codes" | "none";

interface UnlockCodesConfig {
  enabled: boolean;
  namespace?: string;
  peers?: string[];
}

interface Credit {
  role: string;
  name: string;
}
```

### TrackMetadata

```typescript
interface TrackMetadata {
  file: string;
  filename: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  track?: number;
  duration?: number;
  format?: string;
  bitrate?: number;
  sampleRate?: number;
  description?: string;
  genre?: string[];
}
```

## Advanced Usage

### Custom Build Pipeline

```typescript
import { Tunecamp, CatalogParser, SiteGenerator } from "tunecamp";

// Parse catalog
const parser = new CatalogParser("./my-catalog");
const catalog = await parser.parse();

// Modify catalog data
catalog.releases = catalog.releases.filter((r) => r.config.date > "2023-01-01");

// Generate site
const generator = new SiteGenerator(catalog, {
  inputDir: "./my-catalog",
  outputDir: "./public",
  theme: "custom",
});

await generator.generate();
```

### Integration with Build Tools

#### Vite Plugin Example

```typescript
import { Tunecamp } from "tunecamp";
import type { Plugin } from "vite";

export function tunecampPlugin(): Plugin {
  return {
    name: "vite-plugin-tunecamp",
    async buildStart() {
      const generator = new Tunecamp({
        inputDir: "./catalog",
        outputDir: "./dist/music",
      });
      await generator.build();
    },
  };
}
```

#### Webpack Plugin Example

```typescript
import { Tunecamp } from "tunecamp";

class TunecampPlugin {
  apply(compiler) {
    compiler.hooks.beforeCompile.tapAsync(
      "TunecampPlugin",
      async (params, callback) => {
        const generator = new Tunecamp({
          inputDir: "./catalog",
          outputDir: "./dist/music",
        });
        await generator.build();
        callback();
      }
    );
  }
}

module.exports = TunecampPlugin;
```

### Node.js Script

```javascript
#!/usr/bin/env node

const { Tunecamp } = require("tunecamp");
const path = require("path");

async function buildCatalog() {
  const catalogDir = process.argv[2] || "./catalog";
  const outputDir = process.argv[3] || "./public";

  console.log(`Building catalog from ${catalogDir}...`);

  const generator = new Tunecamp({
    inputDir: path.resolve(catalogDir),
    outputDir: path.resolve(outputDir),
    verbose: true,
  });

  try {
    await generator.build();
    console.log("✅ Build complete!");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

buildCatalog();
```

## Error Handling

```typescript
import { Tunecamp } from "tunecamp";

try {
  const generator = new Tunecamp({
    inputDir: "./catalog",
    outputDir: "./public",
  });

  await generator.build();
} catch (error) {
  if (error.message.includes("catalog.yaml")) {
    console.error("Missing or invalid catalog configuration");
  } else if (error.message.includes("release")) {
    console.error("Invalid release configuration");
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Utilities

The package also exports utility functions:

```typescript
import {
  readAudioMetadata,
  formatDuration,
  formatFileSize,
  createSlug,
} from "tunecamp";

// Read audio file metadata
const metadata = await readAudioMetadata("./track.mp3");

// Format duration
const formatted = formatDuration(185); // "3:05"

// Create URL-safe slug
const slug = createSlug("My Album Title"); // "my-album-title"
```

## TypeScript Support

Tunecamp is written in TypeScript and includes full type definitions.

```typescript
import type {
  Catalog,
  Release,
  BuildOptions,
  CatalogConfig,
  ArtistConfig,
  ReleaseConfig,
  PodcastConfig,
} from "tunecamp";
```

## Examples

See the `/examples` directory in the repository for complete examples of:

- Artist catalogs
- Label catalogs
- Custom integrations
- Build scripts

## Support

For API questions or issues:

- Check the [GitHub repository](https://github.com/scobru/tunecamp)
- Open an issue
- Join discussions
