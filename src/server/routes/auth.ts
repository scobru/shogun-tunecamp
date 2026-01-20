import { Router } from "express";
import type { AuthService } from "../auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createAuthRoutes(authService: AuthService) {
    const router = Router();

    /**
     * POST /api/auth/login
     * Login with admin password, returns JWT token
     */
    router.post("/login", async (req, res) => {
        try {
            const { password } = req.body;

            if (!password) {
                return res.status(400).json({ error: "Password required" });
            }

            // Check if first run (no password set)
            if (authService.isFirstRun()) {
                return res.status(400).json({
                    error: "No admin password set",
                    firstRun: true,
                });
            }

            const hash = authService.getAdminPasswordHash();
            if (!hash) {
                return res.status(500).json({ error: "Auth configuration error" });
            }

            const valid = await authService.verifyPassword(password, hash);
            if (!valid) {
                return res.status(401).json({ error: "Invalid password" });
            }

            const token = authService.generateToken({ isAdmin: true });
            res.json({ token, expiresIn: "7d" });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ error: "Login failed" });
        }
    });

    /**
     * POST /api/auth/setup
     * Set initial admin password (first run only)
     */
    router.post("/setup", async (req, res) => {
        try {
            if (!authService.isFirstRun()) {
                return res.status(400).json({ error: "Admin password already set" });
            }

            const { password } = req.body;

            if (!password || password.length < 6) {
                return res.status(400).json({
                    error: "Password must be at least 6 characters",
                });
            }

            await authService.setAdminPassword(password);
            const token = authService.generateToken({ isAdmin: true });

            res.json({
                message: "Admin password set successfully",
                token,
                expiresIn: "7d",
            });
        } catch (error) {
            console.error("Setup error:", error);
            res.status(500).json({ error: "Setup failed" });
        }
    });

    /**
     * POST /api/auth/password
     * Change admin password (requires auth)
     */
    router.post("/password", async (req: AuthenticatedRequest, res) => {
        try {
            // This route should be protected by requireAdmin middleware
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    error: "Current and new password required",
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    error: "New password must be at least 6 characters",
                });
            }

            const hash = authService.getAdminPasswordHash();
            if (!hash) {
                return res.status(500).json({ error: "Auth configuration error" });
            }

            const valid = await authService.verifyPassword(currentPassword, hash);
            if (!valid) {
                return res.status(401).json({ error: "Current password is incorrect" });
            }

            await authService.setAdminPassword(newPassword);
            const token = authService.generateToken({ isAdmin: true });

            res.json({
                message: "Password changed successfully",
                token,
                expiresIn: "7d",
            });
        } catch (error) {
            console.error("Password change error:", error);
            res.status(500).json({ error: "Password change failed" });
        }
    });

    /**
     * GET /api/auth/status
     * Check authentication status
     */
    router.get("/status", (req: AuthenticatedRequest, res) => {
        res.json({
            authenticated: req.isAdmin === true,
            firstRun: authService.isFirstRun(),
        });
    });

    return router;
}
