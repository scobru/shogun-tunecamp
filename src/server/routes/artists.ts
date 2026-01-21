import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createArtistsRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/artists
     * List all artists
     */
    router.get("/", (req, res) => {
        try {
            const artists = database.getArtists();
            res.json(artists);
        } catch (error) {
            console.error("Error getting artists:", error);
            res.status(500).json({ error: "Failed to get artists" });
        }
    });

    /**
     * GET /api/artists/:idOrSlug
     * Get artist details with albums (supports numeric ID or slug)
     */
    router.get("/:idOrSlug", (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let artist;

            // Check if it's a numeric ID or a slug
            if (/^\d+$/.test(param)) {
                artist = database.getArtist(parseInt(param, 10));
            } else {
                artist = database.getArtistBySlug(param);
            }

            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            const albums = database.getAlbumsByArtist(artist.id, req.isAdmin !== true);

            // Get cover image from first album if artist has no photo
            let coverImage = artist.photo_path;
            if (!coverImage && albums.length > 0) {
                coverImage = albums[0].cover_path;
            }

            // Get tracks by this artist that have no album (loose tracks) - only for admin
            let looseTracks: ReturnType<typeof database.getTracks> = [];
            if (req.isAdmin) {
                const allTracks = database.getTracks();
                looseTracks = allTracks.filter(t => t.artist_id === artist.id && !t.album_id);
            }

            // Parse links JSON if present
            let links = null;
            if (artist.links) {
                try {
                    links = JSON.parse(artist.links);
                } catch (e) {
                    links = null;
                }
            }

            res.json({
                ...artist,
                links,
                coverImage,
                albums,
                tracks: looseTracks,
            });
        } catch (error) {
            console.error("Error getting artist:", error);
            res.status(500).json({ error: "Failed to get artist" });
        }
    });

    /**
     * GET /api/artists/:idOrSlug/cover
     * Get artist cover image (photo or first album cover)
     */
    router.get("/:idOrSlug/cover", async (req, res) => {
        try {
            const fs = await import("fs");
            const path = await import("path");

            const param = req.params.idOrSlug as string;
            let artist;

            if (/^\d+$/.test(param)) {
                artist = database.getArtist(parseInt(param, 10));
            } else {
                artist = database.getArtistBySlug(param);
            }

            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Try artist photo first
            if (artist.photo_path && fs.existsSync(artist.photo_path)) {
                const ext = path.extname(artist.photo_path).toLowerCase();
                const contentTypes: Record<string, string> = {
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".png": "image/png",
                    ".gif": "image/gif",
                    ".webp": "image/webp",
                };
                res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
                res.setHeader("Cache-Control", "public, max-age=86400");
                fs.createReadStream(artist.photo_path).pipe(res);
                return;
            }

            // Fallback to first album cover
            const albums = database.getAlbumsByArtist(artist.id, false);
            for (const album of albums) {
                if (album.cover_path && fs.existsSync(album.cover_path)) {
                    const ext = path.extname(album.cover_path).toLowerCase();
                    const contentTypes: Record<string, string> = {
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".png": "image/png",
                        ".gif": "image/gif",
                        ".webp": "image/webp",
                    };
                    res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
                    res.setHeader("Cache-Control", "public, max-age=86400");
                    fs.createReadStream(album.cover_path).pipe(res);
                    return;
                }
            }

            res.status(404).json({ error: "No cover found" });
        } catch (error) {
            console.error("Error getting artist cover:", error);
            res.status(500).json({ error: "Failed to get cover" });
        }
    });

    return router;
}
