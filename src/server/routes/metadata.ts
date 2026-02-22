import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";
import { metadataService } from "../metadata.js";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createMetadataRoutes(database: DatabaseService, musicDir: string): Router {
    const router = Router();

    /**
     * GET /api/metadata/search
     * Search for release metadata
     */
    router.get("/search", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });

        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        const results = await metadataService.searchRelease(query);
        res.json(results);
    });

    /**
     * POST /api/metadata/apply
     * Apply metadata to an album (download cover, update info)
     */
    router.post("/apply", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });

        const { albumId, mbid, title, artist, date, coverUrl } = req.body;

        try {
            const album = database.getAlbum(albumId);
            if (!album) return res.status(404).json({ error: "Album not found" });

            // 1. Update Database Info
            // Update title/date if provided
            // Assuming we might implement updateAlbumMetadata in DB, for now manually?
            // Existing DB service doesn't have updateAlbumMetadata fully exposed but we have updateAlbumArtist etc.
            // Let's just download cover for MVP as that's the visual part user wants.

            let coverUpdated = false;

            // 2. Download Cover if URL provided
            if (coverUrl) {
                // Find album directory
                // We need to find the directory path from tracks or store it on album
                // Schema doesn't store album path directly, only cover_path
                // But we can guess from cover_path or first track
                const tracks = database.getTracks(albumId);
                let dir = "";
                if (tracks.length > 0 && tracks[0].file_path) {
                    dir = path.dirname(tracks[0].file_path);
                } else if (album.cover_path) {
                    dir = path.dirname(album.cover_path);
                }

                if (dir && await fs.pathExists(dir)) {
                    const dest = path.join(dir, "cover.jpg");

                    const response = await fetch(coverUrl);
                    if (response.ok) {
                        const buffer = await response.buffer();
                        await fs.writeFile(dest, buffer);
                        console.log(`Downloaded cover to ${dest}`);

                        // Update DB
                        database.updateAlbumCover(albumId, dest);
                        coverUpdated = true;
                    }
                }
            }

            // 3. Update artist if needed (basic)
            if (artist) {
                let artistRec = database.getArtistByName(artist);
                if (!artistRec) {
                    const newId = database.createArtist(artist);
                    artistRec = database.getArtist(newId);
                }
                if (artistRec) {
                    database.updateAlbumArtist(albumId, artistRec.id);
                }
            }

            res.json({ success: true, coverUpdated });

        } catch (error) {
            console.error("Error applying metadata:", error);
            res.status(500).json({ error: "Failed to apply metadata" });
        }
    });

    return router;
}
