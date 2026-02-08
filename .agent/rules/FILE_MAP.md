# File Map

## Root Directory
-   `src/`: TypeScript source code (Node.js/CLI/Server).
-   `webapp/`: Frontend React application (Vite/TypeScript).
-   `templates/`: Handlebars themes for static site generation.
-   `docs/`: Project documentation.
-   `examples/`: Sample catalogs for testing.
-   `dist/`: Compiled JavaScript output (from `src/`).
-   `scripts/`: Utility scripts.

## `src/` - Source Code
-   `cli.ts`: Main entry point for the CLI tool.
-   `index.ts`: Library exports.
-   `generator/`: Static site generation logic.
-   `server/`: Server mode implementation (Express/Fedify/GunDB).
    -   `server.ts`: Express server setup.
    -   `activitypub.ts`: Federation/ActivityPub logic.
    -   `database.ts`: SQLite database connection and operations.
    -   `gundb.ts`: GunDB integration for comments and stats.
    -   `routes/`: API and page routes.
        -   `admin.ts`: Admin dashboard and management.
        -   `releases.ts`: Release and track management.
        -   `auth.ts`: Authentication and user management.
        -   `stats.ts`: Library and network statistics.
        -   `subsonic.ts`: Subsonic API compatibility layer.
-   `utils/`: Shared helper functions (metadata, file system).
-   `types/`: TypeScript type definitions.

## `webapp/` - Web Application
-   `src/`: Frontend source code.
    -   `main.tsx`: React entry point.
    -   `App.tsx`: Main application component.
    -   `pages/`: SPA page components.
    -   `components/`: Reusable UI components and modals.
    -   `services/`: API and GunDB interaction logic.
    -   `stores/`: State management (Zustand).
-   `public/`: Static assets for the web application.
-   `index.html`: Main HTML template for Vite.

## `templates/` - Themes
-   `default/`: The default theme (Handlebars).
    -   `index.hbs`: Homepage template.
    -   `release.hbs`: Release page template.
    -   `layout.hbs`: Base layout.
    -   `assets/`: Theme-specific CSS and JS.
