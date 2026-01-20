import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createCatalogRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/catalog
     * Get catalog overview with stats
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const stats = database.getStats();
            const recentAlbums = database
                .getAlbums(req.isAdmin !== true)
                .slice(0, 10);

            res.json({
                stats: req.isAdmin ? stats : {
                    albums: stats.publicAlbums,
                    tracks: stats.tracks
                },
                recentAlbums,
            });
        } catch (error) {
            console.error("Error getting catalog:", error);
            res.status(500).json({ error: "Failed to get catalog" });
        }
    });

    /**
     * GET /api/catalog/search
     * Search across artists, albums, tracks
     */
    router.get("/search", (req: AuthenticatedRequest, res) => {
        try {
            const query = req.query.q as string;
            if (!query || query.length < 2) {
                return res.status(400).json({ error: "Query must be at least 2 characters" });
            }

            const results = database.search(query, req.isAdmin !== true);
            res.json(results);
        } catch (error) {
            console.error("Error searching:", error);
            res.status(500).json({ error: "Search failed" });
        }
    });

    return router;
}
