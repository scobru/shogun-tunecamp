import { Router } from "express";
import fs from "fs";
import path from "path";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createAlbumsRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/albums
     * List all albums (public only for non-admin)
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const albums = database.getAlbums(req.isAdmin !== true);
            res.json(albums);
        } catch (error) {
            console.error("Error getting albums:", error);
            res.status(500).json({ error: "Failed to get albums" });
        }
    });

    /**
     * GET /api/albums/:id
     * Get album details with tracks
     */
    router.get("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const album = database.getAlbum(id);

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Non-admin can only see public albums
            if (!album.is_public && !req.isAdmin) {
                return res.status(404).json({ error: "Album not found" });
            }

            const tracks = database.getTracks(id);

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
     * GET /api/albums/:id/cover
     * Get album cover image
     */
    router.get("/:id/cover", (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const album = database.getAlbum(id);

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Non-admin can only see public albums
            if (!album.is_public && !req.isAdmin) {
                return res.status(404).json({ error: "Album not found" });
            }

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
