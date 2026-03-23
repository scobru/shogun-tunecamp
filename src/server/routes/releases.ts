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
            const release = database.getRelease(id);
            if (!release) return res.status(404).json({ error: "Release not found" });

            const tracks = database.getTracksByReleaseId(id);
            res.json({ ...release, tracks });
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

    router.put("/:id", async (req: any, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const body = req.body as UpdateReleaseBody;

            const release = database.getRelease(id);
            if (!release) {
                return res.status(404).json({ error: "Release not found" });
            }

            const isRoot = req.username && authService && authService.isRootAdmin(req.username);
            if (!isRoot) {
                if (!req.artistId || release.owner_id !== req.artistId) {
                    return res.status(403).json({ error: "Access denied" });
                }
            }

            const updates: any = {};
            if (body.title) updates.title = body.title;
            if (body.artistId) updates.artist_id = body.artistId;
            if (body.date) updates.date = body.date;
            if (body.description !== undefined) updates.description = body.description;
            if (body.type) updates.type = body.type;
            if (body.year) updates.year = body.year;
            if (body.license !== undefined) updates.license = body.license;
            if (body.visibility) updates.visibility = body.visibility;
            if (body.download !== undefined) updates.download = body.download;
            if (body.price !== undefined) updates.price = body.price;
            if (body.currency) updates.currency = body.currency;
            if (body.genres) updates.genre = Array.isArray(body.genres) ? body.genres.join(", ") : body.genres;
            if (body.externalLinks) updates.external_links = JSON.stringify(body.externalLinks);
            if (body.publishedToGunDB !== undefined) updates.published_to_gundb = body.publishedToGunDB;
            if (body.publishedToAP !== undefined) updates.published_to_ap = body.publishedToAP;

            if (Object.keys(updates).length > 0) {
                database.updateRelease(id, updates);
            }

            if (body.track_ids) {
                const existingTracks = database.getReleaseTracks(id);
                const existingTrackIds = new Set(existingTracks.map(t => t.track_id).filter(tid => tid !== null) as number[]);
                const newTrackIds = new Set(body.track_ids);

                const toAdd = [...newTrackIds].filter(newId => !existingTrackIds.has(newId));
                const toRemove = existingTracks.filter(t => t.track_id !== null && !newTrackIds.has(t.track_id));

                for (const trackId of toAdd) {
                    database.addTrackToRelease(id, trackId);
                }
                for (const trackRecord of toRemove) {
                    database.deleteReleaseTrack(trackRecord.id);
                }
            }

            publishingService.syncRelease(id).catch(e => console.error("Failed to sync release:", e));

            const finalUpdatedRelease = database.getRelease(id);
            res.json(finalUpdatedRelease || { message: "Release updated" });

        } catch (error) {
            console.error("Error updating release:", error);
            res.status(500).json({ error: "Failed to update release" });
        }
    });

    router.get("/:id/folder", async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const release = database.getRelease(id);
            if (!release) return res.status(404).json({ error: "Release not found" });

            const tracks = database.getReleaseTracks(id);
            if (tracks.length === 0) return res.json({ folder: null, files: [] });

            const firstWithFile = tracks.find(t => t.file_path);
            if (!firstWithFile || !firstWithFile.file_path) {
                return res.json({ folder: null, files: [] });
            }

            const trackDir = path.dirname(firstWithFile.file_path);
            const releaseDir = trackDir.includes("tracks") ? path.dirname(trackDir) : trackDir;

            const files: any[] = [];
            async function walkDir(dir: string, prefix = "") {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walkDir(fullPath, `${prefix}${entry.name}/`);
                    } else {
                        const stat = await fs.stat(fullPath);
                        files.push({
                            name: `${prefix}${entry.name}`,
                            type: path.extname(entry.name).substring(1),
                            size: stat.size,
                        });
                    }
                }
            }
            if (await fs.pathExists(releaseDir)) {
                await walkDir(releaseDir);
            }
            res.json({ folder: releaseDir, files });
        } catch (error) {
            console.error("Error getting release folder:", error);
            res.status(500).json({ error: "Failed to get folder" });
        }
    });

    return router;
}
