import { Router } from "express";
import type { GunDBService } from "../gundb.js";
import type { DatabaseService } from "../database.js";
import type { ServerConfig } from "../config.js";

export function createStatsRoutes(gundbService: GunDBService, dbService: DatabaseService, config: ServerConfig): Router {
    const router = Router();

    /**
     * GET /api/stats/release/:slug
     * Get download count for a release
     */
    router.get("/release/:slug", async (req, res) => {
        try {
            const slug = req.params.slug;
            const count = await gundbService.getDownloadCount(slug);
            res.json({ slug, downloads: count });
        } catch (error) {
            console.error("Error getting download count:", error);
            res.status(500).json({ error: "Failed to get download count" });
        }
    });

    /**
     * POST /api/stats/release/:slug/download
     * Increment download count for a release
     */
    router.post("/release/:slug/download", async (req, res) => {
        try {
            const slug = req.params.slug;
            const count = await gundbService.incrementDownloadCount(slug);
            res.json({ slug, downloads: count });
        } catch (error) {
            console.error("Error incrementing download count:", error);
            res.status(500).json({ error: "Failed to increment download count" });
        }
    });

    /**
     * GET /api/stats/track/:releaseSlug/:trackId
     * Get download count for a specific track
     */
    router.get("/track/:releaseSlug/:trackId", async (req, res) => {
        try {
            const { releaseSlug, trackId } = req.params;
            const count = await gundbService.getTrackDownloadCount(releaseSlug, trackId);
            res.json({ releaseSlug, trackId, downloads: count });
        } catch (error) {
            console.error("Error getting track download count:", error);
            res.status(500).json({ error: "Failed to get track download count" });
        }
    });

    /**
     * POST /api/stats/track/:releaseSlug/:trackId/download
     * Increment download count for a specific track
     */
    router.post("/track/:releaseSlug/:trackId/download", async (req, res) => {
        try {
            const { releaseSlug, trackId } = req.params;
            const count = await gundbService.incrementTrackDownloadCount(releaseSlug, trackId);
            res.json({ releaseSlug, trackId, downloads: count });
        } catch (error) {
            console.error("Error incrementing track download count:", error);
            res.status(500).json({ error: "Failed to increment track download count" });
        }
    });

    /**
     * GET /api/stats/track/:releaseSlug/:trackId/plays
     * Get play count for a specific track from GunDB
     */
    router.get("/track/:releaseSlug/:trackId/plays", async (req, res) => {
        try {
            const { releaseSlug, trackId } = req.params;
            const count = await gundbService.getTrackPlayCount(releaseSlug, trackId);
            res.json({ releaseSlug, trackId, plays: count });
        } catch (error) {
            console.error("Error getting track play count:", error);
            res.status(500).json({ error: "Failed to get track play count" });
        }
    });

    /**
     * POST /api/stats/track/:releaseSlug/:trackId/play
     * Increment play count for a specific track in GunDB
     */
    router.post("/track/:releaseSlug/:trackId/play", async (req, res) => {
        try {
            const { releaseSlug, trackId } = req.params;
            const count = await gundbService.incrementTrackPlayCount(releaseSlug, trackId);
            res.json({ releaseSlug, trackId, plays: count });
        } catch (error) {
            console.error("Error incrementing track play count:", error);
            res.status(500).json({ error: "Failed to increment track play count" });
        }
    });

    /**
     * GET /api/stats/network/sites
     * Get all TuneCamp sites registered in the community (GunDB + AP Actors)
     */
    router.get("/network/sites", async (req, res) => {
        try {
            const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`;
            
            // 1. Get sites from GunDB
            const gunSites = await gundbService.getCommunitySites();
            const formattedGunSites = gunSites.map(s => ({
                url: s.url,
                name: s.name || s.title || "Untitled",
                description: s.description || "",
                version: s.version || "2.0",
                lastSeen: s.lastSeen,
                coverImage: s.coverImage || null,
                federation: "gundb"
            }));

            // 2. Get actors from ActivityPub (Local DB of remote actors)
            const apActors = dbService.getFollowedActors();
            const formattedApSites = apActors.map(a => ({
                url: a.uri,
                name: a.name || a.username || "AP Actor",
                description: a.summary || "",
                version: "ActivityPub",
                lastSeen: a.last_seen || new Date().toISOString(),
                coverImage: a.icon_url || null,
                federation: "activitypub"
            }));

            // 3. Include local site as a "site"
            const localSite = {
                url: publicUrl,
                name: dbService.getSetting("siteName") || "Local Instance",
                description: dbService.getSetting("siteDescription") || "My TuneCamp Server",
                version: "2.0 (Local)",
                lastSeen: new Date().toISOString(),
                coverImage: dbService.getSetting("coverImage") || null,
                federation: "local"
            };

            res.json([localSite, ...formattedGunSites, ...formattedApSites]);
        } catch (error) {
            console.error("Error getting community sites:", error);
            res.status(500).json({ error: "Failed to get community sites" });
        }
    });

    /**
     * GET /api/stats/network/tracks
     * Get all content shared by the TuneCamp community (GunDB + ActivityPub + Local)
     */
    router.get("/network/tracks", async (req, res) => {
        try {
            const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`;
            const baseUrl = publicUrl.replace(/\/$/, "");

            // 1. Get tracks from GunDB (P2P Federation)
            const gundbTracksRaw = await gundbService.getCommunityTracks();
            const gundbTracks = gundbTracksRaw.map(t => ({
                ...t,
                federation: "gundb"
            }));

            // 2. Get tracks from ActivityPub (Standard Federation - Remote)
            const remoteApTracks = dbService.getRemoteTracks();
            const apTracks = remoteApTracks.map(content => ({
                slug: content.ap_id,
                title: content.title || "Untitled",
                artistName: content.artist_name || "Unknown Artist",
                releaseTitle: content.album_name || "Unknown Album",
                coverUrl: content.cover_url || null,
                audioUrl: content.stream_url || null,
                duration: content.duration || 0,
                siteUrl: content.url || null,
                pubKey: content.actor_uri, 
                federation: "activitypub",
                type: "release"
            }));

            // 3. Get posts from ActivityPub (Standard Federation - Remote)
            const remoteApPosts = dbService.getRemotePosts();
            const apPosts = remoteApPosts.map(content => ({
                slug: content.ap_id,
                title: content.title || "Untitled Post",
                artistName: content.artist_name || "Unknown Artist",
                content: content.content || "",
                coverUrl: content.cover_url || null,
                siteUrl: content.url || null,
                pubKey: content.actor_uri,
                published_at: content.published_at,
                federation: "activitypub",
                type: "post"
            }));

            // 4. Get local public releases
            const localReleases = dbService.getReleases(true); // publicOnly = true
            const formattedLocalReleases = localReleases.map(r => {
                const tracks = dbService.getTracksByReleaseId(r.id);
                const firstTrack = tracks[0];
                return {
                    slug: r.slug,
                    title: r.title,
                    artistName: r.artist_name || "Local Artist",
                    releaseTitle: r.title,
                    coverUrl: r.cover_path ? `${baseUrl}/api/albums/${r.slug}/cover` : null,
                    audioUrl: firstTrack ? `${baseUrl}/api/tracks/${firstTrack.id}/stream` : null,
                    duration: firstTrack?.duration || 0,
                    siteUrl: `${baseUrl}/albums/${r.slug}`,
                    federation: "local",
                    type: "release"
                };
            });

            // 5. Get local public posts
            const artists = dbService.getArtists();
            const localPosts: any[] = [];
            for (const artist of artists) {
                const posts = dbService.getPostsByArtist(artist.id, true);
                posts.forEach(p => {
                    localPosts.push({
                        slug: p.slug,
                        title: p.content.replace(/<[^>]*>?/gm, '').substring(0, 50),
                        artistName: p.artist_name || artist.name,
                        content: p.content,
                        coverUrl: p.artist_photo ? `${baseUrl}/api/artists/${p.artist_slug}/cover` : null,
                        siteUrl: `${baseUrl}/@${p.artist_slug}?post=${p.slug}`,
                        published_at: p.published_at || p.created_at,
                        federation: "local",
                        type: "post"
                    });
                });
            }

            // Merge results
            const allItems = [
                ...gundbTracks.map(t => ({ ...t, type: "release" })), 
                ...apTracks, 
                ...apPosts,
                ...formattedLocalReleases,
                ...localPosts
            ];
            
            res.json(allItems);
        } catch (error) {
            console.error("Error getting community content:", error);
            res.status(500).json({ error: "Failed to get community content" });
        }
    });

    /**
     * GET /api/stats/network/status
     * Get summary stats for the community network
     */
    router.get("/network/status", async (req, res) => {
        try {
            const gunSites = await gundbService.getCommunitySites();
            const gunTracks = await gundbService.getCommunityTracks();
            const apActors = dbService.getFollowedActors();
            const apTracks = dbService.getRemoteTracks();
            const localReleases = dbService.getReleases(true);

            res.json({
                sites: gunSites.length + apActors.length + 1, // +1 for local
                tracks: gunTracks.length + apTracks.length + localReleases.length,
                lastUpdate: new Date().toISOString()
            });
        } catch (error) {
            console.error("Error getting network status:", error);
            res.status(500).json({ error: "Failed to get network status" });
        }
    });

    return router;
}
