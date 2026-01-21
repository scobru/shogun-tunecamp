import { Router } from "express";
import type { GunDBService } from "../gundb.js";

export function createStatsRoutes(gundbService: GunDBService) {
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
     * Get all tracks shared by the TuneCamp community
     */
    router.get("/network/tracks", async (req, res) => {
        try {
            const tracks = await gundbService.getCommunityTracks();
            res.json(tracks);
        } catch (error) {
            console.error("Error getting community tracks:", error);
            res.status(500).json({ error: "Failed to get community tracks" });
        }
    });

    return router;
}
