import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { getPlaceholderSVG } from "../../utils/audioUtils.js";
import { resolveSafePath } from "../../utils/fileUtils.js";

export function createAlbumsRoutes(database: DatabaseService, musicDir: string): Router {
    const router = Router();

    /**
     * GET /api/albums
     * List all albums
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            // Show all albums if admin
            if (req.isAdmin) {
                const albums = database.getAlbums().map(a => ({
                    ...a,
                    coverImage: a.cover_path
                }));
                return res.json(albums);
            }

            // If a non-admin artist, return their own albums + all public albums
            if (req.artistId) {
                const myAlbums = database.getAlbumsByOwner(req.artistId).map(a => ({
                    ...a,
                    coverImage: a.cover_path
                }));

                const publicAlbums = database.getAlbums(true).map(a => ({
                    ...a,
                    coverImage: a.cover_path
                }));

                // Deduplicate (album could be mine AND public)
                const seen = new Set(myAlbums.map(a => a.id));
                const combined = [...myAlbums];
                for (const a of publicAlbums) {
                    if (!seen.has(a.id)) {
                        combined.push(a);
                    }
                }
                return res.json(combined);
            }

            // Otherwise, only public albums
            const albums = database.getAlbums(true).map(a => ({
                ...a,
                coverImage: a.cover_path
            }));
            res.json(albums);
        } catch (error) {
            console.error("Error getting albums:", error);
            res.status(500).json({ error: "Failed to get albums" });
        }
    });

    /**
     * GET /api/releases
     * List all releases (is_release=1) - public releases for the catalog
     */
    router.get("/releases", (req: AuthenticatedRequest, res) => {
        try {
            // Non-admin sees public releases only, admin sees all releases
            const releases = database.getReleases(req.isAdmin !== true).map(r => ({
                ...r,
                coverImage: r.cover_path
            }));
            res.json(releases);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    /**
     * POST /api/albums/:id/promote
     * Promote a library album to a release (admin/owner only)
     */
    router.post("/:id/promote", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.artistId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        try {
            const id = parseInt(req.params.id as string, 10);
            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Permission Check: Artist can only promote their own albums
            if (!req.isAdmin && album.owner_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            database.promoteToRelease(id);
            res.json({ success: true, message: "Album promoted to release" });
        } catch (error) {
            console.error("Error promoting album:", error);
            res.status(500).json({ error: "Failed to promote album" });
        }
    });


    /**
     * GET /api/albums/:idOrSlug
     * Get album details with tracks (supports ID or slug)
     */
    router.get("/:idOrSlug", (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let album;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Non-admin can only see public/unlisted albums, unless they are the owner
            if (album.visibility === 'private' && !req.isAdmin && album.owner_id !== req.artistId) {
                return res.status(404).json({ error: "Album not found" });
            }

            const tracks = database.getTracksByReleaseId(album.id);

            // Map tracks to include album cover info for the player
            const mappedTracks = tracks.map(t => ({
                ...t,
                albumId: album.id,
                artistId: t.artist_id,
                coverImage: album.cover_path ? `/api/albums/${album.id}/cover` : undefined,
                externalArtwork: t.external_artwork,
                losslessPath: t.lossless_path, // Map snake_case for frontend
            }));

            res.json({
                ...album,
                coverImage: album.cover_path,
                tracks: mappedTracks,
            });
        } catch (error) {
            console.error("Error getting album:", error);
            res.status(500).json({ error: "Failed to get album" });
        }
    });

    /**
     * GET /api/albums/:idOrSlug/cover
     * Get album cover image (supports ID or slug)
     */
    router.get("/:idOrSlug/cover", async (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let album;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album || !album.cover_path) {
                const svg = getPlaceholderSVG(album ? album.title : "No Cover");
                res.setHeader("Content-Type", "image/svg+xml");
                res.setHeader("Cache-Control", "public, max-age=0");
                return res.send(svg);
            }

            // Note: Cover images are accessible regardless of album visibility
            // This allows showing covers in player even for private albums

            // Verify file existence
            let resolvedPath = resolveSafePath(musicDir, album.cover_path);

            // Fix for potential double-prefixing or absolute paths stored in DB
            // If the path implies double nesting (e.g. /music/music/...) try to fix it securely
            if (!resolvedPath || !await fs.pathExists(resolvedPath)) {
                // Check if paths behaves like "/music/music/..."
                if (album.cover_path.startsWith("/music/") || album.cover_path.startsWith("music/")) {
                    const stripped = album.cover_path.replace(/^[\/\\]?music[\/\\]/, "");
                    const tryPath = resolveSafePath(musicDir, stripped);
                    if (tryPath && await fs.pathExists(tryPath)) {
                        console.log(`🔧 [Debug] Fixed double path: ${album.cover_path} -> ${tryPath}`);
                        resolvedPath = tryPath;
                    }
                }

                // Fallback: Check if cover_path itself is absolute and exists securely within musicDir
                if ((!resolvedPath || !await fs.pathExists(resolvedPath)) && path.isAbsolute(album.cover_path)) {
                    // Check if it's securely inside musicDir
                    const relative = path.relative(path.resolve(musicDir), album.cover_path);
                    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
                        if (await fs.pathExists(album.cover_path)) {
                            console.log(`🔧 [Debug] Using absolute path securely: ${album.cover_path}`);
                            resolvedPath = album.cover_path;
                        }
                    }
                }
            }

            console.log(`🖼️ [Debug] Serving album cover: ${resolvedPath}`);
            if (!resolvedPath || !await fs.pathExists(resolvedPath)) {
                console.warn(`⚠️ [Debug] Album cover not found at: ${resolvedPath}`);
                const svg = getPlaceholderSVG(album.title);
                res.setHeader("Content-Type", "image/svg+xml");
                res.setHeader("Cache-Control", "public, max-age=0");
                return res.send(svg);
            }

            // Use res.sendFile to handle ETag/Last-Modified and correct Content-Type automatically
            // Cache for 24 hours (86400000ms)
            // Frontend uses cache busting (?v=timestamp) when covers change, so we can safely cache.
            res.sendFile(path.resolve(resolvedPath), { maxAge: 86400000 }, (err) => {
                if (err && !res.headersSent) {
                    console.error(`❌ [Debug] Error sending file: ${err}`);
                    res.status(500).end();
                }
            });
        } catch (error) {
            console.error("Error getting cover:", error);
            res.status(500).json({ error: "Failed to get cover" });
        }
    });

    /**
     * GET /api/albums/:idOrSlug/download
     * Download all tracks as individual files or ZIP (only if download enabled)
     */
    router.get("/:idOrSlug/download", async (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let album;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Check if download is enabled
            if (!album.download || (album.download !== 'free' && album.download !== 'paid' && album.download !== 'codes')) {
                return res.status(403).json({ error: "Downloads not enabled for this release" });
            }

            // Verify unlock code if required
            if (album.download === 'codes') {
                const code = req.query.code as string;
                if (!code) {
                    return res.status(402).json({ error: "Unlock code required" });
                }
                const validation = database.validateUnlockCode(code);
                if (!validation.valid) {
                    return res.status(403).json({ error: "Invalid unlock code" });
                }
                if (validation.releaseId && validation.releaseId !== album.id) {
                    return res.status(403).json({ error: "Code is for a different release" });
                }
                // Optional: Check if already used? For now, we allow re-download or multi-use.
                // Log redemption
                database.redeemUnlockCode(code);
            }

            // Get tracks for this album
            const tracks = database.getTracks(album.id);
            if (!tracks || tracks.length === 0) {
                return res.status(404).json({ error: "No tracks found" });
            }

            // Determine requested format
            const requestedFormat = (req.query.format as string)?.toLowerCase();
            const useLossless = requestedFormat === 'lossless' || requestedFormat === 'wav' || requestedFormat === 'flac';

            // For single track, just send the file
            if (tracks.length === 1) {
                const track = tracks[0];
                const trackFile = (useLossless && track.lossless_path) ? track.lossless_path : track.file_path;
                if (!trackFile) {
                    return res.status(400).json({ error: "External tracks cannot be downloaded directly" });
                }
                const trackPath = path.join(musicDir, trackFile);

                if (!await fs.pathExists(trackPath)) {
                    return res.status(404).json({ error: "Track file not found" });
                }
                const filename = path.basename(trackPath);
                res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
                res.setHeader("Content-Type", "application/octet-stream");
                return fs.createReadStream(trackPath).pipe(res);
            }


            // For multiple tracks, create a simple sequential download
            const archiver = await import("archiver");
            const archive = archiver.default("zip", { zlib: { level: 5 } });

            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="${album.slug || album.title}${useLossless ? '-lossless' : ''}.zip"`);

            archive.pipe(res);

            for (const track of tracks) {
                // Use lossless path if requested and available, fallback to primary path
                const trackFile = (useLossless && track.lossless_path) ? track.lossless_path : track.file_path;
                if (!trackFile) continue; // Skip external tracks in ZIP
                const trackPath = path.join(musicDir, trackFile);

                if (await fs.pathExists(trackPath)) {
                    archive.file(trackPath, { name: path.basename(trackPath) });
                }
            }

            await archive.finalize();
        } catch (error) {
            console.error("Error downloading album:", error);
            res.status(500).json({ error: "Failed to download album" });
        }
    });

    return router;
}
