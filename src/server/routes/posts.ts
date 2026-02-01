
import { Router } from "express";
import type { DatabaseService } from "../database.js";

export function createPostsRoutes(database: DatabaseService): Router {
    const router = Router();

    /**
     * GET /api/posts/:slug
     * Get a single post by slug (Public)
     */
    router.get("/:slug", (req, res) => {
        try {
            const slug = req.params.slug;
            const post = database.getPostBySlug(slug);

            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            res.json(post);
        } catch (error) {
            console.error("Error getting post:", error);
            res.status(500).json({ error: "Failed to get post" });
        }
    });

    return router;
}
