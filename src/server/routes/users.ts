import { Router } from "express";
import { validateUsername } from "../../utils/audioUtils.js";
import type { GunDBService } from "../gundb.js";
import type { DatabaseService } from "../database.js";
import type { AuthService } from "../auth.js";
import type { ActivityPubService } from "../activitypub.js";
import { validatePassword } from "../validators.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { createAuthMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";

export function createUsersRoutes(
    gundbService: GunDBService,
    database: DatabaseService,
    authService: AuthService,
    apService: ActivityPubService
): Router {
    const router = Router();
    const authMiddleware = createAuthMiddleware(authService);

    /**
     * POST /api/users/register
     * Full registration: GunDB user + DB user + Artist profile + AP actor
     */
    router.post("/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
        try {
            const { pubKey, username, password, signature } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: "Username and password required" });
            }

            // Validate username format
            const validation = validateUsername(username);
            if (!validation.valid) {
                return res.status(400).json({
                    error: validation.error || "Invalid username format"
                });
            }

            // Validate password
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            // Check if registration is enabled
            const allowRegistration = database.getSetting("allowRegistration");
            if (allowRegistration === "false") {
                return res.status(403).json({ error: "Registration is currently disabled" });
            }

            // Check if username is already taken (in database)
            const existingDb = authService.listAdmins().find(a => a.username === username);
            if (existingDb) {
                return res.status(409).json({ error: "Username already taken" });
            }

            // 1. Register GunDB user (if pubKey provided - for community features)
            if (pubKey) {
                const existingUser = await gundbService.getUser(pubKey);
                if (!existingUser || !existingUser.username) {
                    await gundbService.registerUser(pubKey, username);
                }
            }

            // 2. Create artist profile
            const slug = username.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            const artistId = database.createArtist(username, `Artist profile for ${username}`);

            // 3. Generate AP keys for the new artist
            try {
                await apService.ensureArtistKeys(artistId);
            } catch (e) {
                console.warn("⚠️ Failed to generate AP keys for new user artist:", e);
                // Non-fatal - AP can still work without pre-generated keys
            }

            // 4. Create DB user with artist link + storage quota (1GB)
            const DEFAULT_QUOTA = 1024 * 1024 * 1024; // 1GB
            const { id: userId } = await authService.createUser(username, password, artistId, DEFAULT_QUOTA);

            // 5. Generate JWT token for auto-login
            const token = authService.generateToken({
                isAdmin: false,
                username,
                artistId,
                role: 'user'
            });

            console.log(`🆕 New user registered: ${username} (artist: ${artistId}, user: ${userId})`);

            res.json({
                success: true,
                token,
                expiresIn: "7d",
                username,
                artistId,
                role: 'user',
                storageQuota: DEFAULT_QUOTA
            });
        } catch (error: any) {
            console.error("User registration error:", error);
            if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return res.status(409).json({ error: "Username already taken" });
            }
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
            const existingDb = authService.listAdmins().find(a => a.username === username);
            res.json({ available: !existingDb });
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
     * Sync GunDB user data (pub, epub, alias, avatar) to local SQLite
     */
    router.post("/sync", async (req, res) => {
        try {
            const { pub, epub, alias, avatar } = req.body;

            if (!pub || !epub || !alias) {
                return res.status(400).json({ error: "pub, epub, and alias are required" });
            }

            database.syncGunUser(pub, epub, alias, avatar);
            res.json({ success: true });
        } catch (error) {
            console.error("User sync error:", error);
            res.status(500).json({ error: "Sync failed" });
        }
    });

    /**
     * POST /api/users/sync-pair
     * Sync full GunDB pair (SEA) to server for persistence
     */
    router.post("/sync-pair", authMiddleware.requireUser, async (req: AuthenticatedRequest, res) => {
        try {
            const { pair } = req.body;
            if (!pair || !pair.pub || !pair.priv || !pair.epub || !pair.epriv) {
                return res.status(400).json({ error: "Complete GunDB pair required" });
            }

            if (!req.username) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            authService.updateGunPair(req.username, pair);
            res.json({ success: true });
        } catch (error) {
            console.error("User pair sync error:", error);
            res.status(500).json({ error: "Pair sync failed" });
        }
    });

    /**
     * GET /api/users/me/storage
     * Get current user's storage usage (requires auth)
     */
    router.get("/me/storage", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        try {
            const admins = authService.listAdmins();
            const user = admins.find(a => a.username === req.username);
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json({
                storage_quota: user.storage_quota,
                storage_used: authService.getStorageInfo(user.id)?.storage_used || 0,
                role: user.role
            });
        } catch (error) {
            console.error("Storage info error:", error);
            res.status(500).json({ error: "Failed to get storage info" });
        }
    });

    return router;
}
