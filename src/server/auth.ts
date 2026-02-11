import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Database } from "better-sqlite3";
import fetch from "node-fetch";
import crypto from "crypto";
import Gun from "gun";
import "gun/sea.js";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

export interface AuthService {
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    generateToken(payload: { isAdmin: boolean; username: string; artistId: number | null }): string;
    verifyToken(token: string): { isAdmin: boolean; username: string; artistId: number | null } | null;
    // Multi-user management
    authenticateUser(username: string, password: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number } | false>;
    createAdmin(username: string, password: string, artistId?: number | null): Promise<void>;
    updateAdmin(id: number, artistId: number | null): void;
    listAdmins(): { id: number; username: string; artist_id: number | null; created_at: string }[];
    deleteAdmin(id: number): void;
    changePassword(username: string, newPassword: string): Promise<void>;
    isFirstRun(): boolean;
    /** Returns true if the username belongs to the root admin (id=1, first created). */
    isRootAdmin(username: string): boolean;

    // Mastodon
    registerMastodonApp(instanceUrl: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string; redirectUri: string }>;
    getMastodonAuthUrl(instanceUrl: string, clientId: string, redirectUri: string): string;
    exchangeMastodonCode(instanceUrl: string, clientId: string, clientSecret: string, redirectUri: string, code: string): Promise<{ accessToken: string; user: { acct: string; display_name: string; url: string } }>;

    // Low-Level Mastodon Login (Sotto Banco)
    loginWithMastodon(instanceUrl: string, redirectUri: string, code: string): Promise<{ pair: any; alias: string }>;

    // GunDB Key Management
    encryptGunPriv(priv: any): string;
    decryptGunPriv(encrypted: string): any;
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
                    artist_id INTEGER DEFAULT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Check if username column exists (migration)
            const columns = db.prepare("PRAGMA table_info(admin)").all() as any[];
            const hasUsername = columns.some(c => c.name === 'username');
            const hasArtistId = columns.some(c => c.name === 'artist_id');

