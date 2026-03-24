import type { Request, Response, NextFunction } from "express";
import type { AuthService } from "../auth.js";
import type { UserRole, TokenPayload } from "../auth.js";

export interface AuthenticatedRequest extends Request {
    isAdmin?: boolean;
    isRootAdmin?: boolean;
    username?: string;
    artistId?: number | null;
    role?: UserRole;
    isActive?: boolean;
    userId?: number;
}

/**
 * Creates auth middleware that validates JWT tokens
 */
export function createAuthMiddleware(authService: AuthService) {
    /**
     * Extracts and verifies token from request
     */
    function extractPayload(req: AuthenticatedRequest): TokenPayload | null {
        let token: string | undefined;
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        } else if (req.query.token) {
            token = req.query.token as string;
        }

        if (!token) return null;
        return authService.verifyToken(token);
    }

    return {
        /**
         * Middleware that requires valid admin authentication (role='admin')
         */
        requireAdmin(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = extractPayload(req);

            if (!payload || !payload.isAdmin) {
                return res.status(403).json({ error: "Access denied: Admin only" });
            }

            req.isAdmin = true;
            req.username = payload.username;
            req.artistId = payload.artistId;
            req.role = payload.role;
            req.isActive = payload.isActive;
            req.isRootAdmin = authService.isRootAdmin(payload.username);
            next();
        },

        /**
         * Middleware that requires any authenticated user (admin OR user role)
         */
        requireUser(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = extractPayload(req);

            if (!payload) {
                return res.status(401).json({ error: "No token provided" });
            }

            req.isAdmin = payload.isAdmin;
            req.username = payload.username;
            req.artistId = payload.artistId;
            req.role = payload.role;
            req.isActive = payload.isActive;
            req.isRootAdmin = authService.isRootAdmin(payload.username);
            next();
        },

        /**
         * Middleware that optionally authenticates (doesn't fail if no token)
         */
        optionalAuth(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = extractPayload(req);

            if (payload) {
                req.isAdmin = payload.isAdmin;
                req.username = payload.username;
                req.artistId = payload.artistId;
                req.role = payload.role;
                req.isActive = payload.isActive;
                req.isRootAdmin = authService.isRootAdmin(payload.username);
            } else {
                req.isAdmin = false;
                req.isActive = false;
                req.isRootAdmin = false;
            }

            next();
        },
    };
}
