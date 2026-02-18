import { Request, Response, NextFunction } from "express";

/**
 * Middleware to set security headers for enhanced protection
 *
 * Headers:
 * - X-Content-Type-Options: nosniff (Prevents MIME sniffing)
 * - Referrer-Policy: strict-origin-when-cross-origin (Privacy)
 * - X-XSS-Protection: 1; mode=block (Legacy XSS protection)
 * - Permissions-Policy: geolocation=(), microphone=(), etc. (Disables unused features)
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
    next();
}
