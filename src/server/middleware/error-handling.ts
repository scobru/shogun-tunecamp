import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/errors.js";

/**
 * Global error handling middleware.
 * Formats errors consistently for the API.
 */
export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // If headers already sent, delegate to default express error handler
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
            statusCode: err.statusCode
        });
    }

    // Default to 500 Internal Server Error
    const isProduction = process.env.NODE_ENV === "production";
    console.error(`🔥 [Error] ${req.method} ${req.url}:`, err);

    res.status(500).json({
        error: isProduction ? "Internal Server Error" : err.message || "Internal Server Error",
        code: "INTERNAL_SERVER_ERROR",
        statusCode: 500
    });
};

/**
 * Helper to wrap async route handlers and catch errors.
 */
export const wrapAsync = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
};
