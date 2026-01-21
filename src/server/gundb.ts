import Gun from "gun";
import type { DatabaseService, Album, Track } from "./database.js";

// Public GunDB peers for the community registry
const REGISTRY_PEERS = [
    "https://gun.defucc.me/gun",
    "https://gun.o8.is/gun",
    "https://shogun-relay.scobrudot.dev/gun",
    "https://relay.peer.ooo/gun",
];

const REGISTRY_ROOT = "shogun";
const REGISTRY_NAMESPACE = "tunecamp-community";
const REGISTRY_VERSION = "1.0";

export interface SiteInfo {
    url: string;
    title: string;
    description?: string;
    artistName?: string;
    coverImage?: string;
}

export interface GunDBService {
    init(): Promise<boolean>;
    registerSite(siteInfo: SiteInfo): Promise<boolean>;
    registerTracks(siteInfo: SiteInfo, album: Album, tracks: Track[]): Promise<boolean>;
    unregisterTracks(siteInfo: SiteInfo, album: Album): Promise<boolean>;
    // Download stats
    getDownloadCount(releaseSlug: string): Promise<number>;
    incrementDownloadCount(releaseSlug: string): Promise<number>;
    getTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number>;
    incrementTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number>;
}

/**
 * Generate a unique site ID from title + artist (content-based)
 */
function generateSiteId(siteInfo: SiteInfo): string {
    const identifier = `${(siteInfo.title || "untitled").toLowerCase().trim()}::${(siteInfo.artistName || "unknown").toLowerCase().trim()}`;

    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
        const char = identifier.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

/**
 * Generate a slug for track identification
 */
function generateTrackSlug(albumTitle: string, trackTitle: string): string {
    return (albumTitle + "-" + (trackTitle || "untitled"))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

export function createGunDBService(database: DatabaseService): GunDBService {
    let gun: any = null;
    let initialized = false;

    async function init(): Promise<boolean> {
        try {
            gun = Gun({
                peers: REGISTRY_PEERS,
                radisk: false, // Disable radisk for server
            });

            initialized = true;
            console.log("🌐 GunDB Community Registry initialized");
            return true;
        } catch (error) {
            console.error("Failed to initialize GunDB:", error);
            return false;
        }
    }

    async function registerSite(siteInfo: SiteInfo): Promise<boolean> {
        if (!initialized || !gun) {
            console.warn("GunDB not initialized");
            return false;
        }

        // Skip non-HTTPS URLs in production
        if (siteInfo.url && !siteInfo.url.startsWith("https://")) {
            console.log("📍 Skipping community registration (not HTTPS - local/dev mode)");
            return false;
        }

        const siteId = generateSiteId(siteInfo);
        const now = Date.now();

        const siteRecord = {
            id: siteId,
            url: siteInfo.url,
            title: siteInfo.title || "Untitled",
            description: siteInfo.description || "",
            artistName: siteInfo.artistName || "",
            coverImage: siteInfo.coverImage || "",
            registeredAt: now,
            lastSeen: now,
            version: REGISTRY_VERSION,
            type: "server", // Indicate this is a server instance
        };

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .get(siteId)
                .put(siteRecord, (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to register site:", ack.err);
                        resolve(false);
                    } else {
                        console.log("✅ Server registered in Tunecamp Community");
                        resolve(true);
                    }
                });

            // Timeout fallback
            setTimeout(() => resolve(true), 3000);
        });
    }

    async function registerTracks(
        siteInfo: SiteInfo,
        album: Album,
        tracks: Track[]
    ): Promise<boolean> {
        if (!initialized || !gun || !tracks || tracks.length === 0) {
            return false;
        }

        const siteId = generateSiteId(siteInfo);
        const baseUrl = siteInfo.url;
        const now = Date.now();

        const tracksRef = gun
            .get(REGISTRY_ROOT)
            .get(REGISTRY_NAMESPACE)
            .get("sites")
            .get(siteId)
            .get("tracks");

        // Get artist name
        const artistName = album.artist_name || siteInfo.artistName || "";

        // Register each track
        for (const track of tracks) {
            const trackSlug = generateTrackSlug(album.title, track.title);

            // Build streaming URL
            const audioUrl = `${baseUrl}/api/tracks/${track.id}/stream`;

            // Build cover URL
            const coverUrl = album.id ? `${baseUrl}/api/albums/${album.id}/cover` : "";

            const trackData = {
                title: track.title || "Untitled",
                audioUrl: audioUrl,
                duration: track.duration || 0,
                releaseTitle: album.title || "Unknown Release",
                artistName: artistName,
                coverUrl: coverUrl,
                siteUrl: baseUrl,
                addedAt: now,
            };

            tracksRef.get(trackSlug).put(trackData);
        }

        console.log(`🎵 Registered ${tracks.length} tracks from "${album.title}" to community`);
        return true;
    }

    async function unregisterTracks(
        siteInfo: SiteInfo,
        album: Album
    ): Promise<boolean> {
        if (!initialized || !gun) {
            return false;
        }

        const siteId = generateSiteId(siteInfo);
        const tracks = database.getTracks(album.id);

        const tracksRef = gun
            .get(REGISTRY_ROOT)
            .get(REGISTRY_NAMESPACE)
            .get("sites")
            .get(siteId)
            .get("tracks");

        // Remove each track
        for (const track of tracks) {
            const trackSlug = generateTrackSlug(album.title, track.title);
            tracksRef.get(trackSlug).put(null);
        }

        console.log(`🗑️ Unregistered tracks from "${album.title}" from community`);
        return true;
    }

    // Download Stats namespace
    const STATS_NAMESPACE = "tunecamp-stats";

    async function getDownloadCount(releaseSlug: string): Promise<number> {
        if (!initialized || !gun) return 0;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("downloads")
                .once((data: any) => {
                    resolve(data ? parseInt(data, 10) || 0 : 0);
                });

            // Timeout fallback
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementDownloadCount(releaseSlug: string): Promise<number> {
        if (!initialized || !gun) return 0;

        const currentCount = await getDownloadCount(releaseSlug);
        const newCount = currentCount + 1;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("downloads")
                .put(newCount, (ack: any) => {
                    if (ack.err) {
                        console.error("Error incrementing download count:", ack.err);
                        resolve(currentCount);
                    } else {
                        resolve(newCount);
                    }
                });

            // Timeout fallback
            setTimeout(() => resolve(newCount), 2000);
        });
    }

    async function getTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("tracks")
                .get(trackId)
                .get("downloads")
                .once((data: any) => {
                    resolve(data ? parseInt(data, 10) || 0 : 0);
                });

            // Timeout fallback
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;

        const currentCount = await getTrackDownloadCount(releaseSlug, trackId);
        const newCount = currentCount + 1;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("tracks")
                .get(trackId)
                .get("downloads")
                .put(newCount, (ack: any) => {
                    if (ack.err) {
                        console.error("Error incrementing track download count:", ack.err);
                        resolve(currentCount);
                    } else {
                        resolve(newCount);
                    }
                });

            // Timeout fallback
            setTimeout(() => resolve(newCount), 2000);
        });
    }

    return {
        init,
        registerSite,
        registerTracks,
        unregisterTracks,
        getDownloadCount,
        incrementDownloadCount,
        getTrackDownloadCount,
        incrementTrackDownloadCount,
    };
}
