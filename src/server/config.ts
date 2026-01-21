import path from "path";
import crypto from "crypto";

export interface ServerConfig {
    port: number;
    musicDir: string;
    dbPath: string;
    jwtSecret: string;
    corsOrigins: string[];
    publicUrl?: string;  // Public URL for GunDB registration (e.g., https://mysite.com)
    siteName?: string;   // Site name for community registry
}

/**
 * Load server configuration from environment variables or defaults
 */
export function loadConfig(overrides?: Partial<ServerConfig>): ServerConfig {
    const defaultDbPath = path.join(process.cwd(), "tunecamp.db");
    const defaultMusicDir = path.join(process.cwd(), "music");

    // Generate a random JWT secret if not provided
    const jwtSecret =
        process.env.TUNECAMP_JWT_SECRET ||
        overrides?.jwtSecret ||
        crypto.randomBytes(32).toString("hex");

    return {
        port: parseInt(process.env.TUNECAMP_PORT || "1970", 10),
        musicDir: process.env.TUNECAMP_MUSIC_DIR || defaultMusicDir,
        dbPath: process.env.TUNECAMP_DB_PATH || defaultDbPath,
        jwtSecret,
        corsOrigins: process.env.TUNECAMP_CORS_ORIGINS?.split(",") || ["*"],
        publicUrl: process.env.TUNECAMP_PUBLIC_URL || overrides?.publicUrl,
        siteName: process.env.TUNECAMP_SITE_NAME || overrides?.siteName,
        ...overrides,
    };
}
