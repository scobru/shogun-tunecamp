import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import * as mm from 'music-metadata';
import { glob } from 'glob';
import type { DatabaseService } from './database.js';
import type { ServerConfig } from './config.js';

/**
 * 🛠️ TuneCamp Startup Maintenance
 * Automatically repairs corrupted paths and restores "lost" tracks found on disk.
 */

async function getFastFileHash(filePath: string): Promise<string> {
    try {
        const stats = await fs.stat(filePath);
        const size = stats.size;
        const buffer = Buffer.alloc(16384);
        const fd = await fs.open(filePath, 'r');
        
        // Read first 8KB
        await fs.read(fd, buffer, 0, 8192, 0);
        // Read last 8KB
        await fs.read(fd, buffer, 8192, 8192, Math.max(0, size - 8192));
        await fs.close(fd);
        
        return crypto.createHash('md5').update(buffer).digest('hex');
    } catch (e) {
        return "";
    }
}

function cleanPath(p: string | null): string | null {
    if (!p) return null;
    let cleaned = p.replace(/\\/g, "/");
    while (cleaned.startsWith("../")) {
        cleaned = cleaned.substring(3);
    }
    return cleaned;
}

export async function runStartupMaintenance(database: DatabaseService, config: ServerConfig) {
    console.log(`\n📦 [Maintenance] Starting startup maintenance phase...`);
    const startTime = Date.now();

    const musicDir = path.resolve(config.musicDir).replace(/\\/g, '/');

    try {
        // 1. Repair Corrupted Paths in Database
        console.log(`📦 [Maintenance] Repairing corrupted paths in database...`);
        const tracks = database.db.prepare("SELECT id, file_path, lossless_path FROM tracks").all() as any[];
        let repairCount = 0;

        const updateStmt = database.db.prepare("UPDATE tracks SET file_path = ?, lossless_path = ? WHERE id = ?");
        
        database.db.transaction(() => {
            for (const track of tracks) {
                const newPath = cleanPath(track.file_path);
                const newLossless = cleanPath(track.lossless_path);
                if (newPath !== track.file_path || newLossless !== track.lossless_path) {
                    updateStmt.run(newPath, newLossless, track.id);
                    repairCount++;
                }
            }
        })();

        if (repairCount > 0) {
            console.log(`✅ [Maintenance] Repaired ${repairCount} track paths.`);
        }

        // 2. Relink Orphaned Files (Restore Lost Tracks)
        console.log(`📦 [Maintenance] Scanning for orphaned music files in ${musicDir}...`);
        const files = await glob("**/*.{mp3,flac,wav,m4a,ogg}", { cwd: musicDir, posix: true });
        
        const dbPaths = new Set(
            (database.db.prepare("SELECT file_path FROM tracks").all() as any[])
                .map(t => t.file_path?.toLowerCase())
                .filter(Boolean)
        );

        const orphans = files.filter(f => !dbPaths.has(f.toLowerCase()));

        if (orphans.length > 0) {
            console.log(`📦 [Maintenance] Found ${orphans.length} orphaned files on disk. Restoring...`);
            let restored = 0;

            // Pre-cache artists for faster lookup
            const artists = database.db.prepare("SELECT id, name FROM artists").all() as any[];
            const artistMap = new Map(artists.map(a => [a.name.toLowerCase(), a.id]));

            for (const file of orphans) {
                const fullPath = path.join(musicDir, file);
                try {
                    const metadata = await mm.parseFile(fullPath);
                    const common = metadata.common;
                    const format = metadata.format;
                    const artistName = common.artist || "Unknown Artist";
                    
                    let artistId = artistMap.get(artistName.toLowerCase());
                    if (!artistId) {
                        artistId = database.createArtist(artistName);
                        artistMap.set(artistName.toLowerCase(), artistId);
                    }

                    const hash = await getFastFileHash(fullPath);

                    database.createTrack({
                        title: common.title || path.basename(file, path.extname(file)),
                        album_id: null, // Scanned later by main scanner
                        artist_id: artistId,
                        owner_id: null,
                        track_num: common.track.no || null,
                        duration: format.duration || null,
                        file_path: file,
                        format: format.codec || path.extname(file).substring(1),
                        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
                        sample_rate: format.sampleRate || null,
                        hash: hash
                    });
                    restored++;
                } catch (e) {
                    console.error(`❌ [Maintenance] Failed to restore orphan: ${file}`, e);
                }
            }
            console.log(`✅ [Maintenance] Restored ${restored} tracks to the library.`);
        } else {
            console.log(`✨ [Maintenance] Library is clean. No orphans found.`);
        }

    } catch (error) {
        console.error(`❌ [Maintenance] Error during startup maintenance:`, error);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`📦 [Maintenance] Phase complete (${duration}s).\n`);
}
