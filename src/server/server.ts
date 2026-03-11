import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import fs from "fs-extra";
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
import { createUploadRoutes } from "./routes/upload.js";
import { createReleaseRoutes } from "./routes/releases.js";
import { createStatsRoutes } from "./routes/stats.js";
import { createUsersRoutes } from "./routes/users.js";
import { createCommentsRoutes } from "./routes/comments.js";
import { Scanner } from "./scanner.js";
import { createGunDBService } from "./gundb.js";
import { createLibraryStatsRoutes } from "./routes/library-stats.js";
import { createBrowserRoutes } from "./routes/browser.js";
import { createMetadataRoutes } from "./routes/metadata.js";
import { createUnlockRoutes } from "./routes/unlock.js";
import { createPaymentsRoutes } from "./routes/payments.js";
import { createActivityPubService } from "./activitypub.js";
import { createActivityPubRoutes } from "./routes/activitypub.js";
import { createPublishingService } from "./publishing.js";
import { integrateFederation } from "@fedify/express";
import { createFedify } from "./fedify.js";
import { createBackupRoutes } from "./routes/backup.js";
import { createPostsRoutes } from "./routes/posts.js";
import { createSubsonicRouter } from "./routes/subsonic.js";
import { WaveformService } from "./modules/waveform/waveform.service.js";
import { securityHeaders } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(config: ServerConfig): Promise<void> {
    const app = express();
    app.set('trust proxy', true); // Required for CapRover/Nginx
    const server = http.createServer(app);

    // Middleware
    app.use(securityHeaders);
    app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 })); // General rate limit: 1000 requests per 15 minutes
    app.use(cors({ origin: config.corsOrigins }));

    // Initialize database
    console.log(`📦 Initializing database: ${config.dbPath}`);
    const database = createDatabase(config.dbPath);

    // Initialize auth
    const authService = createAuthService(database.db, config.jwtSecret);
    await authService.init();
    const authMiddleware = createAuthMiddleware(authService);

    // Initialize scanner
    const scanner = new Scanner(database);

    // Initialize Waveform Service
    const waveformService = new WaveformService(path.dirname(config.dbPath));

    // Initialize GunDB service (with HTTP server for WebSockets)
    const gundbService = createGunDBService(database, server, config.gunPeers);
    await gundbService.init();

    // Upload routes - MOVED BEFORE FEDIFY/BODY PARSERS to avoid stream consumption issues
    app.use("/api/admin/upload", authMiddleware.requireUser, createUploadRoutes(database, scanner, config.musicDir, authService));
    app.use("/api/admin/backup", authMiddleware.requireAdmin, createBackupRoutes(database, config, () => {
        console.log("🔄 Restarting server...");
        process.exit(0); // Docker/PM2 should handle restart
    }));

    // Initialize Fedify (Must be before AP Service)
    const federation = createFedify(database, config);
    app.use(integrateFederation(federation, (req: express.Request) => undefined)); // Context data if needed

    // Parse JSON (must be AFTER Fedify to avoid conflicting with body stream reading)
    app.use(express.json({
        type: ['application/json', 'application/activity+json', 'application/ld+json'],
        limit: '10mb'
    }));

    // Initialize ActivityPub
    const apService = createActivityPubService(database, config, federation);
    await apService.generateKeysForAllArtists();

    // Initialize Publishing Service
    const publishingService = createPublishingService(database, gundbService, apService, config);

    // DIAGNOSTIC LOGGING: Verify frontend file paths
    const webappPath = path.join(__dirname, "..", "..", "webapp");
    const webappDistPath = path.join(webappPath, "dist");
    const webappPublicPath = path.join(webappPath, "public");

    // Robustly find a static file
    const findStaticFile = (filename: string) => {
        const candidates = [
            path.join(webappDistPath, filename),
            path.join(webappPath, filename),
            path.join(webappPublicPath, filename),
            path.join(process.cwd(), "webapp", "dist", filename),
            path.join(process.cwd(), "webapp", "public", filename),
            path.join(process.cwd(), "webapp", filename),
            path.join(process.cwd(), "dist", "webapp", "dist", filename), // Some Docker setups
            "/app/webapp/dist/" + filename,
            "/app/webapp/public/" + filename, // Explicit absolute path for Docker
            path.join(__dirname, "..", "..", "webapp", "public", filename),
            path.join(__dirname, "..", "..", "webapp", "dist", filename)
        ];
        const found = candidates.find(p => fs.existsSync(p));
        return found;
    };

    // Explicitly serve sw.js and manifest.json at the root VERY EARLY to avoid being caught by other routes
    app.get("/sw.js", (req, res) => {
        const foundPath = findStaticFile("sw.js");
        if (foundPath) {
            console.log(`✅ [Express] Serving sw.js from: ${foundPath}`);
            return res.sendFile(path.resolve(foundPath));
        }
        console.warn(`❌ [Express] sw.js requested but not found anywhere!`);
        res.status(404).send("sw.js not found - possible build issue");
    });

    app.get("/manifest.json", (req, res) => {
        const foundPath = findStaticFile("manifest.json");
        if (foundPath) {
            console.log(`✅ [Express] Serving manifest.json from: ${foundPath}`);
            return res.sendFile(path.resolve(foundPath));
        }
        console.warn(`❌ [Express] manifest.json requested but not found anywhere!`);
        res.status(404).json({ error: "manifest.json not found" });
    });

    // API Routes
    app.get("/api/waveform/:id", async (req, res) => {
        try {
            const trackId = parseInt(req.params.id);
            if (isNaN(trackId)) return res.status(400).send("Invalid track ID");

            const track = database.getTrack(trackId);
            if (!track) return res.status(404).send("Track not found");

            if (!track.file_path) return res.status(400).send("Waveform not available for external tracks");
            const filePath = path.join(config.musicDir, track.file_path);
            const svg = await waveformService.getWaveformSVG(trackId, filePath);

            res.setHeader("Content-Type", "image/svg+xml");
            // Cache for 1 year
            res.setHeader("Cache-Control", "public, max-age=31536000");
            res.send(svg);
        } catch (e) {
            console.error(e);
            res.status(500).send("Error generating waveform");
        }
    });

    app.use("/rest", createSubsonicRouter({ db: database, auth: authService, musicDir: config.musicDir, gundbService }));
    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(authService));
    app.use("/api/admin", authMiddleware.requireAdmin, createAdminRoutes(database, scanner, config.musicDir, gundbService, config, authService, publishingService, apService));
    // Backup routes moved earlier
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(database));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(database, config.musicDir));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(database, config.musicDir));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(database, publishingService, config.musicDir));
    app.use("/api/playlists", authMiddleware.optionalAuth, createPlaylistsRoutes(database));

    app.use("/api/admin/releases", authMiddleware.requireAdmin, createReleaseRoutes(database, scanner, config.musicDir, publishingService));
    app.use("/api/stats", createStatsRoutes(gundbService, database, config));
    app.use("/api/stats/library", createLibraryStatsRoutes(database));
    app.use("/api/browser", authMiddleware.requireAdmin, createBrowserRoutes(config.musicDir, database));
    app.use("/api/metadata", authMiddleware.requireAdmin, createMetadataRoutes(database, config.musicDir));
    app.use("/api/users", createUsersRoutes(gundbService, database, authService, apService));
    app.use("/api/comments", createCommentsRoutes(gundbService));
    app.use("/api/unlock", createUnlockRoutes(database));
    app.use("/api/payments", createPaymentsRoutes(database, config.musicDir));
    app.use("/api/ap", createActivityPubRoutes(apService, database, authMiddleware));
    // app.use("/.well-known", createWebFingerRoute(apService)); // Legacy, handled by Fedify

    // Funkwhale-compatible federation libraries endpoint
    app.get("/api/v1/federation/libraries", async (_req, res) => {
        const publicUrl = database.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`;
        const stats = await database.getStats();
        res.json({
            count: 1,
            results: [{
                uuid: "tunecamp-library",
                fid: `${publicUrl}/federation/libraries/tunecamp-library`,
                name: database.getSetting("siteName") || config.siteName || "TuneCamp Library",
                description: database.getSetting("siteDescription") || "Tunecamp music library",
                privacy_level: "everyone",
                creation_date: new Date().toISOString(),
                uploads_count: stats.tracks,
                size: 0,
                actor: {
                    fid: `${publicUrl}/users/site`,
                    url: publicUrl,
                    name: database.getSetting("siteName") || "TuneCamp",
                    preferred_username: "site",
                    domain: new URL(publicUrl).hostname,
                }
            }]
        });
    });

    // Funkwhale nodeinfo compatibility - also expose at /api/v1/instance/nodeinfo/2.0
    app.get("/api/v1/instance/nodeinfo/2.0", async (_req, res) => {
        const stats = await database.getStats();
        res.json({
            version: "2.0",
            software: { name: "tunecamp", version: "2.0.0" },
            protocols: ["activitypub"],
            openRegistrations: false,
            usage: {
                users: { total: stats.artists || 1, activeHalfyear: stats.artists || 1, activeMonth: stats.artists || 1 },
                localPosts: stats.tracks + (stats.albums || 0),
                localComments: 0,
            },
            metadata: {
                nodeName: database.getSetting("siteName") || config.siteName || "TuneCamp",
                library: { federationEnabled: true },
            }
        });
    });

    // Human-readable profile redirect (for ActivityPub/WebFinger links)
    app.get("/@:slug", (req, res) => {
        const { slug } = req.params;
        const artist = database.getArtistBySlug(slug);
        if (artist) {
            res.redirect(`/#/artist/${artist.slug}`);
        } else {
            res.redirect("/");
        }
    });

    // Fix for legacy/short ActivityPub URLs linking to frontend
    app.get("/note/release/:slug", (req, res) => {
        const { slug } = req.params;
        const album = database.getAlbumBySlug(slug);
        if (album) {
            res.redirect(`/#/album/${album.slug}`);
        } else {
            res.status(404).send("Release not found");
        }
    });

    app.get("/note/post/:slug", (req, res) => {
        const { slug } = req.params;
        const post = database.getPostBySlug(slug);
        if (post) {
            // Need artist slug for the URL
            const artist = database.getArtist(post.artist_id);
            if (artist) {
                res.redirect(`/#/artist/${artist.slug}?post=${post.slug}`);
            } else {
                res.redirect("/");
            }
        } else {
            res.status(404).send("Post not found");
        }
    });

    // Serve uploaded site background image (public)
    app.get("/api/settings/background", async (_req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            if (!(await fs.pathExists(assetsDir))) {
                return res.status(404).json({ error: "No background image" });
            }
            const files = await fs.readdir(assetsDir);
            const bgFile = files.find((f) => f.startsWith("background."));
            if (!bgFile) {
                return res.status(404).json({ error: "No background image" });
            }
            const filePath = path.join(assetsDir, bgFile);
            res.sendFile(path.resolve(filePath));
        } catch {
            res.status(404).json({ error: "Not found" });
        }
    });

    // Serve uploaded site cover image (public for network list)
    app.get("/api/settings/cover", async (_req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            if (!(await fs.pathExists(assetsDir))) {
                return res.status(404).json({ error: "No cover image" });
            }
            const files = await fs.readdir(assetsDir);
            const coverFile = files.find((f) => f.startsWith("site-cover."));
            if (!coverFile) {
                return res.status(404).json({ error: "No cover image" });
            }
            const filePath = path.join(assetsDir, coverFile);
            res.sendFile(path.resolve(filePath));
        } catch {
            res.status(404).json({ error: "Not found" });
        }
    });

    // 1. Serve built files if they exist (prod)
    const staticOptions = { index: false };
    if (fs.existsSync(webappDistPath)) {
        app.use(express.static(webappDistPath, staticOptions));
    }

    // 2. Serve public assets (manifest, sw, etc) at root
    if (fs.existsSync(webappPublicPath)) {
        app.use(express.static(webappPublicPath, staticOptions));
    }

    // 3. Fallback to webapp root (dev/legacy)
    app.use(express.static(webappPath, staticOptions));

    // SPA fallback - serve index.html for all non-API routes
    const indexHtmlPath = fs.existsSync(path.join(webappPath, "index.html"))
        ? path.join(webappPath, "index.html")
        : fs.existsSync(path.join(webappDistPath, "index.html"))
            ? path.join(webappDistPath, "index.html")
            : path.join(webappPath, "index.html");

    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/")) {
            return res.status(404).json({ error: "Not found" });
        }
        try {
            let html = fs.readFileSync(indexHtmlPath, 'utf8');
            const configInject = `<script>window.TUNECAMP_CONFIG = {
                ownerAddress: "${process.env.TUNECAMP_OWNER_ADDRESS || process.env.VITE_TUNECAMP_OWNER_ADDRESS || ''}",
                rpcUrl: "${process.env.TUNECAMP_RPC_URL || process.env.VITE_TUNECAMP_RPC_URL || ''}",
                gunPeers: "${process.env.TUNECAMP_GUN_PEERS || process.env.VITE_GUN_PEERS || ''}"
            };</script>`;
            html = html.replace('<head>', '<head>' + configInject);
            res.send(html);
        } catch (e) {
            console.error("Error serving index.html:", e);
            res.status(500).send("Error loading app context");
        }
    });

    // Global error handler
    app.use(globalErrorHandler);

    // Start server
    server.listen(config.port, async () => {
        console.log("");
        console.log(`🎶 TuneCamp Server running at http://localhost:${config.port}`);
        console.log("");
        if (authService.isFirstRun()) {
            console.log("⚠️  First run detected! Visit the server to set up admin password.");
        }
        console.log(`📊 Stats: ${(await database.getStats()).tracks} tracks in library`);

        // Increasing timeouts for slow uploads/connections (e.g. large files or slow clients)
        // Set to 5 minutes (300000ms) to allow for large WAV uploads + conversion
        server.keepAliveTimeout = 300000;
        server.headersTimeout = 301000;   // Must be slightly larger than keepAliveTimeout

        // Register server on GunDB community if publicUrl is set (either in config or db)
        const dbPublicUrl = database.getSetting("publicUrl");
        const publicUrl = dbPublicUrl || config.publicUrl;

        if (publicUrl) {
            const artists = database.getArtists();
            const dbArtistName = database.getSetting("artistName");
            // Use DB setting, or first artist, or empty
            const artistName = dbArtistName || (artists.length > 0 ? artists[0].name : "");

            const dbSiteName = database.getSetting("siteName");
            const dbSiteDescription = database.getSetting("siteDescription");
            const dbCoverImage = database.getSetting("coverImage");

            const siteInfo = {
                url: publicUrl,
                title: dbSiteName || config.siteName || "TuneCamp Server",
                description: dbSiteDescription || `Music server with ${(await database.getStats()).tracks} tracks`,
                artistName,
                coverImage: dbCoverImage || ""
            };

            const registered = await gundbService.registerSite(siteInfo);
            if (registered) {
                console.log(`🌐 Registered on GunDB community: ${publicUrl}`);
            }

            // --- Decentralized Mesh: Auto-Follow other instances ---
            // We wait a bit for GunDB to connect to peers before scanning
            setTimeout(async () => {
                try {
                    await publishingService.syncCommunityFollows();
                } catch (e) {
                    console.error("❌ Failed to auto-sync community follows on startup:", e);
                }
            }, 10000); // 10 seconds delay to allow GunDB to discover peers

            // ActivityPub Relay Support
            const relayUrl = database.getSetting("relayUrl") || config.relayUrl;
            if (relayUrl) {
                console.log(`📡 Connecting to ActivityPub Relay: ${relayUrl}`);
                await apService.subscribeToRelay(relayUrl);
            }
        } else {
            console.log("💡 Set TUNECAMP_PUBLIC_URL or configure Network Settings in Admin Panel to register on community");
        }

        console.log("");
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n🛑 Shutting down...");
        database.db.close();
        process.exit(0);
    });
}

export const globalErrorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("🔥 Global error:", err);
    if (res.headersSent) {
        return next(err);
    }

    // In production, don't leak error details
    const isProduction = process.env.NODE_ENV === 'production';
    const message = isProduction ? "Internal Server Error" : (err.message || "Internal Server Error");

    res.status(500).json({ error: message });
};
