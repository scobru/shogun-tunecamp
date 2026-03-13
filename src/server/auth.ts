import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Database } from "better-sqlite3";
import fetch from "node-fetch";
import crypto from "crypto";
import md5 from "md5";
import Gun from "gun";
import "gun/sea.js";
import { isSafeUrl } from "../utils/networkUtils.js";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

export type UserRole = 'admin' | 'user';

export interface AuthService {
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    generateToken(payload: { isAdmin: boolean; username: string; artistId: number | null; role: UserRole }): string;
    verifyToken(token: string): { isAdmin: boolean; username: string; artistId: number | null; role: UserRole } | null;
    // Multi-user management
    authenticateUser(username: string, password: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number; role: UserRole; pair?: any } | false>;
    verifySubsonicToken(username: string, token: string, salt: string): Promise<boolean>;
    createAdmin(username: string, password: string, artistId?: number | null): Promise<void>;
    createUser(username: string, password: string, artistId: number, storageQuota?: number): Promise<{ id: number }>;
    updateAdmin(id: number, artistId: number | null): void;
    updateStorageUsed(userId: number, bytesUsed: number): void;
    getStorageInfo(userId: number): { storage_quota: number; storage_used: number } | null;
    listAdmins(): { id: number; username: string; artist_id: number | null; role: UserRole; storage_quota: number; created_at: string }[];
    deleteAdmin(id: number): void;
    changePassword(username: string, newPassword: string): Promise<void>;
    isFirstRun(): boolean;
    /** Returns true if the username belongs to the root admin (id=1, first created). */
    isRootAdmin(username: string): boolean;
    /** Returns the GunDB pair for a user if they have one. */
    getUserPair(username: string): any | null;
    /** Updates or sets the GunDB pair for a user. */
    updateGunPair(username: string, pair: any): void;

    // Mastodon
    registerMastodonApp(instanceUrl: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string; redirectUri: string }>;
    getMastodonAuthUrl(instanceUrl: string, clientId: string, redirectUri: string): string;
    exchangeMastodonCode(instanceUrl: string, clientId: string, clientSecret: string, redirectUri: string, code: string): Promise<{ accessToken: string; user: { acct: string; display_name: string; url: string } }>;

    // Low-Level Mastodon Login (Sotto Banco)
    loginWithMastodon(instanceUrl: string, redirectUri: string, code: string): Promise<{ pair: any; alias: string }>;

    // GunDB Key Management
    encryptGunPriv(priv: any): string;
    decryptGunPriv(encrypted: string): any;

    // Default password check
    isDefaultPassword(username: string): Promise<boolean>;
    init(): Promise<void>;
}

