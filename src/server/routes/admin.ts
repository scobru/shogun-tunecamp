import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";

export function createAdminRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string
) {
    const router = Router();

    /**
     * GET /api/admin/releases
     * List all albums with visibility status
     */
    router.get("/releases", (req, res) => {
        try {
            const albums = database.getAlbums(false); // Include private
            res.json(albums);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    /**
     * PUT /api/admin/releases/:id/visibility
     * Toggle album visibility
     */
    router.put("/releases/:id/visibility", (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { isPublic } = req.body;

            if (typeof isPublic !== "boolean") {
                return res.status(400).json({ error: "isPublic must be a boolean" });
            }

            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            database.updateAlbumVisibility(id, isPublic);
            res.json({ message: "Visibility updated", isPublic });
        } catch (error) {
            console.error("Error updating visibility:", error);
            res.status(500).json({ error: "Failed to update visibility" });
        }
    });

    /**
     * POST /api/admin/scan
     * Force library rescan
     */
    router.post("/scan", async (req, res) => {
        try {
            await scanner.scanDirectory(musicDir);
            const stats = database.getStats();
            res.json({
                message: "Scan complete",
                stats,
            });
        } catch (error) {
            console.error("Error scanning:", error);
            res.status(500).json({ error: "Scan failed" });
        }
    });

    /**
     * GET /api/admin/stats
     * Get admin statistics
     */
    router.get("/stats", (req, res) => {
        try {
            const stats = database.getStats();
            res.json(stats);
        } catch (error) {
            console.error("Error getting stats:", error);
            res.status(500).json({ error: "Failed to get stats" });
        }
    });

    return router;
}
