import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import os from "os";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import { sanitizeFilename } from "../../utils/audioUtils.js";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

/**
 * Configure multer storage - Use system temp dir to avoid scanner interference
 */
function createTempStorage() {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const destDir = os.tmpdir();
            console.log(`📂 [Debug] Multer destination: ${destDir}`);
            cb(null, destDir);
        },
        filename: (req, file, cb) => {
            // Use random name to avoid collisions in temp
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname).toLowerCase();
            const filename = file.fieldname + '-' + uniqueSuffix + ext;
            console.log(`📄 [Debug] Multer filename: ${filename}`);
            cb(null, filename);
        },
    });
}

/**
 * File filter for audio and images
 */
function fileFilter(
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) {
    console.log(`🔍 [Debug] Multer fileFilter seeing file: ${file.fieldname} (${file.originalname})`);
    const ext = path.extname(file.originalname).toLowerCase();
    const isAudio = AUDIO_EXTENSIONS.includes(ext);
    const isImage = IMAGE_EXTENSIONS.includes(ext);

    if (isAudio || isImage) {
        cb(null, true);
    } else {
        console.warn(`❌ [Debug] Multer rejected file type: ${ext}`);
        cb(new Error(`Unsupported file type: ${ext}`));
    }
}

/**
 * File filter for images only
 */
