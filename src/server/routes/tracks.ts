import { Router } from "express";
import fs from "fs";
import path from "path";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createTracksRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/tracks
     * List all tracks (from public albums only for non-admin)
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            // For non-admin, we need to filter by public albums
            const allTracks = database.getTracks();

            if (req.isAdmin) {
                return res.json(allTracks);
            }

            // Filter to only tracks from public albums (tracks without albums are private)
            const publicAlbums = new Set(
                database.getAlbums(true).map((a) => a.id)
            );
            const publicTracks = allTracks.filter(
                (t) => t.album_id !== null && publicAlbums.has(t.album_id)
            );

            res.json(publicTracks);
        } catch (error) {
            console.error("Error getting tracks:", error);
            res.status(500).json({ error: "Failed to get tracks" });
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

            res.json(track);
        } catch (error) {
            console.error("Error getting track:", error);
            res.status(500).json({ error: "Failed to get track" });
        }
    });

    /**
     * GET /api/tracks/:id/stream
     * Stream audio file with range support
     */
    router.get("/:id/stream", (req: AuthenticatedRequest, res) => {
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

            if (!fs.existsSync(track.file_path)) {
                return res.status(404).json({ error: "Audio file not found" });
            }

            const stat = fs.statSync(track.file_path);
            const fileSize = stat.size;
            const range = req.headers.range;

            // Determine content type
            const ext = path.extname(track.file_path).toLowerCase();
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

            if (range) {
                // Handle range request for seeking
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = end - start + 1;

                const stream = fs.createReadStream(track.file_path, { start, end });

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

                fs.createReadStream(track.file_path).pipe(res);
            }
        } catch (error) {
            console.error("Error streaming track:", error);
            res.status(500).json({ error: "Failed to stream track" });
        }
    });

    return router;
}
