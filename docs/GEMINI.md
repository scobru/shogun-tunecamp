# GEMINI.md: Project TuneCamp

This document provides a comprehensive overview of the TuneCamp project, its structure, and key operational commands to facilitate development and interaction with the Gemini CLI.

## Project Overview

TuneCamp is a decentralized music platform designed for musicians and labels to host and share their music. It runs as a persistent Node.js server that provides a full-featured web application for music streaming, library management, user accounts, and federated social features.

-   **Server Mode**: Provides a modern web interface for music streaming, Subsonic API support for mobile apps, and ActivityPub integration for federation with the Fediverse.

The project is a monorepo-like structure containing the main server/CLI application and a separate frontend web application.

### Key Technologies

-   **Backend**:
    -   Language: **TypeScript**
    -   Framework: **Node.js** with **Express.js**
    -   Database: **GunDB** (for decentralized features like comments and unlock codes) and **better-sqlite3** (for server-side data).
    -   Audio Processing: `music-metadata` and `fluent-ffmpeg`.
-   **Frontend (`webapp/`)**:
    -   Framework: **React** (with TypeScript/TSX)
    -   Build Tool: **Vite**
    -   Styling: **Tailwind CSS** with **DaisyUI**
    -   State Management: **Zustand**
-   **Configuration**: Environment variables and database settings.
-   **Deployment**: Recommended deployment via **Docker**.

## Directory Structure

-   `src/`: The core backend and CLI logic written in TypeScript.
    -   `src/cli.ts`: The main entry point for CLI commands.
    -   `src/server/`: The Express.js server implementation.
    -   `src/parser/`: Logic for parsing audio metadata and configuration.
-   `webapp/`: The source code for the React-based frontend application.
-   `docs/`: Project documentation.
-   `examples/`: Example music directory structures for users.
-   `package.json`: Defines dependencies and scripts for the backend/CLI.
-   `webapp/package.json`: Defines dependencies and scripts for the frontend application.

## Building and Running

### Full-Stack Development Setup

To run the full application (backend server + frontend dev server), you will need two separate terminal sessions.

**1. Backend/CLI:**

These commands are run from the project root.

```bash
# 1. Install root dependencies
npm install

# 2. Build the TypeScript code
npm run build

# 3. To run the server
node dist/cli.js server ./music
```

**2. Frontend (`webapp/`):**

These commands are run from the `webapp` directory.

```bash
# 1. Navigate to the webapp directory
cd webapp

# 2. Install frontend dependencies
npm install

# 3. Start the Vite development server
npm run dev
```

### Production Build

To create a production-ready build of both the backend and frontend:

```bash
# 1. Build the backend
npm run build

# 2. Build the frontend
cd webapp
npm run build
cd ..
```

### Docker

The project is designed to be run using Docker, which is the recommended method for production deployment.

```bash
# Make sure to configure docker-compose.yml first
docker-compose up -d
```

## Development Conventions

-   **Code Style**: The project uses **TypeScript** for type safety. The frontend uses **ESLint** for linting.
-   **Styling**: The `webapp` uses **Tailwind CSS**. Any new UI components should be styled using Tailwind utility classes.
-   **Dependencies**: Manage backend and frontend dependencies separately in their respective `package.json` files.
