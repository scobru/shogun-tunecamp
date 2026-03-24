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
    price?: number | string;
    priceUsdc?: number | string;
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
            const isAdmin = req.isAdmin;
            const userArtistId = req.artistId;

            if (!isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to create releases" });
            }

            if (!body.title) {
                return res.status(400).json({ error: "Title is required" });
            }

            // Determine the final Artist ID and ownership logic
            let artistId: number | null = body.artistId || null;
            
            // SECURITY CHECK: Non-admins cannot create releases for other artists or new artists
            if (!isAdmin) {
                if (artistId && artistId !== userArtistId) {
                    return res.status(403).json({ error: "Access denied: You can only create releases for your own artist profile" });
                }
                if (body.artistName) {
                    const existingArtist = database.getArtistByName(body.artistName);
                    if (existingArtist && existingArtist.id !== userArtistId) {
                         return res.status(403).json({ error: "Access denied: Artist name belongs to another user" });
                    }
                    // If artist doesn't exist, we allow creating it ONLY if it matches their intended profile name 
                    // or if it's a library album (but for publishing platform mode, we prefer forcing their userArtistId)
                }
                // Force userArtistId for regular users
                artistId = userArtistId;
            } else {
                // Admin logic: allow creating/assigning to any artist
                if (!artistId && body.artistName) {
                    const existingArtist = database.getArtistByName(body.artistName);
                    if (existingArtist) {
                        artistId = existingArtist.id;
                    } else {
                        artistId = database.createArtist(body.artistName);
                    }
                }
            }

            const slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "release";

            // Verify Track Ownership before creating the release association
            const validatedTrackIds: number[] = [];
            if (body.track_ids && body.track_ids.length > 0) {
                for (const trackId of body.track_ids) {
                    const track = database.getTrack(trackId);
                    if (track) {
                        // Admin can add anything, Users can only add their own tracks
                        if (isAdmin || track.owner_id === userArtistId) {
                            validatedTrackIds.push(trackId);
                        } else {
                            console.warn(`⚠️ User ${req.username} tried to add unauthorized track ${trackId} to release`);
                        }
                    }
                }
            }

            const newReleaseId = database.createRelease({
                title: body.title,
                slug: slug,
                artist_id: artistId,
                owner_id: userArtistId || artistId, // Owner is the person who created/manages it
                date: body.date || new Date().toISOString(),
                description: body.description || null,
                type: body.type || 'album',
                year: body.year || new Date().getFullYear(),
                license: body.license || null,
                visibility: body.visibility || 'private',
                cover_path: null,
                genre: body.genres?.join(", ") || null,
                download: body.download || null,
                price: body.price !== undefined ? Number(body.price) : 0,
                price_usdc: body.priceUsdc !== undefined ? Number(body.priceUsdc) : 0,
                currency: body.currency || 'ETH',
                external_links: body.externalLinks ? JSON.stringify(body.externalLinks) : null,
                published_at: body.visibility === 'public' || body.visibility === 'unlisted' ? new Date().toISOString() : null,
                published_to_gundb: body.publishedToGunDB !== undefined ? body.publishedToGunDB : (body.visibility === 'public' || body.visibility === 'unlisted'),
                published_to_ap: body.publishedToAP !== undefined ? body.publishedToAP : (body.visibility === 'public' || body.visibility === 'unlisted'),
            });

            // Associate only validated tracks
            for (const trackId of validatedTrackIds) {
                database.addTrackToRelease(newReleaseId, trackId);
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
