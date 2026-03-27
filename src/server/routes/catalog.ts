import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createCatalogRoutes(database: DatabaseService): Router {
    const router = Router();

    /**
     * GET /api/catalog
     * Get catalog overview with stats
     */
    router.get("/", async (req: AuthenticatedRequest, res) => {
        try {
            const stats = await database.getStats();
            const recentReleases = database
                .getReleases(req.isAdmin !== true)
                .slice(0, 10);
            
            const recentAlbums = database
                .getAlbums(req.isAdmin !== true)
                .slice(0, 10);

            // For non-admin, calculate public tracks count
            let publicStats = stats;
            if (!req.isAdmin) {
                const publicTracksCount = database.getPublicTracksCount();
                publicStats = {
                    albums: stats.publicAlbums,
                    tracks: publicTracksCount,
                    artists: stats.artists,
                    publicAlbums: stats.publicAlbums,
                    totalUsers: stats.totalUsers,
                    storageUsed: stats.storageUsed,
                    networkSites: stats.networkSites,
                    totalTracks: publicTracksCount,
                    genresCount: stats.genresCount
                };
            }

            res.json({
                stats: publicStats,
                recentReleases: recentReleases.map(r => ({
                    ...r,
                    artistId: r.artist_id,
                    artistName: r.artist_name,
                    coverImage: r.cover_path // r.cover_path is already used by frontend for albums
                })),
                recentAlbums: recentAlbums.map(a => ({
                    ...a,
                    artistId: a.artist_id,
                    artistName: a.artist_name,
                    coverImage: a.cover_path
                })),
            });
        } catch (error) {
            console.error("Error getting catalog:", error);
            res.status(500).json({ error: "Failed to get catalog" });
        }
    });

    /**
     * GET /api/catalog/search
     * Search across artists, albums, tracks
     */
    router.get("/search", (req: AuthenticatedRequest, res) => {
        try {
            const query = req.query.q as string;
            if (!query) {
                return res.json([]);
            }

            const results = database.search(query, req.isAdmin !== true);
            
            // Map results to frontend format
            const mappedResults = {
                artists: results.artists.map(a => ({
                    ...a,
                    coverImage: `/api/artists/${a.id}/cover`
                })),
                albums: results.albums.map(a => ({
                    ...a,
                    artistId: a.artist_id,
                    artistName: a.artist_name,
                    coverImage: `/api/albums/${a.id}/cover`
                })),
                tracks: results.tracks.map(t => ({
                    ...t,
                    albumId: t.album_id,
                    artistId: t.artist_id,
                    artistName: t.artist_name,
                    albumName: (t as any).album_title
                }))
            };

            res.json(mappedResults);
        } catch (error) {
            console.error("Error searching:", error);
            res.status(500).json({ error: "Search failed" });
        }
    });

    /**
     * GET /api/catalog/settings
     * Get public site settings (site name, description)
     */
    router.get("/settings", (req, res) => {
        try {
            const siteName = database.getSetting("siteName") || "TuneCamp";
            const siteDescription = database.getSetting("siteDescription") || "";
            const donationLinksJson = database.getSetting("donationLinks");
            const donationLinks = donationLinksJson ? JSON.parse(donationLinksJson) : null;

            const backgroundImage = database.getSetting("backgroundImage") || undefined;
            const coverImage = database.getSetting("coverImage") || undefined;
            const mode = database.getSetting("mode") || 'label';
            const siteId = database.getSetting("siteId") || "";
            const gunPeers = database.getSetting("gunPeers") || "";
            const web3_checkout_address = database.getSetting("web3_checkout_address") || "";
            const web3_nft_address = database.getSetting("web3_nft_address") || "";

            res.json({ siteName, siteDescription, donationLinks, backgroundImage, coverImage, mode, siteId, gunPeers, web3_checkout_address, web3_nft_address });
        } catch (error) {
            console.error("Error getting settings:", error);
            res.status(500).json({ error: "Failed to get settings" });
        }
    });

    /**
     * GET /api/catalog/remote/tracks
     * List federated tracks
     */
    router.get("/remote/tracks", (req, res) => {
        try {
            const tracks = database.getRemoteTracks();
            res.json(tracks);
        } catch (error) {
            console.error("Error getting remote tracks:", error);
            res.status(500).json({ error: "Failed to get remote tracks" });
        }
    });

    /**
     * GET /api/catalog/remote/posts
     * List federated posts
     */
    router.get("/remote/posts", (req, res) => {
        try {
            const posts = database.getRemotePosts();
            res.json(posts);
        } catch (error) {
            console.error("Error getting remote posts:", error);
            res.status(500).json({ error: "Failed to get remote posts" });
        }
    });

    return router;
}