            if (!hasUsername || !hasArtistId) {
                console.log("📦 Migrating admin table to multi-user support (with artist linking)...");
                // We need to recreate the table
                // 1. Rename existing table
                db.exec("ALTER TABLE admin RENAME TO admin_old");

                // 2. Create new table
                db.exec(`
                    CREATE TABLE admin (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        artist_id INTEGER DEFAULT NULL,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 3. Migrate data
                const oldAdmins = db.prepare("SELECT * FROM admin_old").all() as any[];
                const insertStmt = db.prepare("INSERT INTO admin (id, username, password_hash, created_at, updated_at, artist_id) VALUES (?, ?, ?, ?, ?, ?)");

                for (const old of oldAdmins) {
                    // If migrating from v1 (no username), default to 'admin' for id 1
                    let username = old.username;
                    if (!hasUsername && old.id === 1) username = 'admin';

                    // Preserve ID if possible, or let autoincrement handle it if conflicts (but usually we want to keep ID 1 as root)
                    insertStmt.run(old.id, username, old.password_hash, old.created_at, old.updated_at, old.artist_id || null);
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

        generateToken(payload: { isAdmin: boolean; username: string; artistId: number | null }): string {
            return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRES_IN });
        },

        verifyToken(token: string): { isAdmin: boolean; username: string; artistId: number | null } | null {
            try {
                return jwt.verify(token, jwtSecret) as { isAdmin: boolean; username: string; artistId: number | null };
            } catch {
                return null;
            }
        },

        async authenticateUser(username: string, password: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number } | false> {
            const user = db.prepare("SELECT id, password_hash, artist_id FROM admin WHERE username = ?").get(username) as { id: number; password_hash: string; artist_id: number | null } | undefined;
            if (!user) return false;
            const valid = await this.verifyPassword(password, user.password_hash);
            if (!valid) return false;

            return {
                success: true,
                id: user.id,
                isAdmin: true,
                artistId: user.artist_id
            };
        },

        async createAdmin(username: string, password: string, artistId: number | null = null): Promise<void> {
            const hash = await this.hashPassword(password);
            db.prepare("INSERT INTO admin (username, password_hash, artist_id) VALUES (?, ?, ?)").run(username, hash, artistId);
        },

        updateAdmin(id: number, artistId: number | null): void {
            db.prepare("UPDATE admin SET artist_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(artistId, id);
        },

        listAdmins(): { id: number; username: string; artist_id: number | null; artist_name: string | null; created_at: string; is_root: boolean }[] {
            const rows = db.prepare(`
                SELECT a.id, a.username, a.artist_id, a.created_at, ar.name as artist_name 
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                ORDER BY a.username
            `).all() as any[];

            return rows.map(r => ({
                ...r,
                is_root: r.id === 1
            }));
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

        // Mastodon
        async registerMastodonApp(instanceUrl: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string; redirectUri: string }> {
            // Cleanup URL
            const url = new URL(instanceUrl.startsWith("http") ? instanceUrl : `https://${instanceUrl}`);
            const baseUrl = url.origin;

            // 1. Check DB for existing client
            const existing = db.prepare("SELECT * FROM oauth_clients WHERE instance_url = ?").get(baseUrl) as { client_id: string; client_secret: string; redirect_uri: string } | undefined;

            if (existing) {
                return {
                    clientId: existing.client_id,
                    clientSecret: existing.client_secret,
                    redirectUri: existing.redirect_uri
                };
            }

            // 2. Register if not found
            const response = await fetch(`${baseUrl}/api/v1/apps`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_name: "TuneCamp",
                    redirect_uris: redirectUri,
                    scopes: "read",
                    website: "https://github.com/scobru/tunecamp"
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to register app on ${baseUrl}: ${text}`);
            }

            const data = await response.json() as any;

            // 3. Save to DB
            db.prepare("INSERT INTO oauth_clients (instance_url, client_id, client_secret, redirect_uri) VALUES (?, ?, ?, ?)").run(baseUrl, data.client_id, data.client_secret, redirectUri);

            return {
                clientId: data.client_id,
                clientSecret: data.client_secret,
                redirectUri: redirectUri
            };
        },

        getMastodonAuthUrl(instanceUrl: string, clientId: string, redirectUri: string): string {
            const url = new URL(instanceUrl.startsWith("http") ? instanceUrl : `https://${instanceUrl}`);
            return `${url.origin}/oauth/authorize?client_id=${clientId}&scope=read&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
        },

        async exchangeMastodonCode(instanceUrl: string, clientId: string, clientSecret: string, redirectUri: string, code: string): Promise<{ accessToken: string; user: { acct: string; display_name: string; url: string } }> {
            const url = new URL(instanceUrl.startsWith("http") ? instanceUrl : `https://${instanceUrl}`);

            // 1. Get Token
            const tokenResp = await fetch(`${url.origin}/oauth/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri,
                    grant_type: "authorization_code",
                    code: code
                })
            });

            if (!tokenResp.ok) {
                throw new Error(`Failed to exchange code: ${await tokenResp.text()}`);
            }

            const tokenData = await tokenResp.json() as any;
            const accessToken = tokenData.access_token;

            // 2. Verify Credentials (get user profile)
            const verifyResp = await fetch(`${url.origin}/api/v1/accounts/verify_credentials`, {
                headers: { "Authorization": `Bearer ${accessToken}` }
            });

            if (!verifyResp.ok) {
                throw new Error(`Failed to verify credentials: ${await verifyResp.text()}`);
            }

            const userData = await verifyResp.json() as any;

            // Normalize acct (some instances don't include domain for local users)
            let acct = userData.acct;
            if (!acct.includes("@")) {
                acct = `${acct}@${url.hostname}`;
            }

            return {
                accessToken,
                user: {
                    acct,
                    display_name: userData.display_name,
                    url: userData.url
                }
            };
        },

        async loginWithMastodon(instanceUrl: string, redirectUri: string, code: string): Promise<{ pair: any; alias: string }> {
            // 1. Get Client
            const client = await this.registerMastodonApp(instanceUrl, redirectUri);

            // 2. Exchange Code
            const { accessToken, user } = await this.exchangeMastodonCode(instanceUrl, client.clientId, client.clientSecret, redirectUri, code);

            const subject = user.acct;
            const provider = "mastodon";

            // 3. Check for existing link
            const link = db.prepare("SELECT * FROM oauth_links WHERE provider = ? AND subject = ?").get(provider, subject) as { gun_pub: string; gun_priv: string } | undefined;

            if (link) {
                // Decrypt and return
                const pair = this.decryptGunPriv(link.gun_priv);
                console.log(`🔓 Mastodon Login: Found existing user ${subject} -> ${pair.pub.slice(0, 8)}...`);
                return { pair, alias: user.display_name || user.acct };
            }

            // 4. Create new identity
            console.log(`🆕 Mastodon Login: Creating NEW GunDB identity for ${subject}`);
            const pair = await Gun.SEA.pair();
            const encryptedPriv = this.encryptGunPriv(pair);

            db.prepare("INSERT INTO oauth_links (provider, subject, gun_pub, gun_priv) VALUES (?, ?, ?, ?)").run(provider, subject, pair.pub, encryptedPriv);

            // Register in gun_users table
            db.prepare(`INSERT OR IGNORE INTO gun_users (pub, epub, alias) VALUES (?, ?, ?)`).run(pair.pub, pair.epub, user.display_name || user.acct);

            return { pair, alias: user.display_name || user.acct };
        },

        // Encryption helpers
        encryptGunPriv(priv: any): string {
            const json = JSON.stringify(priv);
            const iv = crypto.randomBytes(16);
            // Derive a 32-byte key from jwtSecret properly
            const key = crypto.createHash('sha256').update(jwtSecret).digest();
            const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
            let encrypted = cipher.update(json, "utf8", "hex");
            encrypted += cipher.final("hex");
            return `${iv.toString("hex")}:${encrypted}`;
        },

        decryptGunPriv(encrypted: string): any {
            const [ivHex, dataHex] = encrypted.split(":");
            const iv = Buffer.from(ivHex, "hex");
            const key = crypto.createHash('sha256').update(jwtSecret).digest();
            const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
            let decrypted = decipher.update(dataHex, "hex", "utf8");
            decrypted += decipher.final("utf8");
            return JSON.parse(decrypted);
        }
    };
}
