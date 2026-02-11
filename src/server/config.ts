import path from "path";
import fs from "fs";
import crypto from "crypto";

export interface ServerConfig {
    port: number;
    musicDir: string;
    dbPath: string;
    jwtSecret: string;
    corsOrigins: string[];
    publicUrl?: string;  // Public URL for GunDB registration (e.g., https://mysite.com)
    siteName?: string;   // Site name for community registry
    gunPeers?: string[];
}

/**
 * Load server configuration from environment variables or defaults
 */
export function loadConfig(overrides?: Partial<ServerConfig>): ServerConfig {
    const defaultDbPath = path.join(process.cwd(), "tunecamp.db");
    const defaultMusicDir = path.join(process.cwd(), "music");

    // Generate a random JWT secret if not provided
    // Generate a random JWT secret if not provided
    let jwtSecret = process.env.TUNECAMP_JWT_SECRET || overrides?.jwtSecret;

    if (!jwtSecret) {
        const secretFilePath = path.join(process.cwd(), '.jwt-secret');
        if (fs.existsSync(secretFilePath)) {
            jwtSecret = fs.readFileSync(secretFilePath, 'utf-8').trim();
        } else {
            jwtSecret = crypto.randomBytes(32).toString("hex");
            try {
                fs.writeFileSync(secretFilePath, jwtSecret);
                console.log(`🔒 Generated new JWT secret and saved to ${secretFilePath}`);
            } catch (err) {
                console.warn("⚠️  Could not save JWT secret to file, sessions may be lost on restart:", err);
            }
        }
    }

    return {
        port: parseInt(process.env.TUNECAMP_PORT || "1970", 10),
        musicDir: process.env.TUNECAMP_MUSIC_DIR || defaultMusicDir,
        dbPath: process.env.TUNECAMP_DB_PATH || defaultDbPath,
        jwtSecret,
        corsOrigins: process.env.TUNECAMP_CORS_ORIGINS?.split(",") || ["*"],
        publicUrl: process.env.TUNECAMP_PUBLIC_URL || overrides?.publicUrl,
        siteName: process.env.TUNECAMP_SITE_NAME || overrides?.siteName,
        gunPeers: process.env.TUNECAMP_GUN_PEERS?.split(",") || overrides?.gunPeers || [
            "https://shogun-relay.scobrudot.dev/gun",
            "https://gun.defucc.me/gun",
            "https://gun.o8.is/gun",
            "https://relay.peer.ooo/gun",
        ],
        ...overrides,
    };
}
