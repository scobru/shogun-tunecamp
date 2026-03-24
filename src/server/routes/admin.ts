import type { AuthenticatedRequest } from "../middleware/auth.js";
import { Router } from "express";
import path from "path";
import fs from "fs-extra";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import type { GunDBService } from "../gundb.js";
import type { ServerConfig } from "../config.js";
import type { AuthService } from "../auth.js";
import { validatePassword } from "../validators.js";
import type { PublishingService } from "../publishing.js";
import type { ActivityPubService } from "../activitypub.js";

export function createAdminRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string,
    gundbService: GunDBService,
    config: ServerConfig,
    authService: AuthService,
    publishingService: PublishingService,
    apService: ActivityPubService
): Router {
    const router = Router();

    /**
     * GET /api/admin/releases
     * List all albums with visibility status
     */
    router.get("/releases", (req: AuthenticatedRequest, res: any) => {
        try {
            const showMine = req.query.mine === 'true';
            let releases: any[] = [];
            
            if (req.isAdmin && !showMine) {
                releases = database.getReleases(false).map(r => ({ ...r, is_formal_release: true }));
            } else if (req.artistId) {
                releases = database.getReleasesByOwner(req.artistId, false).map(r => ({ ...r, is_formal_release: true }));
            } else {
                res.json([]);
                return;
            }

            // Sort by date/id
            const sortedReleases = releases.sort((a, b) => {
                const dateA = new Date(a.date || a.created_at || 0).getTime();
                const dateB = new Date(b.date || b.created_at || 0).getTime();
                return dateB - dateA;
            });

            res.json(sortedReleases);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    /**
     * PUT /api/admin/releases/:id/visibility
     * Toggle album visibility
     */
    router.put("/releases/:id/visibility", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { isPublic, visibility } = req.body;

            // Check both releases and albums
            const release = database.getRelease(id);
            const album = database.getAlbum(id);
            const item = release || album;

            if (!item) {
                return res.status(404).json({ error: "Release or album not found" });
            }

            // Determine visibility
            let newVisibility: 'public' | 'private' | 'unlisted' = 'private';
            if (visibility) {
                newVisibility = visibility;
            } else if (typeof isPublic === 'boolean') {
                // Backward compatibility
                newVisibility = isPublic ? 'public' : 'private';
            }

            // Permission Check
            const ownerId = release ? release.owner_id : album?.owner_id;
            if (req.artistId && !req.isAdmin && ownerId !== req.artistId) {
                return res.status(403).json({ error: "Access denied: You can only manage your own content" });
            }

            // Update visibility in DB
            if (release) {
                database.updateRelease(id, { visibility: newVisibility });
            } else {
                database.updateAlbumVisibility(id, newVisibility);
            }

            // Use PublishingService to sync
            publishingService.syncRelease(id).catch(e => console.error("Failed to sync visibility:", e));

            res.json({ message: "Visibility updated", visibility: newVisibility });
        } catch (error) {
            console.error("Error updating visibility:", error);
            res.status(500).json({ error: "Failed to update visibility" });
        }
    });



    /**
     * GET /api/admin/stats
     * Get admin statistics
     */
    router.get("/stats", async (req: AuthenticatedRequest, res: any) => {
        try {
            const showMine = req.query.mine === 'true';
            const stats = await database.getStats((req.isAdmin && !showMine) ? undefined : (req.artistId || undefined));
            res.json(stats);
        } catch (error) {
            console.error("Error getting stats:", error);
            res.status(500).json({ error: "Failed to get stats" });
        }
    });

    /**
     * GET /api/admin/settings
     * Get all site settings
     */
    router.get("/settings", (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin access required" });
        try {
            const settings = database.getAllSettings();
            res.json(settings);
        } catch (error) {
            console.error("Error getting settings:", error);
            res.status(500).json({ error: "Failed to get settings" });
        }
    });

    /**
     * PUT /api/admin/settings
     * Update site settings
     */
    router.put("/settings", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can change global settings
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can change site settings" });
            }

            const { siteName, siteDescription, publicUrl, artistName, coverImage, mode, gunPeers, web3_checkout_address, web3_nft_address } = req.body;
            let settingsChanged = false;

            if (siteName !== undefined) {
                database.setSetting("siteName", siteName);
                settingsChanged = true;
            }
            if (mode !== undefined) {
                database.setSetting("mode", mode);
                settingsChanged = true;
            }
            if (siteDescription !== undefined) {
                database.setSetting("siteDescription", siteDescription);
                settingsChanged = true;
            }
            if (publicUrl !== undefined) {
                database.setSetting("publicUrl", publicUrl);
                settingsChanged = true;
            }
            if (artistName !== undefined) {
                database.setSetting("artistName", artistName);
                settingsChanged = true;
            }
            if (coverImage !== undefined) {
                database.setSetting("coverImage", coverImage);
                settingsChanged = true;
            }
            if (req.body.backgroundImage !== undefined) {
                database.setSetting("backgroundImage", req.body.backgroundImage);
            }
            if (gunPeers !== undefined) {
                database.setSetting("gunPeers", gunPeers);
                settingsChanged = true;
            }
            if (web3_checkout_address !== undefined) {
                database.setSetting("web3_checkout_address", web3_checkout_address);
            }
            if (web3_nft_address !== undefined) {
                database.setSetting("web3_nft_address", web3_nft_address);
            }

            // Re-register on GunDB if settings changed and publicUrl is available
            const currentPublicUrl = publicUrl !== undefined ? publicUrl : database.getSetting("publicUrl") || config.publicUrl;

            if (settingsChanged && currentPublicUrl) {
                const currentSiteName = siteName !== undefined ? siteName : database.getSetting("siteName") || config.siteName || "TuneCamp Server";
                const currentArtistName = artistName !== undefined ? artistName : database.getSetting("artistName") || "";
                const effectiveArtistName = currentArtistName || (database.getArtists()[0]?.name || "");

                const siteInfo = {
                    url: currentPublicUrl,
                    title: currentSiteName,
                    description: siteDescription !== undefined ? siteDescription : database.getSetting("siteDescription") || "",
                    artistName: effectiveArtistName,
                    coverImage: coverImage !== undefined ? coverImage : database.getSetting("coverImage") || ""
                };

                await gundbService.registerSite(siteInfo);

                const publicAlbums = database.getAlbums(true);
                for (const album of publicAlbums) {
                    // Double check visibility just in case
                    if (album.visibility === 'public' || album.visibility === 'unlisted') {
                        const tracks = database.getTracks(album.id);
                        await gundbService.registerTracks(siteInfo, album, tracks);
                    }
                }
                console.log(`🌐 Re-registered site and tracks on GunDB with updated settings: ${currentPublicUrl}`);
            }

            res.json({ message: "Settings updated" });
        } catch (error) {
            console.error("Error updating settings:", error);
            res.status(500).json({ error: "Failed to update settings" });
        }
    });

    /**
     * POST /api/admin/network/ap/follow
     * Follow a remote ActivityPub instance/actor (Root Admin only)
     */
    router.post("/network/ap/follow", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can follow remote instances" });
            }
            const { url } = req.body;
            if (!url) {
                return res.status(400).json({ error: "URL is required" });
            }

            await apService.followRemoteActor(url, "site");
            res.json({ message: `Successfully sent follow request to ${url}` });
        } catch (error: any) {
            console.error("Error following AP actor:", error);
            res.status(500).json({ error: error.message || "Failed to follow remote actor" });
        }
    });

    /**
     * GET /api/admin/system/identity
     * Get server identity keypair (ADMIN ONLY)
     */
    router.get("/system/identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can access system identity
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can access system identity" });
            }
            const pair = await gundbService.getIdentityKeyPair();
            res.json(pair);
        } catch (error) {
            console.error("Error getting identity:", error);
            res.status(500).json({ error: "Failed to get identity" });
        }
    });

    /**
     * GET /api/admin/system/ap-identity
     * Get site actor ActivityPub identity keypair (ADMIN ONLY)
     */
    router.get("/system/ap-identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can access site identity
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can access site identity" });
            }
            const publicKey = database.getSetting("site_public_key");
            const privateKey = database.getSetting("site_private_key");
            res.json({ publicKey, privateKey });
        } catch (error) {
            console.error("Error getting site AP identity:", error);
            res.status(500).json({ error: "Failed to get site AP identity" });
        }
    });

    /**
     * POST /api/admin/system/identity
     * Import server identity keypair (ADMIN ONLY)
     */
    router.post("/system/identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can import system identity
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can import system identity" });
            }
            const pair = req.body;
            const success = await gundbService.setIdentityKeyPair(pair);
            if (success) {
                res.json({ message: "Identity imported successfully" });
            } else {
                res.status(400).json({ error: "Invalid keypair or authentication failed" });
            }
        } catch (error) {
            console.error("Error setting identity:", error);
        }
    });

    /**
     * POST /api/admin/system/sync
     * Force sync with GunDB network
     */
    router.post("/system/sync", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can force sync
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can force sync" });
            }
            await gundbService.syncNetwork();
            res.json({ message: "Network sync completed" });
        } catch (error) {
            console.error("Error syncing network:", error);
            res.status(500).json({ error: "Failed to sync network" });
        }
    });

    /**
     * POST /api/admin/system/consolidate
     * Consolidate files in the filesystem based on DB tags
     */
    router.post("/system/consolidate", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can trigger consolidation
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can trigger file consolidation" });
            }

            const result = await scanner.consolidateFiles(musicDir);
            res.json({ 
                message: "File consolidation completed",
                ...result
            });
        } catch (error) {
            console.error("Error consolidating files:", error);
            res.status(500).json({ error: "Failed to consolidate files" });
        }
    });

    /**
     * POST /api/admin/network/cleanup
     * Force global cleanup of unreachable sites in GunDB network
     */
    router.post("/network/cleanup", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can trigger global cleanup
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can trigger global network cleanup" });
            }

            // This can take a while, so we don't await it here if we want to return immediately,
            // but for a cleanup triggered by a button, it's probably better to await or return status.
            // Awaiting for now to provide better feedback to the admin.
            await gundbService.cleanupGlobalNetwork();

            res.json({ message: "Global network cleanup completed" });
        } catch (error) {
            console.error("Error in global network cleanup:", error);
            res.status(500).json({ error: "Global cleanup failed" });
        }
    });

    /**
     * POST /api/admin/network/sync-community
     * Discover other Tunecamp instances via GunDB and follow them via ActivityPub (Root Admin only)
     */
    router.post("/network/sync-community", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can sync community" });
            }

            const result = await publishingService.syncCommunityFollows();
            res.json({ 
                message: `Community sync completed. Discovered ${result.discovered} sites, followed ${result.followed} new instances.`,
                ...result 
            });
        } catch (error: any) {
            console.error("Error syncing community follows:", error);
            res.status(500).json({ error: error.message || "Failed to sync community follows" });
        }
    });

    /**
     * PUT /api/admin/releases/:id
     * Update an album or formal release
     */
    router.put("/releases/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const body = req.body;

            console.log(`📝 [Debug] PUT /api/admin/releases/${id} received:`, {
                title: body.title,
                track_ids: body.track_ids,
                track_ids_count: body.track_ids?.length
            });

            // Check both releases and albums
            const release = database.getRelease(id);
            const album = database.getAlbum(id);
            const item = release || album;

            if (!item) {
                console.warn(`⚠️ [Debug] Release/Album ${id} not found during update`);
                return res.status(404).json({ error: "Release or album not found" });
            }

            // Permission Check
            const ownerId = release ? release.owner_id : album?.owner_id;
            if (req.artistId && !req.isAdmin && ownerId !== req.artistId) {
                console.warn(`⛔ [Debug] Access Denied for user ${req.username} on item ${id}. Owner: ${ownerId}, Request ArtistId: ${req.artistId}`);
                return res.status(403).json({ error: "Access denied" });
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
            if (body.genres) {
                const genreStr = Array.isArray(body.genres) ? body.genres.join(", ") : body.genres;
                updates.genre = genreStr;
            }
            if (body.externalLinks) updates.external_links = JSON.stringify(body.externalLinks);
            if (body.publishedToGunDB !== undefined) updates.published_to_gundb = body.publishedToGunDB;
            if (body.publishedToAP !== undefined) updates.published_to_ap = body.publishedToAP;

            if (Object.keys(updates).length > 0) {
                if (release) {
                    console.log(`   - Updating formal release metadata:`, Object.keys(updates));
                    database.updateRelease(id, updates);
                } else {
                    console.log(`   - Updating library album metadata:`, Object.keys(updates));
                    // Legacy album update - map generic fields to specific update methods or a generic one if available
                    if (updates.title) database.updateAlbumTitle(id, updates.title);
                    if (updates.genre) database.updateAlbumGenre(id, updates.genre);
                    if (updates.visibility) database.updateAlbumVisibility(id, updates.visibility);
                    if (updates.download !== undefined) database.updateAlbumDownload(id, updates.download);
                    if (updates.price !== undefined) database.updateAlbumPrice(id, updates.price, updates.currency);
                    if (updates.external_links) database.updateAlbumLinks(id, updates.external_links);
                    if (updates.published_to_gundb !== undefined || updates.published_to_ap !== undefined) {
                        database.updateAlbumFederationSettings(id, !!updates.published_to_gundb, !!updates.published_to_ap);
                    }
                }
            }

            // --- TRACKS UPDATE LOGIC ---
            if (body.track_ids && Array.isArray(body.track_ids)) {
                const newTrackIds = body.track_ids.map((tid: any) => parseInt(tid, 10)).filter((tid: any) => !isNaN(tid));
                console.log(`   - Received ${newTrackIds.length} track IDs from frontend:`, newTrackIds);
                
                if (release) {
                    // Update formal release tracks
                    const existingTrackIds = database.getReleaseTrackIds(id);
                    console.log(`   - Existing formal release tracks:`, existingTrackIds);

                    const toAdd = newTrackIds.filter((ntid: number) => !existingTrackIds.includes(ntid));
                    const toRemove = existingTrackIds.filter((etid: number) => !newTrackIds.includes(etid));

                    database.cleanUpGhostTracks(id);

                    console.log(`   - Formal Release Sync: existing=${existingTrackIds.length}, toAdd=${toAdd.length}, toRemove=${toRemove.length}`);

                    for (const trackId of toAdd) {
                        console.log(`     🔗 Adding track ${trackId} to formal release ${id}`);
                        database.addTrackToRelease(id, trackId);
                    }
                    for (const trackId of toRemove) {
                        console.log(`     ✂️ Removing track ${trackId} from formal release ${id}`);
                        database.removeTrackFromRelease(id, trackId);
                    }
                    // Also update order if provided (preserving the list order)
                    console.log(`     🔢 Updating track order for formal release ${id}:`, newTrackIds);
                    database.updateReleaseTracksOrder(id, newTrackIds);

                    if (body.tracks_data && Array.isArray(body.tracks_data)) {
                        console.log(`     📝 Updating track metadata for formal release ${id}`);
                        for (const td of body.tracks_data) {
                            database.updateReleaseTrackMetadata(id, td.id, {
                                title: td.title,
                                price: td.price,
                                currency: td.currency || 'ETH'
                            });
                        }
                    }
                } else if (album) {
                    // Update library album tracks
                    const existingTracks = database.getTracks(id);
                    const existingTrackIds = existingTracks.map(t => t.id);
                    console.log(`   - Existing library album tracks:`, existingTrackIds);
                    
                    const toAdd = newTrackIds.filter((ntid: number) => !existingTrackIds.includes(ntid));
                    const toRemove = existingTrackIds.filter((etid: number) => !newTrackIds.includes(etid));

                    console.log(`   - Library Album Sync: existing=${existingTrackIds.length}, toAdd=${toAdd.length}, toRemove=${toRemove.length}`);

                    for (const trackId of toAdd) {
                        console.log(`     🔗 Linking track ${trackId} to library album ${id}`);
                        database.updateTrackAlbum(trackId, id);
                    }
                    for (const trackId of toRemove) {
                        console.log(`     ✂️ Unlinking track ${trackId} from library album ${id}`);
                        database.updateTrackAlbum(trackId, null);
                    }

                    // For library albums, we should also update the track_num in the tracks table to preserve reordering
                    console.log(`     🔢 Updating track order for library album ${id}`);
                    for (let i = 0; i < newTrackIds.length; i++) {
                        const trackId = newTrackIds[i];
                        database.updateTrackOrder(trackId, i + 1);
                    }
                }
            }

            // Sync changes
            publishingService.syncRelease(id).catch(e => console.error("❌ Failed to sync release update:", e));

            const finalItem = release ? database.getRelease(id) : database.getAlbum(id);
            console.log(`✅ [Debug] PUT /api/admin/releases/${id} completed successfully`);
            res.json(finalItem || { message: "Updated successfully" });

        } catch (error) {
            console.error("❌ Error updating release:", error);
            res.status(500).json({ error: "Failed to update release" });
        }
    });

    /**
     * GET /api/admin/releases/:id/folder
     * Get folder contents for a release
     */
    router.get("/releases/:id/folder", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const tracks = database.getTracksByReleaseId(id); // Use the more robust unified getter
            
            if (tracks.length === 0) return res.json({ folder: null, files: [] });

            const firstWithFile = tracks.find(t => t.file_path);
            if (!firstWithFile || !firstWithFile.file_path) {
                return res.json({ folder: null, files: [] });
            }

            const trackDir = path.dirname(firstWithFile.file_path);
            const releaseDir = trackDir.includes("releases") ? trackDir : path.join(musicDir, "releases", path.basename(trackDir));
            // Security: ensure we are within musicDir
            const absoluteReleaseDir = path.resolve(musicDir, releaseDir);
            if (!absoluteReleaseDir.startsWith(path.resolve(musicDir))) {
                return res.status(403).json({ error: "Invalid path" });
            }

            const files: any[] = [];
            async function walkDir(dir: string, prefix = "") {
                if (!(await fs.pathExists(dir))) return;
                const entries = await fs.readdir(dir, { withFileTypes: true });
                await Promise.all(entries.map(async (entry) => {
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
                }));
            }
            
            if (await fs.pathExists(absoluteReleaseDir)) {
                await walkDir(absoluteReleaseDir);
            }
            res.json({ folder: releaseDir, files });
        } catch (error) {
            console.error("Error getting release folder:", error);
            res.status(500).json({ error: "Failed to get folder" });
        }
    });

    /**
     * DELETE /api/admin/releases/:id
     * Delete an album or formal release
     */
    router.delete("/releases/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const keepFiles = req.query.keepFiles === 'true';

            // Check if it's a formal release or a library album
            const release = database.getRelease(id);
            const album = database.getAlbum(id);

            if (!release && !album) {
                return res.status(404).json({ error: "Release not found" });
            }

            // Permission Check
            const ownerId = release ? release.owner_id : album?.owner_id;
            if (req.artistId && !req.isRootAdmin && ownerId !== req.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            if (release) {
                // Handle unpublishing for formal releases
                try {
                    await (publishingService as any).unpublishReleaseFromAP(release);
                    await (publishingService as any).unpublishReleaseFromGunDB(release);
                } catch (e) {
                    console.error("Failed to unpublish formal release:", e);
                }
                database.deleteRelease(id);
            } else if (album) {
                database.deleteAlbum(id, keepFiles);
            }

            res.json({ message: "Release deleted successfully" });
        } catch (error) {
            console.error("Error deleting release:", error);
            res.status(500).json({ error: "Failed to delete release" });
        }
    });

    /**
     * GET /api/admin/artists/:id/identity
     * Get artist identity keypair (Root Admin or Assigned Artist Admin only)
     */
    router.get("/artists/:id/identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            const artistId = parseInt(req.params.id);
            if (isNaN(artistId)) {
                return res.status(400).json({ error: "Invalid artist ID" });
            }

            // Permission Check
            // ONLY the artist themselves or root admin can see keys.
            if (!req.isRootAdmin && (!req.artistId || req.artistId !== artistId)) {
                return res.status(403).json({ error: "Access denied: Only the artist or root admin can access their identity keys" });
            }

            const artist = database.getArtist(artistId);
            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Return keys (even if null/empty, let frontend handle it)
            res.json({
                publicKey: artist.public_key,
                privateKey: artist.private_key
            });
        } catch (error) {
            console.error("Error getting artist identity:", error);
            res.status(500).json({ error: "Failed to get artist identity" });
        }
    });

    /**
     * GET /api/admin/system/me
     * Get current admin user info (username, isRootAdmin)
     */
    router.get("/system/me", (req: AuthenticatedRequest, res: any) => {
        try {
            const username = req.username || "";
            res.json({ username, isRootAdmin: !!req.isRootAdmin });
        } catch (error) {
            console.error("Error getting current admin:", error);
            res.status(500).json({ error: "Failed to get current admin" });
        }
    });

    /**
     * GET /api/admin/system/users
     * List all admin users
     */
    router.get("/system/users", (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can list users
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can list users" });
            }
            const admins = authService.listAdmins();
            res.json(admins);
        } catch (error) {
            console.error("Error listing admins:", error);
            res.status(500).json({ error: "Failed to list admins" });
        }
    });

    /**
     * POST /api/admin/system/users
     * Create new admin user (root admin only)
     */
    router.post("/system/users", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only the primary admin can create new admins" });
            }
            const { username, password, artistId, isAdmin } = req.body;
            if (!username) {
                return res.status(400).json({ error: "Username is required" });
            }

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            if (isAdmin) {
                await authService.createAdmin(username, password, artistId);
            } else {
                await authService.createUser(username, password, artistId || null as any, 1024 * 1024 * 1024);
            }
            res.json({ message: "Admin user created" });
        } catch (error: any) {
            console.error("Error creating admin:", error);
            if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return res.status(409).json({ error: "Username already exists" });
            }
            res.status(500).json({ error: "Failed to create admin" });
        }
    });

    /**
     * PUT /api/admin/system/users/:id
     * Update admin user (root admin only)
     */
    router.put("/system/users/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only the primary admin can manage users" });
            }
            const id = parseInt(req.params.id, 10);
            const { artistId, isAdmin } = req.body;

            const role = isAdmin === undefined ? undefined : (isAdmin ? 'admin' : 'user');
            authService.updateAdmin(id, artistId, role);
            res.json({ message: "Admin user updated" });
        } catch (error) {
            console.error("Error updating admin:", error);
            res.status(500).json({ error: "Failed to update admin" });
        }
    });

    /**
     * DELETE /api/admin/system/users/:id
     * Delete admin user (root admin only)
     */
    router.delete("/system/users/:id", (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only the primary admin can remove admins" });
            }
            const id = parseInt(req.params.id, 10);
            authService.deleteAdmin(id);
            res.json({ message: "Admin user deleted" });
        } catch (error: any) {
            console.error("Error deleting admin:", error);
            if (error.message.includes("last admin")) {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: "Failed to delete admin" });
        }
    });
    
    /**
     * PUT /api/admin/system/users/:id/status
     * Enable/disable admin user (root admin only)
     */
    router.put("/system/users/:id/status", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only the primary admin can manage user status" });
            }
            const id = parseInt(req.params.id, 10);
            const { active } = req.body;
            
            authService.toggleUserStatus(id, active);
            res.json({ message: `User ${active ? 'enabled' : 'disabled'} successfully` });
        } catch (error: any) {
            console.error("Error toggling user status:", error);
            res.status(500).json({ error: error.message || "Failed to toggle user status" });
        }
    });

    /**
     * PUT /api/admin/system/users/:id/password
     * Reset admin user password
     */
    router.put("/system/users/:id/password", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { password } = req.body;

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            const admins = authService.listAdmins();
            const admin = admins.find(a => a.id === id);

            if (!admin) {
                return res.status(404).json({ error: "User not found" });
            }

            // Permission Check
            // Only root admin can change other users' passwords
            const isRoot = req.isRootAdmin;
            if (!isRoot && admin.username !== req.username) {
                return res.status(403).json({ error: "Access denied: You can only change your own password" });
            }

            await authService.changePassword(admin.username, password);
            res.json({ message: "Password updated" });
        } catch (error) {
            console.error("Error resetting password:", error);
            res.status(500).json({ error: "Failed to reset password" });
        }
    });

    /**
     * PUT /api/admin/posts/:id
     * Update a post
     */
    router.put("/posts/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { content, visibility } = req.body;

            const post = database.getPost(id);
            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            // Permission Check
            if (req.artistId && !req.isAdmin && post.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            const oldVisibility = post.visibility;
            database.updatePost(id, content, visibility);
            const updatedPost = database.getPost(id);

            if (updatedPost) {
                // Use PublishingService
                publishingService.syncPost(id).catch(e => console.error("Failed to sync post update:", e));
            }

            res.json(updatedPost);
        } catch (error) {
            console.error("Error updating post:", error);
            res.status(500).json({ error: "Failed to update post" });
        }
    });

    /**
     * POST /api/admin/posts
     * Create a new post for an artist
     */
    router.post("/posts", async (req: AuthenticatedRequest, res: any) => {
        try {
            const { artistId, content, visibility } = req.body;
            if (!artistId || !content) {
                return res.status(400).json({ error: "Missing artistId or content" });
            }

            // Permission Check
            if (req.artistId && !req.isAdmin && req.artistId !== parseInt(artistId)) {
                return res.status(403).json({ error: "You can only post for your assign artist" });
            }

            const postId = database.createPost(artistId, content, visibility || 'public');
            const post = database.getPost(postId);

            if (post) {
                // Use PublishingService
                publishingService.syncPost(postId).catch(e => console.error("Failed to sync new post:", e));
            }

            res.status(201).json(post);
        } catch (error) {
            console.error("Error creating post:", error);
            res.status(500).json({ error: "Failed to create post" });
        }
    });

    /**
     * DELETE /api/admin/posts/:id
     * Delete a post
     */
    router.delete("/posts/:id", (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const post = database.getPost(id);
            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            // Permission Check
            if (req.artistId && !req.isAdmin && post.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            database.deletePost(id);

            // Use PublishingService
            publishingService.unpublishPostFromAP(post).catch(e => console.error("Failed to sync post delete:", e));

            res.json({ message: "Post deleted" });
        } catch (error) {
            console.error("Error deleting post:", error);
            res.status(500).json({ error: "Failed to delete post" });
        }
    });

    /**
     * GET /api/admin/network/ap/peers
     * List followed ActivityPub actors
     */
    router.get("/network/ap/peers", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can view peers" });
            }
            const peers = database.getFollowedActors();
            res.json(peers);
        } catch (error) {
            console.error("Error listing peers:", error);
            res.status(500).json({ error: "Failed to list peers" });
        }
    });

    /**
     * POST /api/admin/network/ap/unfollow
     * Unfollow a remote ActivityPub actor
     */
    router.post("/network/ap/unfollow", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can unfollow peers" });
            }
            const { url } = req.body;
            if (!url) {
                return res.status(400).json({ error: "URL is required" });
            }

            await apService.unfollowRemoteActor(url, "site");
            res.json({ message: `Successfully sent unfollow request to ${url}` });
        } catch (error: any) {
            console.error("Error unfollowing AP actor:", error);
            res.status(500).json({ error: error.message || "Failed to unfollow remote actor" });
        }
    });

    /**
     * POST /api/admin/network/ap/sync
     * Force sync remote actors content
     */
    router.post("/network/ap/sync", async (req: AuthenticatedRequest, res: any) => {
        try {
             if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can sync peers" });
            }
            const { url } = req.body;
            if (url) {
                await apService.fetchRemoteOutbox(url);
                res.json({ message: `Sync triggered for ${url}` });
            } else {
                const peers = database.getFollowedActors();
                for (const peer of peers) {
                    apService.fetchRemoteOutbox(peer.uri).catch(e => console.error(`Failed to sync ${peer.uri}:`, e));
                }
                res.json({ message: `Sync triggered for ${peers.length} peers` });
            }
        } catch (error: any) {
            console.error("Error syncing AP actors:", error);
            res.status(500).json({ error: error.message || "Failed to sync remote actors" });
        }
    });

    return router;
}
