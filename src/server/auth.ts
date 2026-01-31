import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Database } from "better-sqlite3";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

export interface AuthService {
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    generateToken(payload: { isAdmin: boolean; username: string }): string;
    verifyToken(token: string): { isAdmin: boolean; username: string } | null;
    // Multi-user management
    authenticateUser(username: string, password: string): Promise<boolean>;
    createAdmin(username: string, password: string): Promise<void>;
    listAdmins(): { id: number; username: string; created_at: string }[];
    deleteAdmin(id: number): void;
    changePassword(username: string, newPassword: string): Promise<void>;
    isFirstRun(): boolean;
    /** Returns true if the username belongs to the root admin (id=1, first created). */
    isRootAdmin(username: string): boolean;
}

export function createAuthService(
    db: Database,
    jwtSecret: string
): AuthService {
    // Ensure admin table exists with new schema
    try {
        // Check if table exists
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin'").get();

        if (!tableExists) {
            db.exec(`
                CREATE TABLE admin (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Check if username column exists (migration)
            const columns = db.prepare("PRAGMA table_info(admin)").all() as any[];
            const hasUsername = columns.some(c => c.name === 'username');

            if (!hasUsername) {
                console.log("📦 Migrating admin table to multi-user support...");
                // We need to recreate the table to remove the CHECK constraint on ID
                // 1. Rename existing table
                db.exec("ALTER TABLE admin RENAME TO admin_old");

                // 2. Create new table
                db.exec(`
                    CREATE TABLE admin (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 3. Migrate data (default to 'admin' username for existing record)
                const oldAdmin = db.prepare("SELECT * FROM admin_old WHERE id = 1").get() as any;
                if (oldAdmin) {
                    db.prepare("INSERT INTO admin (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)")
                        .run('admin', oldAdmin.password_hash, oldAdmin.created_at, oldAdmin.updated_at);
                }

                // 4. Drop old table
                db.exec("DROP TABLE admin_old");
            }
        }
    } catch (e) {
        console.error("Database migration error:", e);
    }

    return {
        async hashPassword(password: string): Promise<string> {
            return bcrypt.hash(password, SALT_ROUNDS);
        },

        async verifyPassword(password: string, hash: string): Promise<boolean> {
            return bcrypt.compare(password, hash);
        },

        generateToken(payload: { isAdmin: boolean; username: string }): string {
            return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRES_IN });
        },

        verifyToken(token: string): { isAdmin: boolean; username: string } | null {
            try {
                return jwt.verify(token, jwtSecret) as { isAdmin: boolean; username: string };
            } catch {
                return null;
            }
        },

        async authenticateUser(username: string, password: string): Promise<boolean> {
            const user = db.prepare("SELECT password_hash FROM admin WHERE username = ?").get(username) as { password_hash: string } | undefined;
            if (!user) return false;
            return this.verifyPassword(password, user.password_hash);
        },

        async createAdmin(username: string, password: string): Promise<void> {
            const hash = await this.hashPassword(password);
            db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run(username, hash);
        },

        listAdmins(): { id: number; username: string; created_at: string }[] {
            return db.prepare("SELECT id, username, created_at FROM admin ORDER BY username").all() as any[];
        },

        deleteAdmin(id: number): void {
            // Prevent deleting the root admin (id=1)
            if (id === 1) {
                throw new Error("Cannot delete the primary admin");
            }
            // Prevent deleting the last admin
            const count = (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count;
            if (count <= 1) {
                throw new Error("Cannot delete the last admin user");
            }
            db.prepare("DELETE FROM admin WHERE id = ?").run(id);
        },

        async changePassword(username: string, newPassword: string): Promise<void> {
            const hash = await this.hashPassword(newPassword);
            db.prepare("UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(hash, username);
        },

        isFirstRun(): boolean {
            const count = (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count;
            return count === 0;
        },

        isRootAdmin(username: string): boolean {
            const row = db.prepare("SELECT id FROM admin WHERE username = ?").get(username) as { id: number } | undefined;
            return row?.id === 1;
        },
    };
}
