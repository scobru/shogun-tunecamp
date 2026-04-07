import { Router } from "express";
import type { TorrentService } from "../torrent.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createTorrentRoutes(torrentService: TorrentService): Router {
    const router = Router();

    /**
     * GET /api/torrents
     * List all active torrents and their status
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const status = torrentService.getTorrentsStatus();
            res.json(status);
        } catch (error) {
            console.error("Error getting torrents status:", error);
            res.status(500).json({ error: "Failed to get torrents status" });
        }
    });

    /**
     * POST /api/torrents/add
     * Add a new torrent via magnet URI
     */
    router.post("/add", async (req: AuthenticatedRequest, res) => {
        try {
            const { magnetUri } = req.body;
            if (!magnetUri) {
                return res.status(400).json({ error: "magnetUri is required" });
            }

            // Basic validation for magnet URI
            if (!magnetUri.startsWith("magnet:?")) {
                console.warn(`⚠️ Invalid magnet URI attempted: ${magnetUri}`);
                return res.status(400).json({ 
                    error: "Invalid magnet URI. It must start with 'magnet:?'" 
                });
            }

            const infoHash = await torrentService.addTorrent(magnetUri);
            res.json({ success: true, infoHash });
        } catch (error: any) {
            console.error("Error adding torrent:", error);
            const message = error.message || String(error);
            res.status(500).json({ error: "Failed to add torrent: " + message });
        }
    });

    /**
     * DELETE /api/torrents/:infoHash
     * Remove a torrent and optionally its files
     */
    router.delete("/:infoHash", async (req: AuthenticatedRequest, res) => {
        try {
            const { infoHash } = req.params;
            const { deleteFiles } = req.query;
            
            await torrentService.removeTorrent(infoHash, deleteFiles === "true");
            res.json({ success: true });
        } catch (error) {
            console.error("Error removing torrent:", error);
            res.status(500).json({ error: "Failed to remove torrent" });
        }
    });

    return router;
}
