import { writeMetadata } from "../ffmpeg.js";
import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";
import { parseFile } from "music-metadata";
import NodeID3 from "node-id3";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

import type { PublishingService } from "../publishing.js";

export function createTracksRoutes(database: DatabaseService, publishingService: PublishingService, musicDir: string): Router {
    const router = Router();

    /**
     * GET /api/tracks
     * List all tracks (ADMIN ONLY)
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            // Helper to map DB fields to frontend expected fields
            const mapTrack = (t: any) => ({ ...t, losslessPath: t.lossless_path, externalArtwork: t.external_artwork, albumName: t.album_title, artistName: t.artist_name });

            // If admin, return everything
            if (req.isAdmin) {
                return res.json(database.getTracks().map(mapTrack));
            }

            // Otherwise, filter for public/unlisted tracks
            // Optimized: Use database filtering instead of in-memory N+1
            res.json(database.getTracks(undefined, true).map(mapTrack));
        } catch (error) {
            console.error("Error getting tracks:", error);
            res.status(500).json({ error: "Failed to get tracks" });
        }
    });

    /**
     * POST /api/tracks
     * Create a new track (usually for external links)
     */
    router.post("/", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const { title, albumId, artistId, trackNum, url, service, externalArtwork, duration } = req.body;

            if (!title) {
                return res.status(400).json({ error: "Title is required" });
            }

            const trackId = database.createTrack({
                title,
                album_id: albumId || null,
                artist_id: artistId || null,
                track_num: trackNum || null,
                duration: duration || 0,
                file_path: null,
                format: null,
                bitrate: null,
                sample_rate: null,
                lossless_path: null,
                url: url || null,
                service: service || null,
                external_artwork: externalArtwork || null,
                waveform: null
            });

            const newTrack = database.getTrack(trackId);
            res.status(201).json(newTrack);

            // Sync release if associated
            if (albumId && publishingService) {
                publishingService.syncRelease(albumId).catch(e => console.error("Failed to sync release after track creation:", e));
            }

        } catch (error) {
            console.error("Error creating track:", error);
            res.status(500).json({ error: "Failed to create track" });
        }
    });

    /**
     * GET /api/tracks/:id/lyrics
     * Get track lyrics from metadata
     */
    router.get("/:id/lyrics", async (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const track = database.getTrack(id);

            if (!track || !track.file_path) {
                return res.status(404).json({ error: "Track not found" });
            }

            const trackPath = path.join(musicDir, track.file_path);
            if (!await fs.pathExists(trackPath)) {
                return res.status(404).json({ error: "File not found" });
            }

            const metadata = await parseFile(trackPath);
            const lyrics = metadata.common.lyrics;

            res.json({ lyrics: lyrics || [] });
        } catch (error) {
            console.error("Error getting lyrics:", error);
            res.status(500).json({ error: "Failed to get lyrics" });
        }
    });

    /**
     * GET /api/tracks/:id
     * Get track details
     */
    router.get("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const track = database.getTrack(id);

            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Check album visibility for non-admin
            if (!req.isAdmin && track.album_id) {
                const album = database.getAlbum(track.album_id);
                if (album && !album.is_public) {
                    return res.status(404).json({ error: "Track not found" });
                }
            }

            res.json({ ...track, losslessPath: track.lossless_path });
        } catch (error) {
            console.error("Error getting track:", error);
            res.status(500).json({ error: "Failed to get track" });
        }
    });

    /**
     * GET /api/tracks/:id/stream
     * Stream audio file with range support
     */
    router.get("/:id/stream", async (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const track = database.getTrack(id);

            if (!track) {
                console.warn(`[Stream] Track ID ${id} not found in database. Recommend re-scan.`);
                return res.status(404).json({ error: `Track ${id} not found locally. Please re-scan your library in the Admin panel.` });
            }

            // Security Check: Ensure track is public or user is admin
            if (!req.isAdmin && track.album_id) {
                const album = database.getAlbum(track.album_id);
                if (album && album.visibility === 'private') {
                    // Check if album has an unlock code or if we should allow unlisted
                    // For now, strict: if private, only admin.
                    return res.status(403).json({ error: "Access denied" });
                }
            }

            if (!track.file_path) {
                if (track.url) {
                    try {
                        const response = await fetch(track.url);
                        if (!response.ok) {
                            return res.status(502).json({ error: `Upstream error: ${response.statusText}` });
                        }
                        if (response.headers.has("content-type")) {
                            res.setHeader("Content-Type", response.headers.get("content-type")!);
                        }
                        if (response.headers.has("content-length")) {
                            res.setHeader("Content-Length", response.headers.get("content-length")!);
                        }
                        // Pipe the stream
                        // @ts-ignore
                        response.body.pipe(res);
                        return;
                    } catch (error) {
                        console.error("Proxy error:", error);
                        return res.status(500).json({ error: "Failed to stream external track" });
                    }
                }
                return res.status(400).json({ error: "External tracks cannot be streamed directly from this endpoint. Use the external URL." });
            }
            let trackPath = path.join(musicDir, track.file_path);
            let usingLosslessFallback = false;

            if (!await fs.pathExists(trackPath)) {
                if (track.lossless_path) {
                    const losslessPath = path.join(musicDir, track.lossless_path);
                    if (await fs.pathExists(losslessPath)) {
                        console.log(`ℹ️ [Stream] MP3 missing, using lossless file for transcoding: ${track.lossless_path}`);
                        trackPath = losslessPath;
                        usingLosslessFallback = true;
                    } else {
                        console.warn(`❌ [Stream] Both primary and lossless files missing for track ID ${id}`);
                        return res.status(404).json({ error: "Audio file not found on disk. Try re-scanning your library." });
                    }
                } else {
                    console.warn(`❌ [Stream] Could not resolve file path: ${track.file_path}`);
                    return res.status(404).json({ error: "Audio file not found on disk. Try re-scanning your library." });
                }
            }

            console.log(`🎵 [Stream] Serving: ${trackPath}${usingLosslessFallback ? ' (transcoding lossless fallback)' : ''}`);

            const stat = await fs.promises.stat(trackPath);
            const fileSize = stat.size;
            const range = req.headers.range;

            // Determine content type
            const ext = path.extname(trackPath).toLowerCase();
            const contentTypes: Record<string, string> = {
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
                ".ogg": "audio/ogg",
                ".wav": "audio/wav",
                ".m4a": "audio/mp4",
                ".aac": "audio/aac",
                ".opus": "audio/opus",
            };
            const contentType = contentTypes[ext] || "audio/mpeg";

            // Transcoding support
            let targetFormat = req.query.format as string; // e.g. 'mp3', 'aac'

            // Force transcode for lossless files (WAV, FLAC) or when using lossless fallback
            const isLossless = ext === '.wav' || ext === '.flac';
            if (!targetFormat && (isLossless || usingLosslessFallback)) {
                targetFormat = 'mp3';
            }

            const shouldTranscode = !!targetFormat && (targetFormat !== ext.substring(1) || usingLosslessFallback);

            if (shouldTranscode) {
                const format = targetFormat;
                const bitrate = (req.query.bitrate as string) || '128k';

                const contentTypeMap: Record<string, string> = {
                    'mp3': 'audio/mpeg',
                    'aac': 'audio/aac',
                    'ogg': 'audio/ogg',
                    'opus': 'audio/opus'
                };

                res.setHeader("Content-Type", contentTypeMap[format] || 'audio/mpeg');

                // Create ffmpeg command
                const command = ffmpeg(trackPath)
                    .format(format)
                    .audioBitrate(bitrate)
                    .on('error', (err) => {
                        // Only log error if it's not a client disconnect (broken pipe)
                        if (!err.message.includes("Output stream closed")) {
                            console.error('Transcoding error:', err.message);
                        }
                    });

                // Pipe to response
                command.pipe(res, { end: true });
                return;
            }

            if (range) {
                // Handle range request for seeking
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = end - start + 1;

                const stream = fs.createReadStream(trackPath, { start, end });

                res.writeHead(206, {
                    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunkSize,
                    "Content-Type": contentType,
                });

                stream.pipe(res);
            } else {
                // Full file request
                res.writeHead(200, {
                    "Content-Length": fileSize,
                    "Content-Type": contentType,
                    "Accept-Ranges": "bytes",
                });

                fs.createReadStream(trackPath).pipe(res);
            }
        } catch (error) {
            console.error("Error streaming track:", error);
            res.status(500).json({ error: "Failed to stream track" });
        }
    });

    /**
     * PUT /api/tracks/:id
     * Update track metadata and ID3 tags (admin only)
     */
    router.put("/:id", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const track = database.getTrack(id);

            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Permission Check: Restricted admin can only update their own tracks
            if (req.artistId && track.artist_id && track.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied: You can only edit your own tracks" });
            }

            const { title, artist, artistId, album, albumId, trackNumber, genre, fileName: newFileName, url, service, externalArtwork } = req.body;

            // HANDLE FILE RENAMING (Only if local track)
            if (track.file_path && newFileName && typeof newFileName === 'string') {
                const oldPath = track.file_path;
                const oldDir = path.dirname(oldPath);
                const oldExt = path.extname(oldPath);

                // Sanitize new filename and ensure correct extension
                let sanitizedName = path.parse(newFileName).name; // Get name without extension
                sanitizedName = sanitizedName.replace(/[^a-z0-9_\-]/gi, '_'); // Basic sanitization

                const newPath = path.posix.join(oldDir, sanitizedName + oldExt);

                if (newPath !== oldPath) {
                    console.log(`[Tracks] Renaming track file: ${oldPath} -> ${newPath}`);

                    const fullOldPath = path.join(musicDir, oldPath);
                    const fullNewPath = path.join(musicDir, newPath);

                    try {
                        if (await fs.pathExists(fullOldPath)) {
                            await fs.move(fullOldPath, fullNewPath);
                        }

                        // Update primary path in DB
                        database.updateTrackPath(id, newPath, track.album_id);

                        // Handle lossless file renaming if it exists
                        if (track.lossless_path) {
                            const oldLosslessPath = track.lossless_path;
                            const losslessExt = path.extname(oldLosslessPath);
                            const newLosslessPath = path.posix.join(path.dirname(oldLosslessPath), sanitizedName + losslessExt);

                            const fullOldLosslessPath = path.join(musicDir, oldLosslessPath);
                            const fullNewLosslessPath = path.join(musicDir, newLosslessPath);

                            if (await fs.pathExists(fullOldLosslessPath)) {
                                await fs.move(fullOldLosslessPath, fullNewLosslessPath);
                            }

                            database.updateTrackLosslessPath(id, newLosslessPath);
                        }

                        // Update local track object for subsequent operations
                        track.file_path = newPath;
                    } catch (renameError) {
                        console.error("[Tracks] Error renaming files:", renameError);
                        // Continue with other metadata updates even if rename fails? 
                        // Probably better to report error if rename was explicitly requested
                        return res.status(500).json({ error: "Failed to rename physical files" });
                    }
                }
            }

            // Update database title
            if (title !== undefined) {
                database.updateTrackTitle(id, title);
            }

            // Update external fields
            if (url !== undefined || service !== undefined || externalArtwork !== undefined) {
                // We need a way to update these in DB. 
                // Currently database.ts doesn't have specific methods for all fields, 
                // but we can use db.prepare directly if needed or check if there's a generic update.
                // Let's check database.ts for more update methods.
                (database as any).db.prepare("UPDATE tracks SET url = ?, service = ?, external_artwork = ? WHERE id = ?")
                    .run(url !== undefined ? url : track.url,
                        service !== undefined ? service : track.service,
                        externalArtwork !== undefined ? externalArtwork : track.external_artwork,
                        id);
            }

            // Update artist
            if (artistId !== undefined) {
                // If explicit ID provided, use it (or null to clear)
                database.updateTrackArtist(id, artistId ? parseInt(artistId) : null);
            } else if (artist !== undefined) {
                // Fallback to name-based lookup/creation
                let artistRecord = database.getArtistByName(artist);
                if (!artistRecord && artist) {
                    const newArtistId = database.createArtist(artist);
                    artistRecord = database.getArtist(newArtistId);
                }
                if (artistRecord) {
                    database.updateTrackArtist(id, artistRecord.id);
                }
            }

            // Update album
            if (albumId !== undefined) {
                database.updateTrackAlbum(id, albumId ? parseInt(albumId) : null);
            }

            // Update duration (optional, if provided in body)
            if (req.body.duration !== undefined) {
                database.updateTrackDuration(id, parseFloat(req.body.duration));
            }

            // Update track number
            if (trackNumber !== undefined) {
                (database as any).db.prepare("UPDATE tracks SET track_num = ? WHERE id = ?").run(trackNumber, id);
            }

            // Get updated track
            const updatedTrack = database.getTrack(id);

            // WRITE TAGS TO FILE (Only for local files)
            try {
                if (updatedTrack && updatedTrack.file_path) {
                    const fullPath = path.join(musicDir, updatedTrack.file_path);
                    const ext = path.extname(fullPath).toLowerCase();

                    if (await fs.pathExists(fullPath)) {
                        const tags = {
                            title: updatedTrack.title,
                            artist: updatedTrack.artist_name || undefined,
                            album: updatedTrack.album_title || undefined,
                            trackNumber: updatedTrack.track_num?.toString() || undefined
                        };

                        if (ext === '.mp3') {
                            // NodeID3.update is synchronous
                            const success = NodeID3.update(tags as any, fullPath);
                            if (success) {
                                console.log(`[Tags] Updated ID3 tags for: ${path.basename(fullPath)}`);
                            } else {
                                console.warn(`[Tags] Failed to update ID3 tags for: ${path.basename(fullPath)}`);
                            }
                        } else if (['.flac', '.ogg', '.m4a', '.wav'].includes(ext)) {
                            // Use ffmpeg for other formats
                            await writeMetadata(fullPath, {
                                title: tags.title,
                                artist: tags.artist,
                                album: tags.album,
                                track: tags.trackNumber
                            });
                            console.log(`[Tags] Updated metadata for: ${path.basename(fullPath)}`);
                        }
                    }
                }
            } catch (tagError) {
                console.error("[Tags] Error writing tags:", tagError);
            }

            res.json({ message: "Track updated", track: updatedTrack });

            // ActivityPub Broadcast: Track updated
            if (updatedTrack && updatedTrack.album_id) {
                publishingService.syncRelease(updatedTrack.album_id).catch(e => console.error("Failed to sync release after track update:", e));
            }
        } catch (error) {
            console.error("Error updating track:", error);
            res.status(500).json({ error: "Failed to update track" });
        }
    });



    /**
     * DELETE /api/tracks/:id
     * Delete a track, optionally deleting the file
     */
    router.delete("/:id", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const deleteFile = req.query.deleteFile === "true";

            const track = database.getTrack(id);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Permission Check: Restricted admin can only delete their own tracks
            if (req.artistId && track.artist_id && track.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied: You can only delete your own tracks" });
            }

            if (deleteFile && track.file_path) {
                const trackPath = path.join(musicDir, track.file_path);
                if (await fs.pathExists(trackPath)) {
                    try {
                        await fs.remove(trackPath);
                        console.log(`🗑️  Deleted file: ${trackPath}`);

                        // Also check for associated raw file (e.g. .wav if this is .mp3)
                        const ext = path.extname(trackPath).toLowerCase();
                        if (ext === '.mp3') {
                            const wavPath = trackPath.replace(/\.mp3$/i, '.wav');
                            if (await fs.pathExists(wavPath)) {
                                await fs.remove(wavPath);
                                console.log(`🗑️  Deleted associated WAV: ${wavPath}`);
                            }
                        }
                    } catch (err) {
                        console.error("Error deleting file:", err);
                        return res.status(500).json({ error: "Failed to delete file" });
                    }
                }
            }

            // Delete from database
            // Note: If file was deleted, watcher might have already triggered this, 
            // but it's safe to run again (idempotent if using specific ID delete)
            database.deleteTrack(id);

            // ActivityPub Broadcast: Track deleted
            // We need to re-fetch the album to get the current state (ActivityPub note will be updated/replaced)
            if (track.album_id) {
                publishingService.syncRelease(track.album_id).catch(e => console.error("Failed to sync release after track delete:", e));
            }

            res.json({ message: "Track deleted" });
        } catch (error) {
            console.error("Error deleting track:", error);
            res.status(500).json({ error: "Failed to delete track" });
        }
    });

    return router;
}