function imageFileFilter(
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported image type: ${ext}`));
    }
}

// Removed createBackgroundStorage in favor of createTempStorage

export function createUploadRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string
): Router {
    const router = Router();

    const upload = multer({
        storage: createTempStorage(),
        fileFilter,
        limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
    });

    // Memory storage for covers (small files, avoids disk I/O in middleware)
    const uploadMemory = multer({
        storage: multer.memoryStorage(),
        fileFilter,
        limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for covers
    });

    const imageUpload = multer({
        storage: createTempStorage(),
        fileFilter: imageFileFilter,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    });

    /**
     * Helper for site-wide image uploads (background, site cover)
     */
    async function handleSiteSettingImageUpload(
        req: any,
        res: any,
        options: {
            type: string,
            settingKey: string,
            apiUrl: string,
            errorLabel: string
        }
    ) {
        try {
            if (req.artistId) {
                if (req.file) await fs.remove(req.file.path);
                return res.status(403).json({ error: `Restricted admins cannot change ${options.errorLabel}` });
            }
            const file = req.file;
            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            console.log(`🖼️ Uploaded ${options.errorLabel}: ${file.originalname}`);

            // Move to assets
            const assetsDir = path.join(musicDir, "assets");
            await fs.ensureDir(assetsDir);

            const ext = path.extname(file.originalname).toLowerCase() || ".png";
            const targetFilename = options.type + (IMAGE_EXTENSIONS.includes(ext) ? ext : ".png");
            const targetPath = path.join(assetsDir, targetFilename);

            await fs.move(file.path, targetPath, { overwrite: true });

            database.setSetting(options.settingKey, options.apiUrl);
            res.json({
                message: `${options.errorLabel.charAt(0).toUpperCase() + options.errorLabel.slice(1)} uploaded`,
                url: options.apiUrl,
                file: { name: targetFilename, size: file.size },
            });
        } catch (error) {
            console.error(`${options.errorLabel} upload error:`, error);
            if (req.file) await fs.remove(req.file.path).catch(() => { });
            res.status(500).json({ error: `${options.errorLabel.charAt(0).toUpperCase() + options.errorLabel.slice(1)} upload failed` });
        }
    }

    /**
     * POST /api/admin/upload/tracks
     * Upload one or more audio files
     */
    router.post("/tracks", upload.array("files", 50) as any, async (req: any, res: any) => {
        try {
            const files = req.files as Express.Multer.File[];
            const { releaseSlug } = req.body;

            if (!files || files.length === 0) {
                return res.status(400).json({ error: "No files uploaded" });
            }

            console.log(`📤 Upload received: ${files.length} track(s)`);
            files.forEach(f => console.log(`   - ${f.originalname}: ${(f.size / 1024 / 1024).toFixed(2)} MB`));
            if (releaseSlug) {
                console.log(`   Target Release Slug: ${releaseSlug}`);
            }

            // Get release if applicable
            const release = releaseSlug ? database.getAlbumBySlug(releaseSlug) : undefined;
            if (releaseSlug && !release) {
                console.warn(`⚠️ Target release not found: ${releaseSlug}`);
            }

            // SECURITY FIX: Prevent uploading to another artist's release
            if (release && (req as any).artistId && release.artist_id !== (req as any).artistId) {
                console.warn(`⛔ Access Denied: User ${(req as any).username} (Artist ${(req as any).artistId}) tried to upload to release ${release.slug} (Artist ${release.artist_id})`);
                // Cleanup temp files
                for (const file of files) {
                    await fs.remove(file.path).catch(() => { });
                }
                return res.status(403).json({ error: "Access denied: Cannot upload tracks to another artist's release" });
            }

            // Move files from temp to musicDir/tracks
            const destDir = path.join(musicDir, "tracks");
            await fs.ensureDir(destDir);

            let movedCount = 0;
            let processedCount = 0;
            const scannerResults = [];

            for (const file of files) {
                const sanitizedName = sanitizeFilename(file.originalname);
                let destPath = path.join(destDir, sanitizedName);

                // Check for collision and rename if necessary
                let counter = 1;
                const ext = path.extname(sanitizedName);
                const nameBase = path.basename(sanitizedName, ext);

                while (await fs.pathExists(destPath)) {
                    destPath = path.join(destDir, `${nameBase}_${counter}${ext}`);
                    counter++;
                }

                if (counter > 1) {
                    console.log(`   ⚠️ Filename collision. Renamed to: ${path.basename(destPath)}`);
                }

                try {
                    await fs.move(file.path, destPath, { overwrite: false }); // Should be safe now
                    movedCount++;

                    // Process immediately to get Track ID
                    const scanResult = await scanner.processAudioFile(destPath, musicDir);

                    if (scanResult && scanResult.success && scanResult.trackId) {
                        scannerResults.push(scanResult);
                        processedCount++;

                        // Link to release if applicable
                        if (release) {
                            database.addTrackToRelease(release.id, scanResult.trackId);
                            console.log(`   🔗 Linked new track ${scanResult.trackId} to release ${release.title}`);
                        }
                    }

                } catch (err) {
                    console.error(`❌ Failed to move or process uploaded file ${file.path}:`, err);
                    await fs.remove(file.path).catch(() => { });
                }
            }

            console.log(`✅ Processed ${movedCount}/${files.length} uploads to ${destDir}. Scanned: ${processedCount}`);

            res.status(202).json({
                message: `Uploaded ${movedCount} files. ${processedCount} processed and linked.`,
                results: scannerResults
            });
        } catch (error) {
            console.error("Upload error:", error);
            res.status(500).json({ error: "Upload failed" });
        }
    });

    /**
     * POST /api/admin/upload/cover
     * Upload a cover image for a release
     */
    router.post("/cover", (req: any, res: any, next: any) => {
        console.log("🔍 [Debug] Upload Request Headers:", req.headers['content-type']);
        next();
    }, imageUpload.single("file") as any, async (req: any, res: any) => {
        try {
            console.log("🔍 [Debug] Inside /cover handler");
            console.log("🔍 [Debug] req.file:", req.file ? `${req.file.originalname} (${req.file.size} bytes)` : "undefined");
            console.log("🔍 [Debug] req.body:", req.body);

            const file = req.file;
            const releaseSlug = req.body.releaseSlug;

            if (!file) {
                console.error("❌ [Debug] No file in req.file");
                return res.status(400).json({ error: "No file uploaded" });
            }

            console.log(`🎨 Uploaded cover: ${file.originalname}`);

            // If release slug provided, update release.yaml and database
            if (releaseSlug) {
                // Permission Check
                const targetAlbum = database.getAlbumBySlug(releaseSlug);

                if (!targetAlbum) {
                    await fs.remove(file.path);
                    return res.status(404).json({ error: "Release not found" });
                }

                if ((req as any).artistId && targetAlbum.artist_id !== (req as any).artistId) {
                    await fs.remove(file.path);
                    return res.status(403).json({ error: "Access denied: Cannot upload cover for another artist's release" });
                }

                // 1. Determine target directory: musicDir/releases/<slug>/artwork/
                // SECURITY: Use targetAlbum.slug (from DB) instead of req.body.releaseSlug to prevent path traversal
                const safeSlug = targetAlbum.slug;
                const releaseDir = path.join(musicDir, "releases", safeSlug);
                const artworkDir = path.join(releaseDir, "artwork");
                await fs.ensureDir(artworkDir);

                // 2. Move file to artwork dir with UNIQUE name to avoid locking
                const ext = path.extname(file.originalname).toLowerCase();
                const uniqueId = Date.now();
                const targetFilename = `cover-${uniqueId}${ext}`;
                const targetPath = path.join(artworkDir, targetFilename);

                await fs.move(file.path, targetPath, { overwrite: true });
                console.log(`   Moved cover to: ${targetPath}`);

                // 3. Update release.yaml (relative to release dir)
                const releaseYamlPath = path.join(releaseDir, "release.yaml");
                if (await fs.pathExists(releaseYamlPath)) {
                    try {
                        const yaml = await import("yaml");
                        const content = await fs.readFile(releaseYamlPath, "utf-8");
                        const config = yaml.parse(content);
                        config.cover = `artwork/${targetFilename}`; // Relative to release.yaml
                        await fs.writeFile(releaseYamlPath, yaml.stringify(config));
                    } catch (err) {
                        console.error("Error updating release.yaml:", err);
                    }
                }

                // 4. Update database (relative to musicDir)
                if (targetAlbum) {
                    const dbPath = path.relative(musicDir, targetPath).replace(/\\/g, "/");
                    database.updateAlbumCover(targetAlbum.id, dbPath);
                    console.log(`📀 Updated cover for album ${targetAlbum.title} -> ${dbPath}`);
                }

                // 5. Cleanup old covers (Best effort)
                try {
                    const files = await fs.readdir(artworkDir);
                    for (const f of files) {
                        if (f !== targetFilename && (f.startsWith("cover") || f.startsWith("folder") || f.startsWith("artwork"))) {
                            try {
                                await fs.remove(path.join(artworkDir, f));
                            } catch (e) {
                                console.warn(`   [Cleanup] Could not delete old cover ${f} (likely locked):`, e);
                            }
                        }
                    }
                } catch (cleanupErr) {
                    console.warn("   [Cleanup] Failed to list/clean artwork directory:", cleanupErr);
                }

            } else {
                // Orphan upload? Just clean up
                await fs.remove(file.path);
            }

            res.json({
                message: "Cover uploaded",
                file: {
                    name: file.originalname, // Return original name
                    size: file.size,
                },
            });
            console.log(`✅ Cover upload completed: ${file.originalname}`);
        } catch (error) {
            console.error("❌ Cover upload error:", error);
            // Try cleanup
            if (req.file) await fs.remove(req.file.path).catch(() => { });
            res.status(500).json({ error: "Cover upload failed" });
        }
    });

    /**
     * POST /api/admin/upload/avatar
     * Upload avatar for an artist
     */
    router.post("/avatar", imageUpload.single("file") as any, async (req: any, res: any) => {
        try {
            const file = req.file;
            const artistIdRaw = req.body.artistId;
            const artistId = artistIdRaw ? parseInt(artistIdRaw as string, 10) : undefined;

            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            if (!artistId) {
                return res.status(400).json({ error: "Artist ID required" });
            }

            // Permission Check
            if ((req as any).artistId && (req as any).artistId !== artistId) {
                await fs.remove(file.path);
                return res.status(403).json({ error: "Access denied: You can only upload avatars for your own artist" });
            }

            console.log(`👤 Uploaded avatar for artist ${artistId}: ${file.originalname}`);

            const ext = path.extname(file.originalname).toLowerCase();

            // Move avatar to assets folder
            const assetsDir = path.join(musicDir, "assets");
            await fs.ensureDir(assetsDir);

            const avatarFilename = `avatar-${artistId}${ext}`;
            const avatarPath = path.join(assetsDir, avatarFilename);

            // Remove old file if in different location, or overwrite
            if (file.path !== avatarPath) {
                await fs.move(file.path, avatarPath, { overwrite: true });
            }

            // Update artist in database (relative path)
            const artist = database.getArtist(artistId);
            if (artist) {
                const dbPath = path.relative(musicDir, avatarPath).replace(/\\/g, "/");
                database.updateArtist(artist.id, artist.bio || undefined, dbPath, artist.links ? JSON.parse(artist.links) : undefined);
            }

            res.json({
                message: "Avatar uploaded",
                file: {
                    name: avatarFilename,
                    path: avatarPath,
                    size: file.size,
                },
            });
            console.log(`✅ Avatar upload completed for artist ${artistId}`);
        } catch (error) {
            console.error("❌ Avatar upload error:", error);
            if (req.file) await fs.remove(req.file.path).catch(() => { });
            res.status(500).json({ error: "Avatar upload failed" });
        }
    });

    // Removed createSiteCoverStorage

    /**
     * POST /api/admin/upload/background
     * Upload site background image (saved to server, URL stored in settings)
     */
    router.post("/background", imageUpload.single("file") as any, async (req: any, res: any) => {
        await handleSiteSettingImageUpload(req, res, {
            type: "background",
            settingKey: "backgroundImage",
            apiUrl: "/api/settings/background",
            errorLabel: "site background"
        });
    });

    /**
     * POST /api/admin/upload/site-cover
     * Upload site cover image (for network list)
     */
    router.post("/site-cover", imageUpload.single("file") as any, async (req: any, res: any) => {
        await handleSiteSettingImageUpload(req, res, {
            type: "site-cover",
            settingKey: "coverImage",
            apiUrl: "/api/settings/cover",
            errorLabel: "site cover"
        });
    });

    return router;
}
