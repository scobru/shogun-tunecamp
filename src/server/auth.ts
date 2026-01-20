import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Database } from "better-sqlite3";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

export interface AuthService {
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    generateToken(payload: { isAdmin: boolean }): string;
    verifyToken(token: string): { isAdmin: boolean } | null;
    getAdminPasswordHash(): string | null;
    setAdminPassword(password: string): Promise<void>;
    isFirstRun(): boolean;
}

export function createAuthService(
    db: Database,
    jwtSecret: string
): AuthService {
    // Ensure admin table exists
    db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

    return {
        async hashPassword(password: string): Promise<string> {
            return bcrypt.hash(password, SALT_ROUNDS);
        },

        async verifyPassword(password: string, hash: string): Promise<boolean> {
            return bcrypt.compare(password, hash);
        },

        generateToken(payload: { isAdmin: boolean }): string {
            return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRES_IN });
        },

        verifyToken(token: string): { isAdmin: boolean } | null {
            try {
                return jwt.verify(token, jwtSecret) as { isAdmin: boolean };
            } catch {
                return null;
            }
        },

        getAdminPasswordHash(): string | null {
            const row = db
                .prepare("SELECT password_hash FROM admin WHERE id = 1")
                .get() as { password_hash: string } | undefined;
            return row?.password_hash || null;
        },

        async setAdminPassword(password: string): Promise<void> {
            const hash = await this.hashPassword(password);
            const existing = this.getAdminPasswordHash();

            if (existing) {
                db.prepare(
                    "UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
                ).run(hash);
            } else {
                db.prepare(
                    "INSERT INTO admin (id, password_hash) VALUES (1, ?)"
                ).run(hash);
            }
        },

        isFirstRun(): boolean {
            return this.getAdminPasswordHash() === null;
        },
    };
}
