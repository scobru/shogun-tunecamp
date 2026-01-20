import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import type { ServerConfig } from "./config.js";
import { createDatabase } from "./database.js";
import { createAuthService } from "./auth.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createAdminRoutes } from "./routes/admin.js";
import { createCatalogRoutes } from "./routes/catalog.js";
import { createAlbumsRoutes } from "./routes/albums.js";
import { createTracksRoutes } from "./routes/tracks.js";
import { createArtistsRoutes } from "./routes/artists.js";
import { createPlaylistsRoutes } from "./routes/playlists.js";
import { createScanner } from "./scanner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(config: ServerConfig): Promise<void> {
    const app = express();

    // Middleware
    app.use(cors({ origin: config.corsOrigins }));
    app.use(express.json());

    // Initialize database
    console.log(`📦 Initializing database: ${config.dbPath}`);
    const database = createDatabase(config.dbPath);

    // Initialize auth
    const authService = createAuthService(database.db, config.jwtSecret);
    const authMiddleware = createAuthMiddleware(authService);

    // Initialize scanner
    const scanner = createScanner(database);

    // Scan music directory on startup
    console.log(`🎵 Music directory: ${config.musicDir}`);
    await scanner.scanDirectory(config.musicDir);
    scanner.startWatching(config.musicDir);

    // API Routes
    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(authService));
    app.use("/api/admin", authMiddleware.requireAdmin, createAdminRoutes(database, scanner, config.musicDir));
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(database));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(database));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(database));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(database));
    app.use("/api/playlists", authMiddleware.requireAdmin, createPlaylistsRoutes(database));

    // Serve static webapp
    const webappPath = path.join(__dirname, "..", "..", "webapp");
    app.use(express.static(webappPath));

    // SPA fallback - serve index.html for all non-API routes
    app.use((req, res, next) => {
        if (req.path.startsWith("/api/")) {
            return res.status(404).json({ error: "Not found" });
        }
        res.sendFile(path.join(webappPath, "index.html"));
    });

    // Start server
    app.listen(config.port, () => {
        console.log("");
        console.log(`🎶 TuneCamp Server running at http://localhost:${config.port}`);
        console.log("");
        if (authService.isFirstRun()) {
            console.log("⚠️  First run detected! Visit the server to set up admin password.");
        }
        console.log(`📊 Stats: ${database.getStats().tracks} tracks in library`);
        console.log("");
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n🛑 Shutting down...");
        scanner.stopWatching();
        database.db.close();
        process.exit(0);
    });
}
