import { Router } from "express";
import fs from "fs";
import path from "path";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createAlbumsRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/albums
     * List all library albums (is_release=0) - for personal library view
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            // Show all albums (releases + library)
            // Filter by visibility for non-admins
            const albums = database.getAlbums(!req.isAdmin);
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
            const releases = database.getReleases(req.isAdmin !== true);
            res.json(releases);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    /**
     * POST /api/albums/:id/promote
     * Promote a library album to a release (admin only)
     */
    router.post("/:id/promote", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        try {
            const id = parseInt(req.params.id as string, 10);
            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Album not found" });
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

            // Non-admin can only see public albums
            if (!album.is_public && !req.isAdmin) {
                return res.status(404).json({ error: "Album not found" });
            }

            const tracks = database.getTracks(album.id);

            res.json({
                ...album,
                tracks,
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
    router.get("/:idOrSlug/cover", (req: AuthenticatedRequest, res) => {
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

            // Note: Cover images are accessible regardless of album visibility
            // This allows showing covers in player even for private albums

            if (!album.cover_path || !fs.existsSync(album.cover_path)) {
                return res.status(404).json({ error: "Cover not found" });
            }

            const ext = path.extname(album.cover_path).toLowerCase();
            const contentTypes: Record<string, string> = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
                ".webp": "image/webp",
            };

            res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
            res.setHeader("Cache-Control", "public, max-age=86400");
            fs.createReadStream(album.cover_path).pipe(res);
        } catch (error) {
            console.error("Error getting cover:", error);
            res.status(500).json({ error: "Failed to get cover" });
        }
    });

    return router;
}
