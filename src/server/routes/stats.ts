import { Router } from "express";
import type { GunDBService } from "../gundb.js";
import type { DatabaseService } from "../database.js";

export function createStatsRoutes(gundbService: GunDBService, dbService: DatabaseService): Router {
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
     * Get all TuneCamp sites registered in the community
     */
    router.get("/network/sites", async (req, res) => {
        try {
            const sites = await gundbService.getCommunitySites();
            res.json(sites);
        } catch (error) {
            console.error("Error getting community sites:", error);
            res.status(500).json({ error: "Failed to get community sites" });
        }
    });

    /**
     * GET /api/stats/network/tracks
     * Get all tracks shared by the TuneCamp community (GunDB + ActivityPub)
     */
    router.get("/network/tracks", async (req, res) => {
        try {
            // 1. Get tracks from GunDB (P2P Federation)
            const gundbTracks = await gundbService.getCommunityTracks();

            // 2. Get tracks from ActivityPub (Standard Federation)
            const remoteApContent = dbService.getRemoteTracks();
            const apTracks = remoteApContent.map(content => ({
                slug: content.ap_id,
                title: content.title || "Untitled",
                artistName: content.artist_name || "Unknown Artist",
                releaseTitle: content.album_name || "Unknown Album",
                coverUrl: content.cover_url || null,
                audioUrl: content.stream_url || null,
                duration: content.duration || 0,
                siteUrl: content.url || null,
                pubKey: content.actor_uri, // Use actor URI as identifier
                federation: "activitypub"
            }));

            // Merge results
            const allTracks = [...gundbTracks, ...apTracks];
            res.json(allTracks);
        } catch (error) {
            console.error("Error getting community tracks:", error);
            res.status(500).json({ error: "Failed to get community tracks" });
        }
    });

    return router;
}
