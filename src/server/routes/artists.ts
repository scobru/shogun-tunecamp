import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createArtistsRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/artists
     * List all artists
     */
    router.get("/", (req, res) => {
        try {
            const artists = database.getArtists();
            res.json(artists);
        } catch (error) {
            console.error("Error getting artists:", error);
            res.status(500).json({ error: "Failed to get artists" });
        }
    });

    /**
     * GET /api/artists/:id
     * Get artist details with albums
     */
    router.get("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const artist = database.getArtist(id);

            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            const albums = database.getAlbumsByArtist(id, req.isAdmin !== true);

            res.json({
                ...artist,
                albums,
            });
        } catch (error) {
            console.error("Error getting artist:", error);
            res.status(500).json({ error: "Failed to get artist" });
        }
    });

    return router;
}
