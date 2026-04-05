import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import type { DatabaseService, Album, Track } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { getPlaceholderSVG } from "../../utils/audioUtils.js";

export function createAlbumsRoutes(database: DatabaseService, musicDir: string): Router {
    const router = Router();

    /**
     * GET /api/albums
     * List all albums (ADMIN ONLY)
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Access denied: Admin only" });
            }
            res.json(database.getAlbums());
        } catch (error) {
            console.error("Error getting albums:", error);
            res.status(500).json({ error: "Failed to get albums" });
        }
    });

    /**
     * GET /api/albums/search
     */
    router.get("/search", (req: AuthenticatedRequest, res) => {
        try {
            const query = req.query.q as string;
            const limit = parseInt(req.query.limit as string) || 50;
            if (!query) return res.json([]);
            
            // Search only public/unlisted albums for non-admins
            const albums = database.searchAlbums(query, limit, !req.isAdmin);
            res.json(albums.map((a: Album) => ({
                ...a,
                coverImage: a.cover_path
            })));
        } catch (error) {
            console.error("Search error:", error);
            res.status(500).json({ error: "Search failed" });
        }
    });

    /**
     * POST /api/albums/:id/star
     */
    router.post("/:id/star", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        if (!req.isAdmin && !req.isActive) return res.status(403).json({ error: "Account not active" });
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
        if (!req.isAdmin && !req.isActive) return res.status(403).json({ error: "Account not active" });
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
        if (!req.isAdmin && !req.isActive) {
            return res.status(403).json({ error: "Account not active" });
        }
        try {
            const id = parseInt(req.params.id as string, 10);
            const album = database.getAlbum(id);
            if (!album) return res.status(404).json({ error: "Album not found" });

            // Security: Artist can only promote their own library albums
            if (!req.isAdmin && album.owner_id !== req.userId) {
                return res.status(403).json({ error: "Access denied" });
            }

            // Promote via database service to ensure all tables (releases, release_tracks) are synced
            database.promoteToRelease(id);
            
            res.json({ success: true, message: "Album promoted to release" });
        } catch (error) {
            console.error("Error promoting album:", error);
            res.status(500).json({ error: "Failed to promote album" });
        }
    });

    /**
     * GET /api/albums/:id
     * Get album details with tracks
     */
    router.get("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.id as string;
            let album: Album | undefined;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Non-admin can only see public/unlisted albums or their own
            if (!req.isAdmin && !album.is_public && album.owner_id !== req.userId) {
                if (album.visibility === 'private') {
                   return res.status(404).json({ error: "Album not found" });
                }
            }

            const tracks = database.getTracksByAlbum(album.id);
            const username = req.username;

            res.json({
                ...album,
                coverImage: album.cover_path,
                tracks: tracks.map((t: Track) => ({
                    ...t,
                    albumId: t.album_id,
                    artistId: t.artist_id,
                    coverUrl: t.external_artwork ? `/api/tracks/${t.id}/cover` : (t.album_id ? `/api/albums/${t.album_id}/cover` : null),
                    starred: username ? database.isStarred(username, 'track', String(t.id)) : false,
                    rating: username ? database.getItemRating(username, 'track', String(t.id)) : 0
                })),
                starred: username ? database.isStarred(username, 'album', String(album.id)) : false,
                rating: username ? database.getItemRating(username, 'album', String(album.id)) : 0
            });
        } catch (error) {
            console.error("Error getting album:", error);
            res.status(500).json({ error: "Failed to get album" });
        }
    });

    /**
     * GET /api/albums/:id/cover
     * Get album cover image
     */
    router.get("/:id/cover", async (req, res) => {
        try {
            const param = req.params.id as string;
            const album = /^\d+$/.test(param)
                ? database.getAlbum(parseInt(param, 10))
                : database.getAlbumBySlug(param);

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            if (album.cover_path) {
                const coverPath = path.join(musicDir, album.cover_path);
                if (await fs.pathExists(coverPath)) {
                    return res.sendFile(path.resolve(coverPath), { maxAge: 86400000 });
                }
            }

            // Fallback: Return SVG placeholder based on title
            const svg = getPlaceholderSVG(album.title || "Album");
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=3600");
            res.send(svg);
        } catch (error) {
            console.error("Error getting album cover:", error);
            res.status(500).json({ error: "Failed to get album cover" });
        }
    });

    /**
     * POST /api/albums/:id/cover
     * Upload or set cover for an album
     */
    router.post("/:id/cover", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.artistId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        if (!req.isAdmin && !req.isActive) {
            return res.status(403).json({ error: "Account not active" });
        }
        let id: number | undefined;
        try {
            id = parseInt(req.params.id as string, 10);
            const { relPath } = req.body;

            if (!relPath) {
                return res.status(400).json({ error: "Missing relPath" });
            }

            const album = database.getAlbum(id);
            if (!album) return res.status(404).json({ error: "Album not found" });

            // Security: Artist can only update their own albums
            if (!req.isAdmin && album.owner_id !== req.userId) {
                return res.status(403).json({ error: "Access denied" });
            }

            database.updateAlbumCover(id, relPath);
            res.json({ success: true, coverPath: relPath });
        } catch (error) {
            console.error(`❌ [Albums] ERROR during cover upload for album ID: ${id}:`, error);
            res.status(500).json({ error: "Upload failed" });
        }
    });

    return router;
}
