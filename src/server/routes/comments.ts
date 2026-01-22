import { Router } from "express";
import type { GunDBService } from "../gundb.js";

export function createCommentsRoutes(gundbService: GunDBService) {
    const router = Router();

    /**
     * GET /api/comments/track/:trackId
     * Get all comments for a track
     */
    router.get("/track/:trackId", async (req, res) => {
        try {
            const trackId = parseInt(req.params.trackId as string, 10);
            if (isNaN(trackId)) {
                return res.status(400).json({ error: "Invalid track ID" });
            }

            const comments = await gundbService.getComments(trackId);
            res.json(comments);
        } catch (error) {
            console.error("Get comments error:", error);
            res.status(500).json({ error: "Failed to get comments" });
        }
    });

    /**
     * POST /api/comments/track/:trackId
     * Post a new comment on a track
     */
    router.post("/track/:trackId", async (req, res) => {
        try {
            const trackId = parseInt(req.params.trackId as string, 10);
            if (isNaN(trackId)) {
                return res.status(400).json({ error: "Invalid track ID" });
            }

            const { pubKey, username, text, signature } = req.body;

            if (!pubKey || !text) {
                return res.status(400).json({ error: "Public key and text required" });
            }

            if (text.length > 500) {
                return res.status(400).json({ error: "Comment too long (max 500 chars)" });
            }

            // Get username from profile if not provided
            let displayName = username;
            if (!displayName) {
                const user = await gundbService.getUser(pubKey);
                displayName = user?.username || pubKey.substring(0, 8) + "...";
            }

            const comment = await gundbService.addComment(trackId, {
                pubKey,
                username: displayName,
                text,
                signature
            });

            if (comment) {
                res.json(comment);
            } else {
                res.status(500).json({ error: "Failed to post comment" });
            }
        } catch (error) {
            console.error("Post comment error:", error);
            res.status(500).json({ error: "Failed to post comment" });
        }
    });

    /**
     * DELETE /api/comments/:commentId
     * Delete a comment (requires ownership proof)
     */
    router.delete("/:commentId", async (req, res) => {
        try {
            const { commentId } = req.params;
            const { pubKey, signature } = req.body;

            if (!pubKey) {
                return res.status(400).json({ error: "Public key required" });
            }

            // Get the comment to verify ownership
            const success = await gundbService.deleteComment(commentId, pubKey);

            if (success) {
                res.json({ success: true });
            } else {
                res.status(403).json({ error: "Cannot delete this comment" });
            }
        } catch (error) {
            console.error("Delete comment error:", error);
            res.status(500).json({ error: "Failed to delete comment" });
        }
    });

    return router;
}
