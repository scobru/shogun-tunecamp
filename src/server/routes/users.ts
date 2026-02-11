import { Router } from "express";
import { validateUsername } from "../../utils/audioUtils.js";
import type { GunDBService } from "../gundb.js";
import type { DatabaseService } from "../database.js";

export function createUsersRoutes(gundbService: GunDBService, database: DatabaseService) {
    const router = Router();

    /**
     * POST /api/users/register
     * Register a new user with username and public key
     */
    router.post("/register", async (req, res) => {
        try {
            const { pubKey, username, signature } = req.body;

            if (!pubKey || !username) {
                return res.status(400).json({ error: "Public key and username required" });
            }

            // Validate username format
            const validation = validateUsername(username);
            if (!validation.valid) {
                return res.status(400).json({
                    error: validation.error || "Invalid username format"
                });
            }

            // Check if username is available
            const existing = await gundbService.getUserByUsername(username);
            if (existing) {
                return res.status(409).json({ error: "Username already taken" });
            }

            // Check if pubKey already has a username
            const existingUser = await gundbService.getUser(pubKey);
            if (existingUser && existingUser.username) {
                return res.status(409).json({ error: "This key already has a username" });
            }

            // Register the user
            const success = await gundbService.registerUser(pubKey, username);
            if (success) {
                res.json({ success: true, username, pubKey });
            } else {
                res.status(500).json({ error: "Registration failed" });
            }
        } catch (error) {
            console.error("User registration error:", error);
            res.status(500).json({ error: "Registration failed" });
        }
    });

    /**
     * GET /api/users/check/:username
     * Check if a username is available
     */
    router.get("/check/:username", async (req, res) => {
        try {
            const { username } = req.params;
            const existing = await gundbService.getUserByUsername(username);
            res.json({ available: !existing });
        } catch (error) {
            console.error("Username check error:", error);
            res.status(500).json({ error: "Check failed" });
        }
    });

    /**
     * GET /api/users/:pubKey
     * Get user profile by public key
     */
    router.get("/:pubKey", async (req, res) => {
        try {
            const { pubKey } = req.params;
            const user = await gundbService.getUser(pubKey);

            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json(user);
        } catch (error) {
            console.error("Get user error:", error);
            res.status(500).json({ error: "Failed to get user" });
        }
    });

    /**
     * POST /api/users/sync
     * Sync GunDB user data (pub, epub, alias) to local SQLite
     */
    router.post("/sync", async (req, res) => {
        try {
            const { pub, epub, alias } = req.body;

            if (!pub || !epub || !alias) {
                return res.status(400).json({ error: "pub, epub, and alias are required" });
            }

            database.syncGunUser(pub, epub, alias);
            res.json({ success: true });
        } catch (error) {
            console.error("User sync error:", error);
            res.status(500).json({ error: "Sync failed" });
        }
    });

    return router;
}
