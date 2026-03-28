import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { getPlaceholderSVG } from "../../utils/audioUtils.js";
import multer from "multer";

export function createAlbumsRoutes(database: DatabaseService, musicDir: string): Router {
    const router = Router();

    /**
     * GET /api/albums
     * List all albums
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const username = req.username;
            const mapAlbum = (a: any) => ({
                ...a,
                coverImage: a.cover_path,
                starred: username ? database.isStarred(username, 'album', String(a.id)) : false,
                rating: username ? database.getItemRating(username, 'album', String(a.id)) : 0
            });

            // Show all library albums if admin
            if (req.isAdmin) {
                const albums = database.getAlbums().map(mapAlbum);
                return res.json(albums);
            }

            // If a non-admin artist, return their own albums + all public albums
            if (req.artistId) {
                const myAlbums = database.getAlbumsByOwner(req.artistId).map(mapAlbum);

                const publicAlbums = database.getAlbums(true).map(mapAlbum);

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
            const albums = database.getAlbums(true).map(mapAlbum);
            res.json(albums);
        } catch (error) {
            console.error("Error getting albums:", error);
            res.status(500).json({ error: "Failed to get albums" });
        }
    });

    /**
     * POST /api/albums/:id/star
     */
    router.post("/:id/star", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = req.params.id;
            database.starItem(req.username, 'album', id);
            res.json({ success: true, starred: true });
        } catch (error) {
            console.error("Error starring album:", error);
            res.status(500).json({ error: "Failed to star album" });
        }
    });

    /**
     * DELETE /api/albums/:id/star
     */
    router.delete("/:id/star", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = req.params.id;
            database.unstarItem(req.username, 'album', id);
            res.json({ success: true, starred: false });
        } catch (error) {
            console.error("Error unstarring album:", error);
            res.status(500).json({ error: "Failed to unstar album" });
        }
    });

    /**
     * POST /api/albums/:id/rating
     */
    router.post("/:id/rating", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = req.params.id;
            const { rating } = req.body;
            const r = parseInt(rating);
            if (isNaN(r) || r < 0 || r > 5) return res.status(400).json({ error: "Invalid rating" });
            database.setItemRating(req.username, 'album', id, r);
            res.json({ success: true, rating: r });
        } catch (error) {
            console.error("Error setting album rating:", error);
            res.status(500).json({ error: "Failed to set rating" });
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
            let album: any;

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

            const tracks = database.getTracks(album.id);
            const username = req.username;

            // Map tracks to include album cover info for the player
            const mappedTracks = tracks.map(t => ({
                ...t,
                albumId: album.id,
                artistId: t.artist_id,
                coverImage: album.cover_path ? `/api/albums/${album.id}/cover` : undefined,
                externalArtwork: t.external_artwork,
                losslessPath: t.lossless_path,
                starred: username ? database.isStarred(username, 'track', String(t.id)) : false,
                rating: username ? database.getItemRating(username, 'track', String(t.id)) : 0
            }));

            res.json({
                ...album,
                coverImage: album.cover_path,
                tracks: mappedTracks,
                starred: username ? database.isStarred(username, 'album', String(album.id)) : false,
                rating: username ? database.getItemRating(username, 'album', String(album.id)) : 0
            });
        } catch (error) {
            console.error("Error getting album:", error);
            res.status(500).json({ error: "Failed to get album" });
        }
    });

    /**
     * GET /api/albums/:idOrSlug/cover
     */
    router.get("/:idOrSlug/cover", async (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            console.log(`🖼️ [Albums] GET cover requested for: ${param}`);
            let album: any;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album || !album.cover_path) {
                if (album) {
                    const tracks = database.getTracks(album.id);
                    
                    // 1. Check external_artwork (already used by tracks)
                    const externalCover = tracks.find(t => t.external_artwork)?.external_artwork;
                    if (externalCover) {
                        if (externalCover.startsWith('http')) {
                            return res.redirect(externalCover);
                        }
                        const artworkPath = path.join(musicDir, externalCover);
                        if (await fs.pathExists(artworkPath)) {
                            return res.sendFile(path.resolve(artworkPath), { maxAge: 86400000 });
                        }
                    }

                    // 2. NEW: Try to find a cover.jpg/png in the same directory as the first track
                    if (tracks.length > 0 && tracks[0].file_path) {
                        const albumDir = path.dirname(path.join(musicDir, tracks[0].file_path));
                        const possibleCovers = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'album.jpg', 'album.png'];
                        for (const name of possibleCovers) {
                            const p = path.join(albumDir, name);
                            if (await fs.pathExists(p)) {
                                // Update DB for future requests
                                const relPath = path.relative(musicDir, p);
                                database.updateAlbumCover(album.id, relPath);
                                return res.sendFile(path.resolve(p), { maxAge: 86400000 });
                            }
                        }
                    }
                }

                const svg = getPlaceholderSVG(album ? album.title : "No Cover");
                res.setHeader("Content-Type", "image/svg+xml");
                res.setHeader("Cache-Control", "public, max-age=0");
                return res.send(svg);
            }

            const resolvedPath = path.join(musicDir, album.cover_path);
            if (!await fs.pathExists(resolvedPath)) {
                const tracks = database.getTracks(album.id);
                const externalCover = tracks.find(t => t.external_artwork)?.external_artwork;
                if (externalCover) {
                    return res.redirect(externalCover);
                }

                const svg = getPlaceholderSVG(album.title);
                res.setHeader("Content-Type", "image/svg+xml");
                res.setHeader("Cache-Control", "public, max-age=0");
                return res.send(svg);
            }

            res.sendFile(path.resolve(resolvedPath), { maxAge: 86400000 });
        } catch (error) {
            console.error("Error getting cover:", error);
            res.status(500).json({ error: "Failed to get cover" });
        }
    });

    /**
     * GET /api/albums/:idOrSlug/download
     */
    router.get("/:idOrSlug/download", async (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let album: any;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            if (!album.download || album.download === 'none') {
                return res.status(403).json({ error: "Downloads not enabled" });
            }

            const tracks = database.getTracks(album.id);
            if (!tracks || tracks.length === 0) {
                return res.status(404).json({ error: "No tracks found" });
            }

            const archiver = await import("archiver");
            const archive = archiver.default("zip", { zlib: { level: 5 } });
            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="${album.slug || "album"}.zip"`);
            archive.pipe(res);

            for (const track of tracks) {
                if (track.file_path) {
                    const trackPath = path.join(musicDir, track.file_path);
                    if (await fs.pathExists(trackPath)) {
                        archive.file(trackPath, { name: path.basename(trackPath) });
                    }
                }
            }
            await archive.finalize();
        } catch (error) {
            console.error("Error downloading album:", error);
            res.status(500).json({ error: "Failed to download album" });
        }
    });

    /**
     * POST /api/albums/:id/cover
     * Upload an album cover for a library album
     */
    const upload = multer({ dest: path.join(musicDir, '.temp') });

    router.post("/:id/cover", (upload.single('cover') as any), async (req: any, res: any) => {
        const authReq = req as AuthenticatedRequest;
        const id = req.params.id;
        console.log(`📁 [Albums] POST cover upload started for album ID: ${id}`);
        
        if (!authReq.isAdmin && !authReq.artistId) {
            console.warn(`🛑 [Albums] Unauthorized upload attempt for album ID: ${id}`);
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const album = database.getAlbum(parseInt(id, 10));
            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Permission Check: Artist can only update their own albums
            if (!authReq.isAdmin && album.owner_id !== authReq.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            const tracks = database.getTracks(album.id);
            let destDir = musicDir;
            if (tracks.length > 0 && tracks[0].file_path) {
                destDir = path.dirname(path.join(musicDir, tracks[0].file_path));
            } else {
                destDir = path.join(musicDir, 'covers', album.slug || String(album.id));
                await fs.ensureDir(destDir);
            }

            const ext = path.extname(req.file.originalname) || '.jpg';
            const finalPath = path.join(destDir, 'cover' + ext);
            
            console.log(`📁 [Albums] Moving file from ${req.file.path} to ${finalPath}...`);
            const startTime = Date.now();
            await fs.move(req.file.path, finalPath, { overwrite: true });
            console.log(`📁 [Albums] File move finished in ${Date.now() - startTime}ms.`);
            
            const relPath = path.relative(musicDir, finalPath);
            database.updateAlbumCover(id, relPath);
            console.log(`✅ [Albums] Album cover updated in DB for album ID: ${id}`);
            
            res.json({ success: true, coverPath: relPath });
        } catch (error) {
            console.error(`❌ [Albums] ERROR during cover upload for album ID: ${id}:`, error);
            res.status(500).json({ error: "Upload failed" });
        }
    });

    return router;
}
