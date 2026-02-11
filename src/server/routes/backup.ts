import { Router } from "express";
import archiver from "archiver";
import fs from "fs-extra";
import path from "path";
import multer from "multer";
import type { DatabaseService } from "../database.js";
import type { ServerConfig } from "../config.js";

// Ensure uploads directory exists
fs.ensureDirSync("uploads");

const upload = multer({ dest: "uploads/" });

async function performRestore(zipPath: string, config: ServerConfig, database: DatabaseService, restartFn: () => void) {
    // Unique temp directory for extraction
    const extractPath = path.join(path.dirname(zipPath), "restore_temp_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5));

    try {
        // 1. Extract ZIP
        console.log("📦 [Restore] Extracting backup...");
        await fs.ensureDir(extractPath);

        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(zipPath);

        // Use async extraction to avoid blocking event loop
        await new Promise<void>((resolve, reject) => {
            zip.extractAllToAsync(extractPath, true, false, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        // Helper to find items recursively (BFS)
        const findItem = async (root: string, name: string, type: 'file' | 'dir'): Promise<string | null> => {
            const queue = [root];
            while (queue.length > 0) {
                const currentPath = queue.shift()!;
                try {
                    const items = await fs.readdir(currentPath, { withFileTypes: true });
                    // Check direct children first
                    for (const item of items) {
                        if (item.name === name) {
                            if (type === 'file' && item.isFile()) return path.join(currentPath, item.name);
                            if (type === 'dir' && item.isDirectory()) return path.join(currentPath, item.name);
                        }
                    }
                    // Add subdirectories to queue
                    for (const item of items) {
                        if (item.isDirectory()) {
                            queue.push(path.join(currentPath, item.name));
                        }
                    }
                } catch (e) { /* ignore */ }
            }
            return null;
        };

        // 2. Locate backup components
        const dbSource = await findItem(extractPath, "tunecamp.db", "file");
        const musicSource = await findItem(extractPath, "music", "dir");

        if (!dbSource && !musicSource) {
            throw new Error("Invalid backup format: Could not find 'tunecamp.db' or 'music' folder.");
        }

        // 3. Restore Music
        if (musicSource) {
            console.log(`🎵 [Restore] Restoring music files from ${musicSource}...`);
            await fs.copy(musicSource, config.musicDir, { overwrite: true });
        }

        // 4. Restore DB
        if (dbSource) {
            console.log(`💾 [Restore] Restoring database from ${dbSource}...`);

            // Close DB connection!
            try {
                database.db.close();
            } catch (e) {
                console.warn("⚠️ [Restore] Could not close DB connection cleanly:", e);
            }

            // Small delay to ensure file handles are released
            await new Promise(r => setTimeout(r, 500));

            // Replace file
            await fs.copy(dbSource, config.dbPath, { overwrite: true });

            // Clean up WAL/SHM just in case
            if (fs.existsSync(config.dbPath + "-wal")) fs.unlinkSync(config.dbPath + "-wal");
            if (fs.existsSync(config.dbPath + "-shm")) fs.unlinkSync(config.dbPath + "-shm");

            console.log("✅ [Restore] Database restore complete.");
        } else {
            console.log("✅ [Restore] Audio-only restore complete.");
        }

        // Restart
        console.log("🔄 [Restore] Triggering server restart...");
        if (restartFn) restartFn();
        else process.exit(0);

    } catch (error: any) {
        console.error("❌ [Restore] Failed:", error);
    } finally {
        // Cleanup
        // Use Promise API for fs-extra to allow .catch() or just suppress error in callback
        fs.unlink(zipPath).catch(() => { });
        fs.remove(extractPath).catch(() => { });
    }
}

export function createBackupRoutes(database: DatabaseService, config: ServerConfig, restartFn: () => void): Router {
    const router = Router();

    /**
     * GET /api/admin/backup/full
     * Download full backup (Database + Music + Config)
     */
    router.get("/full", async (req: any, res) => {
        try {
            if (req.artistId) {
                return res.status(403).send("Unauthorized: Backups restricted to Root Admin");
            }
            const archive = archiver("zip", { zlib: { level: 9 } });

            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="tunecamp_backup_${new Date().toISOString().split('T')[0]}.zip"`);

            archive.pipe(res);

            // 1. Backup Database safely
            // We use SQLite's VACUUM INTO to create a safe snapshot without locking for too long
            const dbBackupPath = path.join(config.dbPath + ".backup");
            try {
                // Delete previous backup if exists
                if (fs.existsSync(dbBackupPath)) fs.unlinkSync(dbBackupPath);

                // VACUUM INTO is available in newer SQLite/better-sqlite3 versions
                database.db.prepare(`VACUUM INTO ?`).run(dbBackupPath);

                archive.file(dbBackupPath, { name: "tunecamp.db" });
            } catch (e) {
                console.error("VACUUM INTO failed, falling back to direct copy (risky)", e);
                // Fallback: Copy file (might be corrupted if busy)
                archive.file(config.dbPath, { name: "tunecamp.db" });
            }

            // 2. Music Directory
            archive.directory(config.musicDir, "music");

            // 3. Config file
            archive.append(JSON.stringify(config, null, 2), { name: "config_dump.json" });

            // 4. Keys (Artists and System)
            try {
                // Artists Keys
                const artists = database.getArtists();
                const artistsKeys: any = {};
                artists.forEach(a => {
                    if (a.public_key && a.private_key) {
                        artistsKeys[a.slug] = {
                            id: a.id,
                            name: a.name,
                            slug: a.slug,
                            publicKey: a.public_key,
                            privateKey: a.private_key
                        };
                    }
                });
                archive.append(JSON.stringify(artistsKeys, null, 2), { name: "keys/artists_keys.json" });

                // System Identity (GunDB)
                const systemKeys = database.getSetting("gunPair");
                if (systemKeys) {
                    archive.append(systemKeys, { name: "keys/system_identity.json" });
                }
            } catch (e) {
                console.warn("Failed to backup keys:", e);
                archive.append(JSON.stringify({ error: String(e) }), { name: "keys/error.log" });
            }

            await archive.finalize();

            // Cleanup backup file after stream ends (approximate)
            res.on("finish", () => {
                if (fs.existsSync(dbBackupPath)) fs.unlink(dbBackupPath, () => { });
            });

        } catch (error) {
            console.error("Backup failed:", error);
            if (!res.headersSent) res.status(500).send("Backup failed");
        }
    });

    /**
     * GET /api/admin/backup/audio
     * Download audio only
     */
    router.get("/audio", async (req: any, res) => {
        try {
            if (req.artistId) {
                return res.status(403).send("Unauthorized: Backups restricted to Root Admin");
            }
            const archive = archiver("zip", { zlib: { level: 0 } }); // Store only, faster for audio

            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="tunecamp_audio_${new Date().toISOString().split('T')[0]}.zip"`);

            archive.pipe(res);

            archive.directory(config.musicDir, false); // false = content of dir, not dir itself

            await archive.finalize();
        } catch (error) {
            console.error("Audio export failed:", error);
            if (!res.headersSent) res.status(500).send("Export failed");
        }
    });

    /**
     * POST /api/admin/backup/restore
     * Upload and restore backup (Legacy/Single File)
     */
    router.post("/restore", upload.single("backup"), (req: any, res) => {
        if (req.artistId) {
            return res.status(403).send("Unauthorized: Restore restricted to Root Admin");
        }
        if (!req.file) {
            return res.status(400).send("No file uploaded");
        }

        const zipPath = req.file.path;

        // Respond immediately to prevent timeout
        res.json({ message: "Restore started in background. Server will restart upon completion." });

        // Run restore in background
        performRestore(zipPath, config, database, restartFn);
    });

    /**
     * POST /api/admin/backup/chunk
     * Receive a file chunk
     */
    router.post("/chunk", upload.single("chunk"), async (req: any, res) => {
        try {
            if (req.artistId) return res.status(403).send("Unauthorized");

            let uploadId = req.body.uploadId;
            if (!uploadId || typeof uploadId !== 'string') {
                return res.status(400).send("Invalid uploadId");
            }
            // Sanitize: allow alphanumeric, dash, underscore to prevent path traversal
            uploadId = uploadId.replace(/[^a-zA-Z0-9-_]/g, '');

            const chunkIndex = parseInt(req.body.chunkIndex);

            if (!uploadId || isNaN(chunkIndex)) {
                return res.status(400).send("Invalid chunk data");
            }

            if (!req.file) {
                return res.status(400).send("No chunk uploaded");
            }

            const chunkPath = req.file.path;
            const finalPath = path.join("uploads", `temp_${uploadId}`);

            try {
                // Append chunk to the final file
                const chunkBuffer = await fs.readFile(chunkPath);
                await fs.appendFile(finalPath, chunkBuffer);
                res.json({ success: true, chunkIndex });
            } finally {
                // Delete chunk temp file, ignoring errors if already deleted
                await fs.unlink(chunkPath).catch(() => {});
            }

        } catch (error: any) {
            console.error("Chunk upload failed:", error);
            res.status(500).send(error.message);
        }
    });

    /**
     * POST /api/admin/backup/restore-chunked
     * Finalize chunked upload and trigger restore
     */
    router.post("/restore-chunked", async (req: any, res) => {
        try {
            if (req.artistId) return res.status(403).send("Unauthorized");

            let uploadId = req.body.uploadId;
            if (!uploadId || typeof uploadId !== 'string') return res.status(400).send("Missing or invalid uploadId");

            // Sanitize
            uploadId = uploadId.replace(/[^a-zA-Z0-9-_]/g, '');

            const tempPath = path.join("uploads", `temp_${uploadId}`);
            const finalZipPath = path.join("uploads", `backup_${uploadId}.zip`);

            if (!(await fs.pathExists(tempPath))) {
                return res.status(404).send("Upload not found or expired");
            }

            // Rename to .zip
            await fs.rename(tempPath, finalZipPath);

            // Respond immediately
            res.json({ message: "Restore started in background. Server will restart upon completion." });

            // Run restore
            performRestore(finalZipPath, config, database, restartFn);

        } catch (error: any) {
            console.error("Restore trigger failed:", error);
            res.status(500).send(error.message);
        }
    });

    return router;
}
