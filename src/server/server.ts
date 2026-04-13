import "reflect-metadata";
import express from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import http from "http";
import fs from "fs-extra";
import { fileURLToPath } from "url";

// Global crash protection for Torrent engine and other async modules
// Global crash protection for async modules
process.on('uncaughtException', (err) => {
    console.error('🌊 SEVERE: Uncaught Exception:', err);
    // Certain errors like those from GunDB or network timeouts are not fatal
    if (err.message && (
        err.message.includes('GunDB') || 
        err.message.includes('ECONNREFUSED') || 
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('socket hang up')
    )) {
        console.warn('⚠️ Non-fatal exception caught, staying alive...');
        return;
    }
    
    // For genuine DB busy errors, we take a bit more caution
    if (err.message && err.message.includes('database is busy')) {
        console.warn('⚠️ SQLite busy error caught. Check your concurrency settings.');
        return;
    }

    // Otherwise, we might be in an undefined state, but let's try to stay alive anyway
    // since this is a self-hosted app where availability is higher priority than strict state
    console.warn('⚠️ Attempting to continue despite uncaught exception...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🌊 SEVERE: Unhandled Rejection at:', promise, 'reason:', reason);
});
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
import { createReleaseRouter } from "./routes/releases.js";
import { createImportRoutes } from "./routes/import.js";
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
import { createSubsonicRouter } from "./routes/subsonic.js";
import { createProxyRoutes } from "./routes/proxy.js";
import { WaveformService } from "./modules/waveform/waveform.service.js";
import { securityHeaders } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { SoulseekService } from "./soulseek.js";
import { createSearchRoutes } from "./routes/search.js";
import { runStartupMaintenance } from "./maintenance.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(config: ServerConfig): Promise<void> {
    const app = express();
    app.set('trust proxy', true); // Required for CapRover/Nginx
    const server = http.createServer(app);

    // Middleware
    app.use(compression());
    app.use(securityHeaders);
    app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 })); // General rate limit: 1000 requests per 15 minutes
    app.use(cors({ origin: config.corsOrigins }));

    // Initialize database
    console.log(`📦 Initializing database: ${config.dbPath}`);
    const database = createDatabase(config.dbPath);

    // Run Startup Maintenance (Repair paths + Restore Orphans)
    await runStartupMaintenance(database, config);

    // Initialize auth
    const authService = createAuthService(database.db, config.jwtSecret, config.adminUser, config.adminPass);
    await authService.init();
    const authMiddleware = createAuthMiddleware(authService);

    // Initialize scanner
    const scanner = new Scanner(database);

    // Initialize Waveform Service
    const waveformService = new WaveformService(path.dirname(config.dbPath));

    // Initialize GunDB service (with HTTP server for WebSockets)
    const gundbService = createGunDBService(database, server, config.gunPeers);
    await gundbService.init();

    // Initialize Fedify (Must be before AP Service)
    const federation = createFedify(database, config);

    // Initialize ActivityPub
    const apService = createActivityPubService(database, config, federation);
    await apService.generateKeysForAllArtists();

    // Initialize Publishing Service
    const publishingService = createPublishingService(database, gundbService, apService, config);

    // Initialize Content Search Services
    const soulseekService = new SoulseekService(config.musicDir, config.downloadDir || path.join(config.musicDir, "downloads"));
    // Try to connect with system credentials if available
    soulseekService.connect().catch(err => console.error("Soulseek initial connection failed:", err));

    // Upload routes - MOVED BEFORE FEDIFY/BODY PARSERS to avoid stream consumption issues
    app.use("/api/admin/upload", authMiddleware.requireUser, createUploadRoutes(database, scanner, config.musicDir, publishingService, authService));
    app.use("/api/admin/backup", authMiddleware.requireAdmin, createBackupRoutes(database, config, () => {
        console.log("🔄 Restarting server...");
        process.exit(0); // Docker/PM2 should handle restart
    }));

    app.use(integrateFederation(federation, (req: express.Request) => undefined)); // Context data if needed

    // Parse JSON (must be AFTER Fedify to avoid conflicting with body stream reading)
    app.use(express.json({
        type: ['application/json', 'application/activity+json', 'application/ld+json'],
        limit: '10mb'
    }));

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
    app.get("/api/waveform/:id(*)", async (req, res) => {
        try {
            const idParam = req.params.id;
            const trackId = parseInt(idParam);
            
            if (!isNaN(trackId) && trackId.toString() === idParam) {
                const track = database.getTrack(trackId);
                if (track && track.file_path) {
                    const filePath = path.join(config.musicDir, track.file_path);
                    const svg = await waveformService.getWaveformSVG(trackId, filePath);
                    res.setHeader("Content-Type", "image/svg+xml");
                    res.setHeader("Cache-Control", "public, max-age=31536000");
                    return res.send(svg);
                }
            }

            // For remote tracks (ActivityPub or GunDB), return a generic flat line SVG 
            // so the Player doesn't throw 404
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=31536000");
            return res.send('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100" viewBox="0 0 800 100"><line x1="0" y1="50" x2="800" y2="50" stroke="#888" stroke-width="2"/></svg>');
        } catch (e) {
            console.error(e);
            res.status(500).send("Error generating waveform");
        }
    });

    app.use("/rest", createSubsonicRouter({ db: database, auth: authService, musicDir: config.musicDir, gundbService }));
    
    // Lightweight healthcheck endpoint for Docker/CapRover
    app.get("/health", (req, res) => {
        res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    });

    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(authService, authMiddleware));
    app.use("/api/admin", authMiddleware.requireUser, createAdminRoutes(database, scanner, config.musicDir, gundbService, config, authService, publishingService, apService));
    // Backup routes moved earlier
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(database));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(database, config.musicDir));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(database, config.musicDir));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(database, publishingService, config.musicDir, authService));
    app.use("/api/playlists", authMiddleware.optionalAuth, createPlaylistsRoutes(database, gundbService));

    app.use("/api/import", authMiddleware.requireUser, createImportRoutes());

    const releaseRouter = createReleaseRouter(database, scanner, publishingService, authService, config.musicDir);
    app.use("/api/releases", authMiddleware.optionalAuth, releaseRouter);
    app.use("/api/admin/releases", authMiddleware.requireUser, releaseRouter);
    app.use("/api/stats", createStatsRoutes(gundbService, database, config));
    app.use("/api/stats/library", createLibraryStatsRoutes(database));
    app.use("/api/browser", authMiddleware.requireAdmin, createBrowserRoutes(config.musicDir, database));
    app.use("/api/metadata", authMiddleware.requireAdmin, createMetadataRoutes(database, config.musicDir));
    app.use("/api/users", createUsersRoutes(gundbService, database, authService, apService));
    app.use("/api/comments", createCommentsRoutes(gundbService));
    app.use("/api/unlock", createUnlockRoutes(database));
    app.use("/api/payments", createPaymentsRoutes(database, config.musicDir, config));
    app.use("/api/ap", createActivityPubRoutes(apService, database, authMiddleware));
    app.use("/api/proxy", createProxyRoutes());
    app.use("/api/search/content", authMiddleware.requireAdmin, createSearchRoutes(database, soulseekService, scanner));
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
            res.redirect(`/artists/${artist.slug}`);
        } else {
            res.redirect("/");
        }
    });

    // Serve artist page for generic fediverse queries or raw links
    app.get("/artist/:slug", (req, res) => {
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
                res.redirect(`/artists/${artist.slug}?post=${post.slug}`);
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

    // Memory cache for index.html to avoid disk I/O bottlenecks
    let cachedIndexHtml: string | null = null;
    const getCachedHtml = () => {
        if (cachedIndexHtml && process.env.NODE_ENV === 'production') return cachedIndexHtml;
        try {
            const html = fs.readFileSync(indexHtmlPath, 'utf8');
            if (process.env.NODE_ENV === 'production') cachedIndexHtml = html;
            return html;
        } catch (e) {
            console.error("Failed to read index.html:", e);
            return "Error loading app";
        }
    };

    // Public sharing route with OG tags support
    app.get("/share/:id", async (req, res) => {
        const { id } = req.params;
        let title = "Shared from TuneCamp";
        let description = "Music shared via TuneCamp";
        let image = "";

        if (id.startsWith('tr_')) {
            const trackId = parseInt(id.substring(3));
            if (!isNaN(trackId)) {
                const track = database.getTrack(trackId);
                if (track) {
                    title = track.title || "Track";
                    description = `Track by ${track.artist_name || 'Unknown Artist'}${track.album_title ? ` from ${track.album_title}` : ''}`;
                    image = `/api/tracks/${track.id}/cover`;
                }
            }
        } else if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            if (!isNaN(albumId)) {
                const album = database.getAlbum(albumId);
                if (album) {
                    title = album.title || "Album";
                    description = `Album by ${album.artist_name || 'Unknown Artist'} • ${album.year || ''}`;
                    image = `/api/albums/${album.id}/cover`;
                }
            }
        }

        try {
            let html = getCachedHtml();
            const dbPublicUrl = database.getSetting("publicUrl");
            const publicUrl = dbPublicUrl || config.publicUrl || `${req.protocol}://${req.get('host')}`;
            
            const ogTags = `
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta property="og:image" content="${publicUrl}${image}" />
    <meta property="og:type" content="music.song" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${publicUrl}${image}" />
`;
            html = html.replace('<head>', '<head>' + ogTags);
            
            // Inject the same config as the main index route
            const dbGunPeers = database.getSetting("gunPeers");
            const rpcUrl = process.env.TUNECAMP_RPC_URL || process.env.VITE_TUNECAMP_RPC_URL || '';
            const gunPeersStr = dbGunPeers || process.env.TUNECAMP_GUN_PEERS || process.env.VITE_GUN_PEERS || '';
            const web3CheckoutAddr = database.getSetting("web3_checkout_address") || "";
            const web3NftAddr = database.getSetting("web3_nft_address") || "";
            const ownerAddress = process.env.TUNECAMP_OWNER_ADDRESS || "";
            
            const configInject = `<script>window.TUNECAMP_CONFIG = { 
                apiUrl: "/api", 
                rpcUrl: ${JSON.stringify(rpcUrl)},
                gunPeers: ${JSON.stringify(gunPeersStr)},
                web3_checkout_address: ${JSON.stringify(web3CheckoutAddr)},
                web3_nft_address: ${JSON.stringify(web3NftAddr)},
                ownerAddress: ${JSON.stringify(ownerAddress)}
            };</script>`;
            html = html.replace('<head>', '<head>' + configInject);
            
            res.send(html);
        } catch (e) {
            console.error("Error serving share page:", e);
            res.redirect(`/#/share/${id}`);
        }
    });

    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/")) {
            return res.status(404).json({ error: "Not found" });
        }
        try {
            let html = getCachedHtml();
            const dbGunPeers = database.getSetting("gunPeers");
            const rpcUrl = process.env.TUNECAMP_RPC_URL || process.env.VITE_TUNECAMP_RPC_URL || '';
            const gunPeersStr = dbGunPeers || process.env.TUNECAMP_GUN_PEERS || process.env.VITE_GUN_PEERS || '';
            const web3CheckoutAddr = database.getSetting("web3_checkout_address") || "";
            const web3NftAddr = database.getSetting("web3_nft_address") || "";
            const ownerAddress = process.env.TUNECAMP_OWNER_ADDRESS || "";
            
            const configInject = `<script>window.TUNECAMP_CONFIG = { 
                apiUrl: "/api", 
                rpcUrl: ${JSON.stringify(rpcUrl)},
                gunPeers: ${JSON.stringify(gunPeersStr)},
                web3_checkout_address: ${JSON.stringify(web3CheckoutAddr)},
                web3_nft_address: ${JSON.stringify(web3NftAddr)},
                ownerAddress: ${JSON.stringify(ownerAddress)}
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
            }, 20000); // Increased to 20 seconds to avoid overlap with early healthchecks

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
+
+        // --- MEMORY MONITORING ---
+        const MEM_LIMIT = process.env.MEMORY_LIMIT_MB ? parseInt(process.env.MEMORY_LIMIT_MB) : 3500;
+        setInterval(() => {
+            const mem = process.memoryUsage();
+            const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
+            const rssMB = Math.round(mem.rss / 1024 / 1024);
+            
+            if (heapUsedMB > MEM_LIMIT * 0.7) {
+                console.warn(`[Monitor] ⚠️ High Memory Usage: Heap ${heapUsedMB}MB / RSS ${rssMB}MB. Limit: ${MEM_LIMIT}MB`);
+                if ((global as any).gc) {
+                    console.log("[Monitor] Triggering emergency GC...");
+                    (global as any).gc();
+                }
+            } else if (heapUsedMB > 1000) {
+                 console.log(`[Monitor] Memory: Heap ${heapUsedMB}MB / RSS ${rssMB}MB`);
+            }
+        }, 60000);
     });

    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n🛑 Shutting down...");
        database.db.close();
        process.exit(0);
    });
}

export const globalErrorHandler = (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("🔥 Global error:", err);
    if (res.headersSent) {
        return next(err);
    }

    // In production, don't leak error details
    const isProduction = process.env.NODE_ENV === 'production';
    const message = isProduction ? "Internal Server Error" : (err.message || "Internal Server Error");

    res.status(500).json({ error: message });
};
