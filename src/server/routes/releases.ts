import { Router } from "express";
import path from "path";
import fs from "fs-extra";
import { stringify } from "yaml";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import type { PublishingService } from "../publishing.js";
import type { AuthService } from "../auth.js";

interface CreateReleaseBody {
    title: string;
    artistName?: string;
    artistId?: number;
    date?: string;
    description?: string;
    track_ids?: number[];
    type?: 'album' | 'single' | 'ep';
    year?: number;
    license?: string;
    visibility?: 'public' | 'private' | 'unlisted';
    download?: string;
    price?: number;
    currency?: 'ETH' | 'USD';
    genres?: string[];
    externalLinks?: any[];
    publishedToGunDB?: boolean;
    publishedToAP?: boolean;
}

interface UpdateReleaseBody extends Partial<CreateReleaseBody> {
    isPublic?: boolean;
}

export function createReleaseRouter(
    database: DatabaseService,
    scanner: ScannerService,
    publishingService: PublishingService,
    authService: AuthService,
    musicDir: string
): Router {
    const router = Router();

    router.get("/", async (req: any, res) => {
        try {
            const isRoot = req.username && authService && authService.isRootAdmin(req.username);
            const artistId = req.artistId;

            let releases;
            if (isRoot) {
                releases = database.getReleases();
            } else if (artistId) {
                releases = database.getReleasesByOwner(artistId);
            } else {
                releases = database.getReleases(true);
            }
            res.json(releases);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    router.get("/:id", async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            
            // Try formal release first
            const release = database.getRelease(id);
            if (release) {
                const tracks = database.getTracksByReleaseId(id);
                return res.json({ ...release, tracks, is_formal_release: true });
            }

            // Fallback to library album
            const album = database.getAlbum(id);
            if (album) {
                const tracks = database.getTracks(id);
                return res.json({ ...album, tracks, is_formal_release: false });
            }

            res.status(404).json({ error: "Release not found" });
        } catch (error) {
            console.error("Error getting release:", error);
            res.status(500).json({ error: "Failed to get release" });
        }
    });

    router.post("/", async (req: any, res) => {
        try {
            const body = req.body as CreateReleaseBody;

            if (!body.title) {
                return res.status(400).json({ error: "Title is required" });
            }

            let artistId: number | null = body.artistId || null;
            if (!artistId && body.artistName) {
                const existingArtist = database.getArtistByName(body.artistName);
                if (existingArtist) {
                    artistId = existingArtist.id;
                } else {
                    artistId = database.createArtist(body.artistName);
                }
            } else if (!artistId && (req as any).artistId) {
                artistId = (req as any).artistId;
            }

            const slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "release";

            const newReleaseId = database.createRelease({
                title: body.title,
                slug: slug,
                artist_id: artistId,
                owner_id: (req as any).artistId || artistId,
                date: body.date || new Date().toISOString(),
                description: body.description || null,
                type: body.type || 'album',
                year: body.year || new Date().getFullYear(),
                license: body.license || null,
                visibility: body.visibility || 'private',
                cover_path: null,
                genre: body.genres?.join(", ") || null,
                download: body.download || null,
                price: body.price || 0,
                currency: body.currency || 'ETH',
                external_links: body.externalLinks ? JSON.stringify(body.externalLinks) : null,
                published_at: body.visibility === 'public' || body.visibility === 'unlisted' ? new Date().toISOString() : null,
                published_to_gundb: body.publishedToGunDB !== undefined ? body.publishedToGunDB : (body.visibility === 'public' || body.visibility === 'unlisted'),
                published_to_ap: body.publishedToAP !== undefined ? body.publishedToAP : (body.visibility === 'public' || body.visibility === 'unlisted'),
            });

            if (body.track_ids && body.track_ids.length > 0) {
                for (const trackId of body.track_ids) {
                    database.addTrackToRelease(newReleaseId, trackId);
                }
            }

            publishingService.syncRelease(newReleaseId).catch(e => console.error("Failed to sync new release:", e));

            const newRelease = database.getRelease(newReleaseId);
            res.status(201).json(newRelease);

        } catch (error) {
            console.error("Error creating release:", error);
            res.status(500).json({ error: "Failed to create release" });
        }
    });

    return router;
}