export function createAuthService(
    db: Database,
    jwtSecret: string,
    adminUser: string = "admin",
    adminPass: string = "admin"
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
                    role TEXT NOT NULL DEFAULT 'admin',
                    storage_quota INTEGER NOT NULL DEFAULT 0,
                    storage_used INTEGER NOT NULL DEFAULT 0,
                    subsonic_token TEXT,
                    subsonic_password TEXT,
                    gun_pub TEXT,
                    gun_priv TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Check if columns exist (migration)
            const columns = db.prepare("PRAGMA table_info(admin)").all() as any[];
            const hasUsername = columns.some(c => c.name === 'username');
            const hasArtistId = columns.some(c => c.name === 'artist_id');
            const hasRole = columns.some(c => c.name === 'role');
            const hasGunPub = columns.some(c => c.name === 'gun_pub');
            const hasSubsonic = columns.some(c => c.name === 'subsonic_token');

            if (!hasUsername || !hasArtistId || !hasRole || !hasGunPub || !hasSubsonic) {
                console.log("📦 Migrating admin table to multi-user support (with roles, storage quotas, GunDB keys & Subsonic support)...");
                // We need to recreate the table
                // 1. Rename existing table
                db.exec("ALTER TABLE admin RENAME TO admin_old");

                // 2. Create new table with role + storage + gun keys
                db.exec(`
                    CREATE TABLE admin (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        artist_id INTEGER DEFAULT NULL,
                        role TEXT NOT NULL DEFAULT 'admin',
                        storage_quota INTEGER NOT NULL DEFAULT 0,
                        storage_used INTEGER NOT NULL DEFAULT 0,
                        subsonic_token TEXT,
                        subsonic_password TEXT,
                        gun_pub TEXT,
                        gun_priv TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 3. Migrate data - existing users keep role='admin' and unlimited quota (0)
                const oldAdmins = db.prepare("SELECT * FROM admin_old").all() as any[];
                const insertStmt = db.prepare("INSERT INTO admin (id, username, password_hash, created_at, updated_at, artist_id, role, storage_quota, storage_used, gun_pub, gun_priv, subsonic_token, subsonic_password) VALUES (?, ?, ?, ?, ?, ?, 'admin', 0, 0, ?, ?, ?, ?)");

                for (const old of oldAdmins) {
                    let username = old.username;
                    if (!hasUsername && old.id === 1) username = 'admin';
                    insertStmt.run(
                        old.id, 
                        username, 
                        old.password_hash, 
                        old.created_at, 
                        old.updated_at, 
                        old.artist_id || null, 
                        old.gun_pub || null, 
                        old.gun_priv || null,
                        old.subsonic_token || null,
                        old.subsonic_password || null
                    );
                }

                // 4. Drop old table
                db.exec("DROP TABLE admin_old");
            } else {
                // Migration: Existing users with 10MB quota (likely early test users) get upgraded to 1GB
                const TEN_MB = 10 * 1024 * 1024;
                const ONE_GB = 1024 * 1024 * 1024;
                db.prepare("UPDATE admin SET storage_quota = ? WHERE storage_quota = ?").run(ONE_GB, TEN_MB);
            }
        }
    } catch (e) {
        console.error("Database migration error:", e);
    }

    return {
        async init(): Promise<void> {
            const user = db.prepare("SELECT id, password_hash, role FROM admin WHERE username = ?").get(adminUser) as { id: number; password_hash: string; role: UserRole } | undefined;
            
            if (!user) {
                console.log(`🔐 Admin user '${adminUser}' not found. Creating from configuration...`);
                await this.createAdmin(adminUser, adminPass);
            } else {
                // Ensure password matches the configuration (Source of Truth)
                const passwordMatches = await this.verifyPassword(adminPass, user.password_hash);
                if (!passwordMatches) {
                    console.log(`🔐 Updating password for admin user '${adminUser}' to match configuration...`);
                    await this.changePassword(adminUser, adminPass);
                }
                
                // Ensure role is admin
                if (user.role !== 'admin') {
                    console.log(`🔐 Updating role for user '${adminUser}' to 'admin'...`);
                    db.prepare("UPDATE admin SET role = 'admin' WHERE id = ?").run(user.id);
                }
            }

            const count = (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count;
            if (count === 0) {
                console.log("🆕 First run detected: No users found in database.");
            }
        },

        async isDefaultPassword(username: string): Promise<boolean> {
            const user = db.prepare("SELECT password_hash FROM admin WHERE username = ?").get(username) as { password_hash: string } | undefined;
            if (!user) return false;
            return this.verifyPassword("tunecamp", user.password_hash);
        },

        async hashPassword(password: string): Promise<string> {
            return bcrypt.hash(password, SALT_ROUNDS);
        },

        async verifyPassword(password: string, hash: string): Promise<boolean> {
            return bcrypt.compare(password, hash);
        },

        generateToken(payload: { isAdmin: boolean; username: string; artistId: number | null; role: UserRole }): string {
            return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRES_IN });
        },

        verifyToken(token: string): { isAdmin: boolean; username: string; artistId: number | null; role: UserRole } | null {
            try {
                const decoded = jwt.verify(token, jwtSecret) as any;
                return {
                    isAdmin: decoded.isAdmin ?? (decoded.role === 'admin'),
                    username: decoded.username,
                    artistId: decoded.artistId ?? null,
                    role: decoded.role || 'admin' // backward compat: old tokens without role are admin
                };
            } catch {
                return null;
            }
        },

        async authenticateUser(username: string, password: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number; role: UserRole; pair?: any } | false> {
            const user = db.prepare("SELECT id, password_hash, artist_id, role, gun_pub, gun_priv FROM admin WHERE username = ?").get(username) as { id: number; password_hash: string; artist_id: number | null; role: UserRole; gun_pub: string | null; gun_priv: string | null } | undefined;
            if (!user) return false;
            const valid = await this.verifyPassword(password, user.password_hash);
            if (!valid) return false;

            const userRole: UserRole = user.role || 'admin';

            // Handle GunDB Key Management for all users
            let gunPair: any = undefined;
            if (user.gun_pub && user.gun_priv) {
                try {
                    gunPair = this.decryptGunPriv(user.gun_priv);
                } catch (e) {
                    console.error("Failed to decrypt GunDB keys for user", username);
                }
            } else {
                // Lazy-generate GunDB identity for any user who doesn't have one yet
                console.log(`🔐 Generating new GunDB Identity for ${userRole} ${username}...`);
                gunPair = await Gun.SEA.pair();
                const encryptedPriv = this.encryptGunPriv(gunPair);
                db.prepare("UPDATE admin SET gun_pub = ?, gun_priv = ? WHERE id = ?").run(gunPair.pub, encryptedPriv, user.id);
            }

            // Update Subsonic Token (MD5 of cleartext password) on successful login
            const subsonicToken = md5(password);
            db.prepare("UPDATE admin SET subsonic_token = ? WHERE id = ?").run(subsonicToken, user.id);

            // Also store encrypted cleartext password for Subsonic token+salt auth
            const encryptedPass = encryptGunPrivHelper(password, jwtSecret);
            try {
                db.prepare("UPDATE admin SET subsonic_password = ? WHERE id = ?").run(encryptedPass, user.id);
            } catch (e) {
                // Column might not exist yet
            }

            let artistId = user.artist_id;

            // Handle Artist Profile (Actor) Management - ensure everyone has an artist record for wallet support
            if (!artistId) {
                console.log(`🎤 Creating missing artist profile for ${userRole} ${username}...`);
                const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                
                // Simple slug collision handling
                let finalSlug = slug;
                let attempt = 0;
                while (attempt < 10) {
                    try {
                        const result = db.prepare("INSERT INTO artists (name, slug, bio) VALUES (?, ?, ?)").run(username, finalSlug, `Artist profile for ${username}`);
                        artistId = result.lastInsertRowid as number;
                        db.prepare("UPDATE admin SET artist_id = ? WHERE id = ?").run(artistId, user.id);
                        break;
                    } catch (e: any) {
                        if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
                            attempt++;
                            finalSlug = `${slug}-${attempt}`;
                        } else {
                            throw e;
                        }
                    }
                }
            }

            return {
                success: true,
                id: user.id,
                isAdmin: userRole === 'admin',
                artistId: artistId,
                role: userRole,
                pair: gunPair
            };
        },

        async verifySubsonicToken(username: string, token: string, salt: string): Promise<boolean> {
            const user = db.prepare("SELECT subsonic_token, subsonic_password FROM admin WHERE username = ?").get(username) as { subsonic_token: string; subsonic_password: string } | undefined;
            if (!user) return false;

            // Method 1: Use stored encrypted password (preferred, standard Subsonic auth)
            // Standard: token = md5(password + salt)
            if (user.subsonic_password) {
                try {
                    const clearPassword = decryptGunPrivHelper(user.subsonic_password, jwtSecret);
                    const expectedToken = md5(clearPassword + salt);
                    if (token === expectedToken) return true;
                } catch (e) {
                    // Decryption failed, fall through to method 2
                }
            }

            // Method 2: Use stored md5(password) - check if client sent md5(md5(password) + salt)
            if (user.subsonic_token) {
                const expectedTokenFromMd5 = md5(user.subsonic_token + salt);
                if (token === expectedTokenFromMd5) return true;
            }

            return false;
        },

        async createAdmin(username: string, password: string, artistId: number | null = null): Promise<void> {
            const hash = await this.hashPassword(password);
            db.prepare("INSERT INTO admin (username, password_hash, artist_id, role, storage_quota) VALUES (?, ?, ?, 'admin', 0)").run(username, hash, artistId);
        },

        async createUser(username: string, password: string, artistId: number, storageQuota: number = 1024 * 1024 * 1024): Promise<{ id: number }> {
            const hash = await this.hashPassword(password);
            const result = db.prepare("INSERT INTO admin (username, password_hash, artist_id, role, storage_quota, storage_used) VALUES (?, ?, ?, 'user', ?, 0)").run(username, hash, artistId, storageQuota);
            return { id: Number(result.lastInsertRowid) };
        },

        updateAdmin(id: number, artistId: number | null): void {
            db.prepare("UPDATE admin SET artist_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(artistId, id);
        },

        updateStorageUsed(userId: number, bytesUsed: number): void {
            db.prepare("UPDATE admin SET storage_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(bytesUsed, userId);
        },

        getStorageInfo(userId: number): { storage_quota: number; storage_used: number } | null {
            return db.prepare("SELECT storage_quota, storage_used FROM admin WHERE id = ?").get(userId) as { storage_quota: number; storage_used: number } | null;
        },

        listAdmins(): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; created_at: string; is_root: boolean }[] {
            const rows = db.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.created_at, ar.name as artist_name 
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                ORDER BY a.username
            `).all() as any[];

            return rows.map(r => ({
                ...r,
                role: r.role || 'admin',
                is_root: r.id === 1
            }));
        },

        deleteAdmin(id: number): void {
            // Prevent deleting the root admin (id=1)
            if (id === 1) {
                throw new Error("Cannot delete the primary admin");
            }
            // Prevent deleting the last admin
            const adminCount = (db.prepare("SELECT COUNT(*) as count FROM admin WHERE role = 'admin'").get() as any).count;
            const user = db.prepare("SELECT role FROM admin WHERE id = ?").get(id) as { role: string } | undefined;
            if (user?.role === 'admin' && adminCount <= 1) {
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

        getUserPair(username: string): any | null {
            const user = db.prepare("SELECT gun_priv FROM admin WHERE username = ?").get(username) as { gun_priv: string | null } | undefined;
            if (!user || !user.gun_priv) return null;
            try {
                return this.decryptGunPriv(user.gun_priv);
            } catch (e) {
                console.error("Failed to decrypt GunDB keys for user", username);
                return null;
            }
        },

        updateGunPair(username: string, pair: any): void {
            const encryptedPriv = this.encryptGunPriv(pair);
            db.prepare("UPDATE admin SET gun_pub = ?, gun_priv = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(pair.pub, encryptedPriv, username);
            
            // Also ensure it's in gun_users for profile lookups
            db.prepare(`INSERT OR IGNORE INTO gun_users (pub, epub, alias) VALUES (?, ?, ?)`).run(pair.pub, pair.epub, username);
        },

        // Mastodon
        async registerMastodonApp(instanceUrl: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string; redirectUri: string }> {
            // Cleanup URL
            const url = new URL(instanceUrl.startsWith("http") ? instanceUrl : `https://${instanceUrl}`);
            const baseUrl = url.origin;

            // Validate SSRF
            if (!(await isSafeUrl(baseUrl))) {
                throw new Error("Invalid or unsafe instance URL");
            }

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

            // Validate SSRF
            if (!(await isSafeUrl(url.origin))) {
                throw new Error("Invalid or unsafe instance URL");
            }

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
            return encryptGunPrivHelper(priv, jwtSecret);
        },

        decryptGunPriv(encrypted: string): any {
            return decryptGunPrivHelper(encrypted, jwtSecret);
        }
    };
}

/**
 * Encrypts a private key using AES-256-GCM (Authenticated Encryption)
 */
export function encryptGunPrivHelper(priv: any, secret: string): string {
    const json = JSON.stringify(priv);
    // GCM standard IV is 12 bytes
    const iv = crypto.randomBytes(12);
    // Derive a 32-byte key from secret
    const key = crypto.createHash('sha256').update(secret).digest();
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(json, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    // Format: IV:Data:AuthTag
    return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

/**
 * Decrypts a private key using AES-256-GCM (or AES-256-CBC for legacy data)
 */
export function decryptGunPrivHelper(encrypted: string, secret: string): any {
    const parts = encrypted.split(":");
    const key = crypto.createHash('sha256').update(secret).digest();

    if (parts.length === 3) {
        // GCM (New Format)
        const [ivHex, dataHex, authTagHex] = parts;
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(dataHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return JSON.parse(decrypted);
    } else {
        // CBC (Legacy Format) - no auth tag
        const [ivHex, dataHex] = parts;
        const iv = Buffer.from(ivHex, "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(dataHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return JSON.parse(decrypted);
    }
}
