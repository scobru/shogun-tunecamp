import { Router } from "express";
import type { TorrentService } from "../torrent.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createTorrentRoutes(torrentService: TorrentService): Router {
    const router = Router();

    let statusCache: any = null;
    let lastCacheTime = 0;
    const CACHE_TTL = 500; // 500ms cache to prevent spikes from rapid polling

    /**
     * GET /api/torrents
     * List all active torrents and their status
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const now = Date.now();
            const includeFiles = req.query.files === "true";

            // If we have a fresh cache and parameters are the same, return it
            // Note: We only cache 'includeFiles=true' separately if needed, 
            // but for simplicity we'll just check if it's been 500ms.
            if (statusCache && (now - lastCacheTime < CACHE_TTL)) {
                return res.json(statusCache);
            }

            console.log(`[Torrents API] GET / requested by ${req.username}`);
            const status = torrentService.getTorrentsStatus(includeFiles);
            
            // Update cache
            statusCache = status;
            lastCacheTime = now;
            
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
            console.log(`[Torrents API] POST /add requested by ${req.username}`);

            if (!magnetUri) {
                console.warn("[Torrents API] Missing magnetUri in request body");
                return res.status(400).json({ error: "magnetUri is required" });
            }

            // Basic validation for magnet URI
            if (!magnetUri.startsWith("magnet:?")) {
                console.warn(`[Torrents API] Invalid magnet URI attempted by ${req.username}: ${magnetUri.substring(0, 50)}...`);
                return res.status(400).json({ 
                    error: "Invalid magnet URI. It must start with 'magnet:?'" 
                });
            }

            console.log(`[Torrents API] Forwarding to TorrentService: ${magnetUri.substring(0, 40)}... requested by user ${req.userId}`);
            const infoHash = await torrentService.addTorrent(magnetUri, true, req.userId || null);
            
            console.log(`[Torrents API] Successfully added torrent. infoHash: ${infoHash}`);
            res.json({ success: true, infoHash });
        } catch (error: any) {
            console.error("[Torrents API] FATAL error adding torrent:", error);
            const message = error.message || String(error);
            res.status(500).json({ error: "Failed to add torrent: " + message });
        }
    });

    /**
     * POST /api/torrents/:infoHash/sync
     * Manually trigger library indexing for a finished torrent
     */
    router.post("/:infoHash/sync", async (req: AuthenticatedRequest, res) => {
        try {
            const { infoHash } = req.params;
            console.log(`[Torrents API] Manual sync triggered by ${req.username} (ID: ${req.userId}) for ${infoHash}`);
            await torrentService.syncTorrent(infoHash, req.userId);
            res.json({ success: true, message: "Torrent sync triggered successfully" });
        } catch (error: any) {
            console.error("[Torrents API] Error syncing torrent:", error);
            res.status(500).json({ error: "Failed to sync torrent: " + (error.message || String(error)) });
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
