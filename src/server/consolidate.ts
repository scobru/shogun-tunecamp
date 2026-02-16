import path from "path";
import fs from "fs-extra";
import {
    formatAudioFilename,
    formatAlbumDirectory,
    getStandardCoverFilename,
    getFileExtension
} from "../utils/audioUtils.js";
import NodeID3 from "node-id3";
import { convertWavToMp3 } from "./ffmpeg.js";
import type { DatabaseService } from "./database.js";

export class ConsolidationService {
    constructor(private database: DatabaseService, private rootDir: string) { }

    /**
     * Consolidates a track by moving it to its proper location
     */
    async consolidateTrack(trackId: number): Promise<boolean> {
        // 1. Delete track release associations from DB
        try {
            this.database.db.prepare("DELETE FROM release_tracks WHERE track_id = ?").run(trackId);
        } catch (e) {
            console.error(`[Consolidate] Error removing release associations for track ${trackId}:`, e);
        }

        // 2. Delete track album association from DB (reset to NULL)
        try {
            this.database.db.prepare("UPDATE tracks SET album_id = NULL WHERE id = ?").run(trackId);
        } catch (e) {
            console.error(`[Consolidate] Error resetting album association for track ${trackId}:`, e);
        }

        const track = this.database.getTrack(trackId);
        if (!track || !track.file_path) return false;

        // Auto-fix: If primary path is lossless and lossless path is empty, swap them conceptually
        let sourcePath = track.file_path;
        let sourceLosslessPath = track.lossless_path;

        const ext = getFileExtension(sourcePath).toLowerCase();
        if (['wav', 'flac'].includes(ext)) {
            if (!sourceLosslessPath) {
                console.log(`[Consolidate] Fixing track ${track.title}: Primary is lossless. Swapping.`);
                sourceLosslessPath = sourcePath;
                // We'll generate the MP3 source path later or let conversion handle it
                // For now, assume MP3 is missing
                sourcePath = sourcePath.replace(/\.(wav|flac)$/i, '.mp3');
            }
        }

        let album = track.album_id ? this.database.getAlbum(track.album_id) : null;
        if (!album) {
            const dir = path.dirname(track.file_path);
            const parentDir = path.basename(dir);

            // Avoid misidentifying 'library' or 'music' as an album title
            const isGenericFolder = ['library', 'music', 'tracks', 'audio'].includes(parentDir.toLowerCase());

            if (!isGenericFolder) {
                console.log(`[Consolidate] Track ${track.title} missing album link, checking folder: ${parentDir}`);
                // Try to find album by folder name (as slug or title)
                const possibleAlbum = this.database.getAlbumByTitle(parentDir) || this.database.getAlbumBySlug(parentDir);
                if (possibleAlbum) {
                    console.log(`[Consolidate] Recovered: Linked track ${track.title} to album ${possibleAlbum.title}`);
                    this.database.updateTrackAlbum(track.id, possibleAlbum.id);
                    album = possibleAlbum;
                }
            }

            if (!album) {
                console.warn(`[Consolidate] Skipping track ${track.title}: No album link and no valid album folder found (in ${dir})`);
                return false;
            }
        }

        const trackArtist = track.artist_id ? this.database.getArtist(track.artist_id) : (album.artist_id ? this.database.getArtist(album.artist_id) : null);
        const artistName = trackArtist?.name || "Unknown Artist";

        // 1. Calculate target directory: library/Artist - Album (Year)
        const targetDirName = formatAlbumDirectory(
            artistName,
            album.title
        );
        const targetDir = path.join(this.rootDir, "library", targetDirName);

        // 2. Calculate target filename: 01 - Title.mp3 (Force MP3 for primary)
        const targetFileName = formatAudioFilename(
            track.track_num || 0,
            track.title,
            'mp3'
        );
        const targetPath = path.join(targetDir, targetFileName);

        try {
            await fs.ensureDir(targetDir);

            // Guard: Check if a track already exists at targetPath in DB
            const existingTrack = this.database.getTrackByPath(targetPath);
            if (existingTrack && existingTrack.id !== trackId) {
                console.warn(`[Consolidate] Collision: A track record already exists for ${targetPath}. Skipping move.`);
                return false;
            }

            // --- HANDLING LOSSLESS FILE ---
            // If we identified a source lossless file (either from DB or swapped), move it first
            if (sourceLosslessPath) {
                const absSourceLossless = path.resolve(this.rootDir, sourceLosslessPath);
                if (await fs.pathExists(absSourceLossless)) {
                     const losslessExt = getFileExtension(sourceLosslessPath);
                     const targetLosslessName = formatAudioFilename(
                        track.track_num || 0,
                        track.title,
                        losslessExt
                    );
                    const targetLosslessPath = path.join(targetDir, targetLosslessName);

                    if (path.resolve(targetLosslessPath) !== absSourceLossless) {
                        console.log(`[Consolidate] Moving lossless: ${path.basename(sourceLosslessPath)} -> ${targetLosslessName}`);
                        await fs.move(absSourceLossless, targetLosslessPath, { overwrite: true });
                        this.database.updateTrackLosslessPath(trackId, targetLosslessPath);

                        // Update our source var to point to the new location for conversion
                        sourceLosslessPath = targetLosslessPath;
                    }
                }
            }

            // --- HANDLING MP3 FILE ---
            const absSourcePath = path.resolve(this.rootDir, sourcePath);
            const absTargetPath = path.resolve(targetPath);

            // Check if MP3 exists
            if (await fs.pathExists(absSourcePath)) {
                 // It exists, move it if needed
                 if (absSourcePath !== absTargetPath) {
                     console.log(`[Consolidate] Moving MP3: ${path.basename(sourcePath)} -> ${targetFileName}`);
                     await fs.move(absSourcePath, absTargetPath, { overwrite: true });
                 }
            } else {
                // MP3 missing. Generate from lossless if available.
                if (sourceLosslessPath) {
                    const absLossless = path.resolve(this.rootDir, sourceLosslessPath);
                    if (await fs.pathExists(absLossless)) {
                         console.log(`[Consolidate] Generating missing MP3 from: ${path.basename(sourceLosslessPath)}`);
                         // Generate directly to target if possible?
                         // convertWavToMp3 generates to same dir.
                         // Since we moved lossless to targetDir, it will generate to targetDir with correct name?
                         // formatAudioFilename uses "01 - Title.mp3".
                         // convertWavToMp3 uses "InputName.mp3".
                         // If "InputName" matches "01 - Title", we are good.

                         // Let's rely on convertWavToMp3 generating "Name.mp3" next to "Name.wav"
                         // sourceLosslessPath is now at targetDir/Name.wav (formatted).
                         // So it should generate targetDir/Name.mp3 (formatted).

                         await convertWavToMp3(absLossless);

                         // Verify existence
                         if (!await fs.pathExists(absTargetPath)) {
                             // Fallback: maybe extensions didn't match perfectly (e.g. .flac -> .mp3 replacement)
                             // Or convertWavToMp3 output filename differs from targetFileName?
                             // They should match because both are derived from same title/track_num via formatAudioFilename.
                             console.warn(`[Consolidate] Verify: Generated MP3 might have different name? Expected: ${absTargetPath}`);
                         }
                    }
                }
            }

            // 4. Update database
            this.database.updateTrackPath(trackId, targetPath, album.id);
            // Ensure format is updated to mp3
            try {
                this.database.db.prepare("UPDATE tracks SET format = 'mp3' WHERE id = ?").run(trackId);
            } catch (e) {}

            // 5. Consolidate cover if it exists
            if (album.cover_path && await fs.pathExists(path.join(this.rootDir, album.cover_path))) {
                const coverExt = getFileExtension(album.cover_path);
                const standardCoverName = getStandardCoverFilename(coverExt);
                const targetCoverPath = path.join(targetDir, standardCoverName);

                if (path.resolve(this.rootDir, album.cover_path) !== path.resolve(targetCoverPath)) {
                    console.log(`[Consolidate] Moving cover: ${path.basename(album.cover_path)} -> ${targetCoverPath}`);
                    await fs.move(path.join(this.rootDir, album.cover_path), targetCoverPath, { overwrite: true });
                    this.database.updateAlbumCover(album.id, targetCoverPath);
                }
            }

            // 5. Update ID3 Tags (Metadata)
            await this.syncMetadata(targetPath, track, album, artistName);

            return true;
        } catch (error) {
            console.error(`[Consolidate] Error moving file ${track.file_path}:`, error);
            return false;
        }
    }

