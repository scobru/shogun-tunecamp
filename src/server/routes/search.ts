import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { TorrentSearchService } from "../torrent-search.js";
import type { SoulseekService } from "../soulseek.js";
import type { TorrentService } from "../torrent.js";

export function createSearchRoutes(
    database: DatabaseService,
    torrentSearch: TorrentSearchService,
    soulseek: SoulseekService,
    torrentService: TorrentService
): Router {
    const router = Router();

    /**
     * GET /api/search/torrents
     * Search TPB for music torrents
     */
    router.get("/torrents", async (req: AuthenticatedRequest, res) => {
        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        try {
            const results = await torrentSearch.searchMusic(query);
            res.json(results);
        } catch (error) {
            res.status(500).json({ error: "Torrent search failed" });
        }
    });

    /**
     * GET /api/search/soulseek
     * Search Soulseek for music
     */
    router.get("/soulseek", async (req: AuthenticatedRequest, res) => {
        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        try {
            // Check if user has personal credentials
            if (req.userId) {
                const creds = database.getUserSoulseekCredentials(req.userId);
                if (creds) {
                    await soulseek.connect(creds.username, creds.password_encrypted);
                }
            }

            const results = await soulseek.search(query);
            res.json(results);
        } catch (error) {
            res.status(500).json({ error: "Soulseek search failed" });
        }
    });

    /**
     * POST /api/search/soulseek/download
     * Trigger a Soulseek download
     */
    router.post("/soulseek/download", async (req: AuthenticatedRequest, res) => {
        const { result } = req.body;
        if (!result) return res.status(400).json({ error: "Result required" });

        try {
            const downloadId = database.createSoulseekDownload({
                user_id: req.userId!,
                file_path: result.file,
                filename: result.file.split(/[/\\]/).pop() || "unknown",
                status: 'pending'
            });

            // Start download in background
            soulseek.download(result).then(async (dest) => {
                database.updateSoulseekDownloadProgress(downloadId, 1, 'completed');
                // Trigger scanner on the new file
                // Note: We might need to handle scanning here or in a separate step
                console.log(`📡 Soulseek download finished: ${dest}`);
            }).catch(err => {
                database.updateSoulseekDownloadProgress(downloadId, 0, 'failed');
            });

            res.json({ success: true, downloadId });
        } catch (error: any) {
            console.error("❌ Soulseek Download Route Error:", error);
            res.status(500).json({ error: "Download failed", details: error.message });
        }
    });

    /**
     * POST /api/search/soulseek/credentials
     * Update user's Soulseek credentials
     */
    router.post("/soulseek/credentials", async (req: AuthenticatedRequest, res) => {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Credentials required" });

        try {
            database.updateUserSoulseekCredentials(req.userId!, username, password);
            // Try to connect to verify
            const success = await soulseek.connect(username, password);
            res.json({ success });
        } catch (error) {
            res.status(500).json({ error: "Failed to update credentials" });
        }
    });

    /**
     * GET /api/search/soulseek/status
     * Get user's Soulseek download status
     */
    router.get("/soulseek/status", async (req: AuthenticatedRequest, res) => {
        try {
            const downloads = database.getSoulseekDownloads(req.userId);
            res.json(downloads);
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch status" });
        }
    });

    return router;
}