    /**
     * Consolidates the entire library
     */
    async consolidateAll(): Promise<{ success: number; failed: number }> {
        const stats = await this.database.getStats();
        console.log(`[Consolidate] Starting consolidation of ${stats.tracks} tracks...`);

        const allTracks = this.database.getTracks();
        let success = 0;
        let failed = 0;

        for (const track of allTracks) {
            const ok = await this.consolidateTrack(track.id);
            if (ok) success++; else failed++;
        }

        // 6. Clean up empty directories left behind
        try {
            await this.removeEmptyDirs(this.rootDir);
        } catch (error) {
            console.error("[Consolidate] Error cleaning up empty directories:", error);
        }

        console.log(`[Consolidate] Done: ${success} tracks moved, ${failed} failed.`);
        return { success, failed };
    }

    /**
     * Recursively removes empty directories
     */
    private async removeEmptyDirs(dir: string) {
        const stats = await fs.stat(dir);
        if (!stats.isDirectory()) return;

        const files = await fs.readdir(dir);
        const basename = path.basename(dir);
        const isProtected = basename === "library" ||
            basename === "releases" ||
            basename === "assets" ||
            basename === path.basename(this.rootDir);

        if (files.length > 0) {
            // Check subdirectories
            for (const file of files) {
                const fullPath = path.join(dir, file);
                await this.removeEmptyDirs(fullPath);
            }

            // Re-check after cleaning subdirectories
            const filesAfter = await fs.readdir(dir);
            if (filesAfter.length === 0 && !isProtected) {
                console.log(`[Consolidate] Removing empty directory: ${dir}`);
                await fs.remove(dir);
            }
        } else if (!isProtected) {
            // Directory is empty and not protected
            console.log(`[Consolidate] Removing empty directory: ${dir}`);
            await fs.remove(dir);
        }
    }

    /**
     * Synchronizes database metadata to file tags (ID3 for MP3)
     */
    private async syncMetadata(filePath: string, track: any, album: any, artistName: string) {
        const ext = getFileExtension(filePath).toLowerCase();

        if (ext === 'mp3') {
            try {
                const tags: NodeID3.Tags = {
                    title: track.title,
                    artist: artistName,
                    album: album.title,
                    trackNumber: track.track_num ? String(track.track_num) : undefined,
                    year: album.year ? String(album.year) : (album.date ? new Date(album.date).getFullYear().toString() : undefined),
                    // genre: album.genre, // Optional, can add if available in DB track/album
                };

                // NodeID3.write returns true/false (Sync in v0.2)
                const success = NodeID3.write(tags, filePath);
                if (success) {
                    console.log(`[Consolidate] Updated ID3 tags for: ${path.basename(filePath)}`);
                } else {
                    console.warn(`[Consolidate] Failed to update ID3 tags for: ${path.basename(filePath)}`);
                }
            } catch (error) {
                console.error(`[Consolidate] Error writing ID3 tags to ${path.basename(filePath)}:`, error);
            }
        }
        // TODO: Add support for other formats (FLAC, etc.) if needed
    }
}
