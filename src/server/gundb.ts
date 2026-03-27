import Gun from "gun";
import "gun/lib/yson.js";
import "gun/sea.js";

import type { DatabaseService, Album, Track } from "./database.js";
import { generateTrackSlug, normalizeUrl } from "../utils/audioUtils.js";
import { isSafeUrl } from "../utils/networkUtils.js";
import fs from "fs-extra";
import path from "path";

// Public GunDB peers for the community registry
const REGISTRY_PEERS = [
    "https://shogun-relay.scobrudot.dev/gun",
    "https://gun.defucc.me/gun",
    "https://gun.o8.is/gun",
    "https://relay.peer.ooo/gun"
];

const REGISTRY_ROOT = "shogun";
const REGISTRY_NAMESPACE = "tunecamp-community";
const REGISTRY_VERSION = "2.0"; // Bumped version for secure nodes

export interface SiteInfo {
    url: string;
    title: string;
    description?: string;
    artistName?: string;
    coverImage?: string;
}

export interface UserProfile {
    pubKey: string;
    username: string;
    createdAt: number;
    avatar?: string;
}

export interface Comment {
    id: string;
    trackId: number;
    pubKey: string;
    username: string;
    text: string;
    signature?: string;
    createdAt: number;
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
    getTrackPlayCount(releaseSlug: string, trackId: string): Promise<number>;
    incrementTrackPlayCount(releaseSlug: string, trackId: string): Promise<number>;
    getTrackLikeCount(releaseSlug: string, trackId: string): Promise<number>;
    incrementTrackLikeCount(releaseSlug: string, trackId: string): Promise<number>;
    decrementTrackLikeCount(releaseSlug: string, trackId: string): Promise<number>;
    setTrackRating(releaseSlug: string, trackId: string, rating: number): Promise<void>;
    // Community exploration
    getCommunitySites(): Promise<any[]>;
    getCommunityTracks(): Promise<any[]>;
    // User profiles
    registerUser(pubKey: string, username: string): Promise<boolean>;
    getUser(pubKey: string): Promise<UserProfile | null>;
    getUserByUsername(username: string): Promise<UserProfile | null>;
    // Comments
    addComment(trackId: number, data: { pubKey: string; username: string; text: string; signature?: string }): Promise<Comment | null>;
    getComments(trackId: number): Promise<Comment[]>;
    deleteComment(commentId: string, pubKey: string, signature?: string): Promise<boolean>;
    // Key Management
    getIdentityKeyPair(): Promise<any>;
    setIdentityKeyPair(pair: any): Promise<boolean>;
    syncNetwork(): Promise<void>;
    cleanupGlobalNetwork(): Promise<void>;
    invalidateCache(): void;
    getPeerCount(): number;
}

export function createGunDBService(database: DatabaseService, server?: any, peers?: string[]): GunDBService {
    let gun: any = null;
    let initialized = false;
    let serverPair: any = null;

    // Use provided peers or fallback to defaults
    const activePeers = peers && peers.length > 0 ? peers : REGISTRY_PEERS;

    // Cache for community data to prevent CPU starvation on frequent requests
    const cache = {
        sites: { data: [] as any[], timestamp: 0 },
        tracks: { data: [] as any[], timestamp: 0 },
        itemsTTL: 10 * 60 * 1000 // 10 minutes
    };

    function invalidateCache() {
        cache.sites = { data: [], timestamp: 0 };
        cache.tracks = { data: [], timestamp: 0 };
        console.log("🧹 GunDB Community Cache invalidated.");
    }

    async function init(): Promise<boolean> {
        try {
            // Load peers from settings if not provided in constructor
            let initializationPeers = activePeers;
            const storedPeers = database.getSetting("gunPeers");
            if (!peers || peers.length === 0) {
                if (storedPeers) {
                    try {
                        initializationPeers = storedPeers.split(",").map(p => p.trim()).filter(p => p.length > 0);
                        console.log(`🌐 Using ${initializationPeers.length} GunDB peers from database settings`);
                    } catch (e) {
                        console.warn("⚠️ Invalid GunDB peers in settings, falling back to defaults");
                    }
                } else {
                    console.log(`🌐 Using ${initializationPeers.length} default GunDB peers`);
                }
            }

            gun = Gun({
                peers: initializationPeers,
                localStorage: false,
                radisk: true,
                file: "./radata",
                web: server
            });

            // Initialize User Auth (SEA)
            // Check if we have a stored pair
            const storedPairStr = database.getSetting("gunPair");
            if (storedPairStr) {
                try {
                    serverPair = JSON.parse(storedPairStr);
                } catch (e) {
                    console.error("Invalid stored GunDB pair, generating new one");
                }
            }

            if (!serverPair) {
                // Generate new pair
                console.log("🔐 Generating new GunDB Identity for this server...");
                serverPair = await Gun.SEA.pair();
                database.setSetting("gunPair", JSON.stringify(serverPair));
            }

            // Authenticate
            const user = gun.user();
            
            // DIAGNOSTIC: Validate serverPair before auth to prevent "0 length key!"
            if (serverPair) {
                const missing = ['pub', 'priv', 'epub', 'epriv'].filter(k => !serverPair[k] || serverPair[k].length === 0);
                if (missing.length > 0) {
                    console.error(`🚨 [GunDB] Server Identity is CORRUPTED! Empty keys: ${missing.join(', ')}. This will cause "0 length key!" errors.`);
                    // Potentially clear it if it's completely broken
                    if (missing.includes('priv') || missing.includes('pub')) {
                         console.warn("⚠️  Server identity is unusable. Recommend clearing 'gunPair' setting.");
                    }
                }
            } else {
                console.error("🚨 [GunDB] NO Server Identity (serverPair) found before authentication!");
            }

            user.auth(serverPair, (ack: any) => {
                if (ack.err) {
                    console.error("❌ Failed to authenticate GunDB user:", ack.err);
                    if (ack.err === '0 length key!') {
                        console.error("🚨 [GunDB] CONFIRMED: 0 length key error during authentication.");
                    }
                } else {
                    console.log(`🔐 GunDB Authenticated as pubKey: ${serverPair.pub.slice(0, 8)}...`);
                }
            });

            initialized = true;
            console.log("🌐 GunDB Community Registry initialized (v1.2 w/ WebSocket)");

            // Start background cleanup task (every 12 hours)
            setInterval(cleanupNetwork, 12 * 60 * 60 * 1000);

            return true;
        } catch (error) {
            console.error("Failed to initialize GunDB:", error);
            return false;
        }
    }

    async function getIdentityKeyPair(): Promise<any> {
        return serverPair;
    }

    async function setIdentityKeyPair(pair: any): Promise<boolean> {
        try {
            if (!pair || !pair.pub || !pair.priv || !pair.epub || !pair.epriv) {
                return false;
            }

            // Basic validation
            if (typeof pair.pub !== 'string' || typeof pair.priv !== 'string') return false;

            // Save
            serverPair = pair;
            database.setSetting("gunPair", JSON.stringify(serverPair));

            // Re-authenticate if running
            if (gun) {
                gun.user().leave();
                gun.user().auth(serverPair, (ack: any) => {
                    if (!ack.err) console.log(`🔐 Identity Imported & Re-Authenticated: ${serverPair.pub.slice(0, 8)}...`);
                });
            }
            return true;
        } catch (e) {
            console.error("Error setting identity pair:", e);
            return false;
        }
    }

    async function clearRadata() {
        const radataPath = path.join(process.cwd(), 'radata');
        try {
            console.warn(`⚠️ Attempting to clear GunDB radata directory at ${radataPath}...`);
            await fs.emptyDir(radataPath);
            console.log("✅ GunDB radata cleared successfully.");
        } catch (error) {
            console.error("❌ Failed to clear GunDB radata:", error);
        }
    }

    async function registerSite(siteInfo: SiteInfo): Promise<boolean> {
        if (!initialized || !gun || !serverPair) {
            console.warn("GunDB not initialized or no keys");
            return false;
        }

        // Skip non-HTTPS URLs in production
        if (siteInfo.url && !siteInfo.url.startsWith("https://")) {
            console.log("📍 Skipping community registration (not HTTPS - local/dev mode)");
            return false;
        }

        const siteId = await getPersistentSiteId(siteInfo);
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
            type: "server",
            pub: serverPair.pub // Public Key of the server
        };

        const attemptRegistration = async (retryCount = 0): Promise<boolean> => {
            return new Promise((resolve) => {
                const user = gun.user();

                // 1. Write to Private Node (User Graph) --> Signed by us
                if (!user.is) {
                    console.error("🚨 [GunDB] Cannot register site: User is NOT authenticated!");
                    resolve(false);
                    return;
                }

                user.get('tunecamp').get('profile').put(siteRecord, async (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to write to user graph:", ack.err);
                        if (ack.err === '0 length key!') {
                            console.error("🚨 [GunDB] 0 length key! error while writing to secure graph. Possible corruption.");
                        }

                        // Check for corruption (JSON error)
                        const isJsonError = (typeof ack.err === 'string' && ack.err.includes("JSON error")) ||
                            (ack.err && ack.err.err === "JSON error!");

                        if (isJsonError && retryCount < 1) {
                            console.error("❌ GunDB Corruption detected (JSON error)! Attempting auto-recovery...");
                            await clearRadata();
                            console.log("🔄 Retrying registration after recovery...");
                            const result = await attemptRegistration(retryCount + 1);
                            resolve(result);
                            return;
                        }

                        resolve(false);
                        return;
                    }

                    // 2. Write Reference to Public Directory
                    console.log(`📝 Registering public reference for Site ID: ${siteId} with PubKey: ${serverPair.pub.slice(0, 8)}...`);
                    gun
                        .get(REGISTRY_ROOT)
                        .get(REGISTRY_NAMESPACE)
                        .get("sites")
                        .get(siteId)
                        .put({
                            id: siteId,
                            pub: serverPair.pub,
                            lastSeen: now,
                            url: siteInfo.url,
                            title: siteInfo.title,
                            artistName: siteInfo.artistName
                        }, async (pubAck: any) => {
                            if (pubAck.err) {
                                console.warn("Failed to register site in directory:", pubAck.err);

                                // Check for corruption (JSON error)
                                const isJsonError = (typeof pubAck.err === 'string' && pubAck.err.includes("JSON error")) ||
                                    (pubAck.err && pubAck.err.err === "JSON error!");

                                if (isJsonError && retryCount < 1) {
                                    console.error("❌ GunDB Corruption detected in public directory (JSON error)! Attempting auto-recovery...");
                                    await clearRadata();
                                    console.log("🔄 Retrying registration after recovery...");
                                    const result = await attemptRegistration(retryCount + 1);
                                    resolve(result);
                                    return;
                                }

                                resolve(false);
                            } else {
                                console.log(`✅ Server registered in Tunecamp Community (Secure Mode) - Site ID: ${siteId}`);
                                invalidateCache();
                                resolve(true);
                            }
                        });
                });

                // Timeout fallback
                setTimeout(() => resolve(true), 5000);
            });
        };

        return attemptRegistration();
    }

    async function registerTracks(
        siteInfo: SiteInfo,
        album: Album,
        tracks: Track[]
    ): Promise<boolean> {
        if (!initialized || !gun || !tracks || tracks.length === 0 || !serverPair) {
            return false;
        }

        const siteId = await getPersistentSiteId(siteInfo);
        const baseUrl = siteInfo.url;
        const now = Date.now();

        // Write to User Graph -> tunecamp -> tracks
        const tracksRef = gun.user().get('tunecamp').get('tracks');
        const artistName = album.artist_name || siteInfo.artistName || "";

        const attemptRegisterTracks = async (retryCount = 0): Promise<boolean> => {
            const user = gun.user();
            if (!user.is) {
                console.error("🚨 [GunDB] Cannot register tracks: User is NOT authenticated!");
                return false;
            }

            const promises = tracks.map(track => {
                const trackSlug = generateTrackSlug(album.title, track.title);
                const cleanBaseUrl = normalizeUrl(baseUrl);
                const audioUrl = `${cleanBaseUrl}/api/tracks/${track.id}/stream`;
                const coverUrl = album.id ? `${cleanBaseUrl}/api/albums/${album.id}/cover` : "";

                const trackData = {
                    slug: trackSlug,
                    title: track.title || "Untitled",
                    audioUrl: audioUrl,
                    duration: track.duration || 0,
                    releaseTitle: album.title || "Unknown Release",
                    artistName: artistName,
                    coverUrl: coverUrl,
                    siteUrl: cleanBaseUrl,
                    addedAt: now,
                    pub: serverPair.pub
                };

                return new Promise<string | null>((resolve) => {
                    let resolved = false;
                    tracksRef.get(trackSlug).put(trackData, (ack: any) => {
                        if (resolved) return;
                        resolved = true;
                        if (ack.err) resolve(ack.err);
                        else resolve(null);
                    });

                    // Fallback resolve if no ack
                    setTimeout(() => {
                        if (resolved) return;
                        resolved = true;
                        resolve(null);
                    }, 5000);
                });
            });

            // Wait for all puts (or errors)
            const results = await Promise.all(promises);
            const error = results.find(e => {
                if (!e) return false;
                if (typeof e === 'string' && e.includes("JSON error")) return true;
                if (typeof e === 'object' && (e as any).err === "JSON error!") return true;
                return false;
            });

            if (error && retryCount < 1) {
                console.error("❌ GunDB Corruption detected in registerTracks (JSON error)! Attempting auto-recovery...");
                await clearRadata();
                console.log("🔄 Retrying track registration after recovery...");
                return attemptRegisterTracks(retryCount + 1);
            }

            if (error) {
                console.warn("Some tracks failed to register:", error);
                // But we don't return false because some might have succeeded?
                // Actually if one fails with JSON error, likely all fail or the file is bad.
                // If we retry, we hope it works. If it still fails, we give up.
            }

            console.log(`🎵 Registered ${tracks.length} tracks from "${album.title}" to secure graph`);
            invalidateCache();
            return true;
        };

        return attemptRegisterTracks();
    }

    async function unregisterTracks(
        siteInfo: SiteInfo,
        album: Album
    ): Promise<boolean> {
        if (!initialized || !gun || !serverPair) {
            return false;
        }

        const tracks = database.getTracks(album.id);
        const tracksRef = gun.user().get('tunecamp').get('tracks');

        // Remove each track
        for (const track of tracks) {
            const trackSlug = generateTrackSlug(album.title, track.title);
            tracksRef.get(trackSlug).put(null);
        }

        console.log(`🗑️ Unregistered tracks from "${album.title}" from secure graph`);
        invalidateCache();
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

    async function getTrackPlayCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("tracks")
                .get(trackId)
                .get("plays")
                .once((data: any) => {
                    resolve(data ? parseInt(data, 10) || 0 : 0);
                });

            // Timeout fallback
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementTrackPlayCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;

        const currentCount = await getTrackPlayCount(releaseSlug, trackId);
        const newCount = currentCount + 1;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("tracks")
                .get(trackId)
                .get("plays")
                .put(newCount, (ack: any) => {
                    if (ack.err) {
                        console.error("Error incrementing track play count:", ack.err);
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

    async function getTrackLikeCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug)
                .get("tracks").get(trackId).get("likes").once((data: any) => {
                    resolve(data ? parseInt(data, 10) || 0 : 0);
                });
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementTrackLikeCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;
        const currentCount = await getTrackLikeCount(releaseSlug, trackId);
        const newCount = currentCount + 1;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug)
                .get("tracks").get(trackId).get("likes").put(newCount, (ack: any) => {
                    resolve(ack.err ? currentCount : newCount);
                });
            setTimeout(() => resolve(newCount), 2000);
        });
    }

    async function decrementTrackLikeCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;
        const currentCount = await getTrackLikeCount(releaseSlug, trackId);
        const newCount = Math.max(0, currentCount - 1);
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug)
                .get("tracks").get(trackId).get("likes").put(newCount, (ack: any) => {
                    resolve(ack.err ? currentCount : newCount);
                });
            setTimeout(() => resolve(newCount), 2000);
        });
    }

    async function setTrackRating(releaseSlug: string, trackId: string, rating: number): Promise<void> {
        if (!initialized || !gun || !serverPair) return;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("ratings").get(serverPair.pub)
                .get("releases").get(releaseSlug).get("tracks").get(trackId).put(rating, (ack: any) => {
                    if (ack.err) console.error("Error setting track rating:", ack.err);
                    resolve();
                });
            setTimeout(() => resolve(), 2000);
        });
    }

    async function getCommunitySites(): Promise<any[]> {
        if (!initialized || !gun) return [];

        // Check cache
        const now = Date.now();
        if (cache.sites.data.length > 0 && (now - cache.sites.timestamp < cache.itemsTTL)) {
            return cache.sites.data;
        }

        return new Promise((resolve) => {
            const sites: any[] = [];
            const processedIds = new Set();

            // Read from Public Directory
            gun
                .get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .map()
                .once((directoryData: any, siteId: string) => {
                    if (!directoryData || siteId === "_") return;
                    if (processedIds.has(siteId)) return;
                    processedIds.add(siteId);

                    // Check if secure mode (has pub key)
                    if (directoryData.pub) {
                        // Read authoritative data from User Graph
                        gun.user(directoryData.pub)
                            .get('tunecamp')
                            .get('profile')
                            .once((profileData: any) => {
                                if (profileData) {
                                    sites.push({
                                        ...profileData,
                                        id: siteId,
                                        name: profileData.title || profileData.name || directoryData.title || "Untitled",
                                        // Ensure lastSeen is always present
                                        lastSeen: profileData.lastSeen || directoryData.lastSeen || Date.now(),
                                        _secure: true
                                    });
                                } else {
                                    // Fallback to directory data if user graph not reachable
                                    sites.push({
                                        id: siteId,
                                        ...directoryData,
                                        name: directoryData.title || directoryData.name || "Untitled",
                                        lastSeen: directoryData.lastSeen || Date.now(),
                                        _secure: false
                                    });
                                }
                            });
                    } else {
                        // Legacy mode
                        sites.push({
                            id: siteId,
                            ...directoryData,
                            name: directoryData.title || directoryData.name || "Untitled",
                            lastSeen: directoryData.lastSeen || Date.now()
                        });
                    }
                });

            // Wait for data to collect
            setTimeout(() => {
                console.log(`⏱️ Discovery: Found ${sites.length} potential community sites`);
                // Update Cache
                cache.sites = { data: sites, timestamp: Date.now() };
                resolve(sites);
            }, 3000); // Reduced from 6000
        });
    }

    async function getCommunityTracks(): Promise<any[]> {
        if (!initialized || !gun) return [];

        // Check cache
        const now = Date.now();
        if (cache.tracks.data.length > 0 && (now - cache.tracks.timestamp < cache.itemsTTL)) {
            return cache.tracks.data;
        }

        return new Promise((resolve) => {
            const tracks: any[] = [];

            // 1. Get sites
            console.log("🔍 Scanning community sites...");
            try {
                const debugPair = serverPair ? "PRESENT" : "MISSING";
                const debugPub = serverPair ? serverPair.pub : "N/A";
                console.log(`[DEBUG] serverPair: ${debugPair}, pub: ${debugPub}`);
            } catch (e) { console.log("[DEBUG] Error logging serverPair", e); }

            // ALWAYS scan our own secure graph explicitly (bypass directory lag)
            if (serverPair && serverPair.pub) {
                console.log(`🔐 Reading OWN secure graph (${serverPair.pub.slice(0, 8)}...)`);
                gun.user(serverPair.pub)
                    .get('tunecamp')
                    .get('tracks')
                    .map()
                    .once((trackData: any, slug: string) => {
                        if (trackData && trackData.audioUrl && slug !== "_") {
                            tracks.push({
                                siteId: 'local',
                                siteUrl: '/', // Self
                                track: {
                                    ...trackData,
                                    id: slug,
                                    artistId: "local",
                                    artistName: trackData.artistName || "Me",
                                    albumId: trackData.releaseTitle || "local",
                                    playCount: 0,
                                    coverUrl: trackData.coverUrl || "",
                                    streamUrl: trackData.audioUrl || "" // Explicitly set streamUrl
                                },
                                _secure: true,
                                _isSelf: true
                            });
                        }
                    });
            }

            gun.get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .map()
                .once((siteData: any, siteId: string) => {
                    if (!siteData || siteId === "_") return; // Ignore meta

                    console.log(`🔎 Found site: ${siteId} (Pub: ${siteData.pub ? 'Yes' : 'No'})`);

                    // Secure Mode (Trusted by User Graph)
                    if (siteData.pub) {
                        console.log(`🔐 Reading secure graph for ${siteId} (${siteData.pub.slice(0, 8)}...)`);
                        gun.user(siteData.pub)
                            .get('tunecamp')
                            .get('tracks')
                            .map()
                            .once((trackData: any, slug: string) => {
                                if (trackData && trackData.audioUrl && slug !== "_") {
                                    // Map to NetworkTrack structure
                                    tracks.push({
                                        siteId: siteId,
                                        siteUrl: siteData.url,
                                        track: {
                                            id: slug,
                                            title: trackData.title || "Untitled",
                                            artistId: "remote",
                                            artistName: trackData.artistName || siteData.artistName || "Unknown Artist",
                                            albumId: trackData.releaseTitle || "remote",
                                            albumName: trackData.releaseTitle || "Remote Album",
                                            duration: trackData.duration || 0,
                                            path: trackData.audioUrl || "",
                                            filename: slug,
                                            playCount: 0,
                                            coverUrl: trackData.coverUrl || siteData.coverImage || "",
                                            coverImage: trackData.coverUrl || siteData.coverImage || "",
                                            streamUrl: trackData.audioUrl || "" // Explicitly set streamUrl
                                        },
                                        _secure: true
                                    });
                                }
                            });
                    }
                    // 2nd source: Legacy Mode (Public Graph)
                    else {
                        gun.get(REGISTRY_ROOT)
                            .get(REGISTRY_NAMESPACE)
                            .get("sites")
                            .get(siteId)
                            .get("tracks")
                            .map()
                            .once((trackData: any, slug: string) => {
                                if (trackData && trackData.audioUrl && slug !== "_") {
                                    tracks.push({
                                        siteId: siteId,
                                        siteUrl: siteData.url,
                                        track: {
                                            id: slug,
                                            title: trackData.title || "Untitled",
                                            artistId: "remote",
                                            artistName: trackData.artistName || siteData.artistName || "Unknown Artist",
                                            albumId: trackData.releaseTitle || "remote",
                                            albumName: trackData.releaseTitle || "Remote Album",
                                            duration: trackData.duration || 0,
                                            path: trackData.audioUrl || "",
                                            filename: slug,
                                            playCount: 0,
                                            coverUrl: trackData.coverUrl || siteData.coverImage || "",
                                            coverImage: trackData.coverUrl || siteData.coverImage || "",
                                            streamUrl: trackData.audioUrl || "" // Explicitly set streamUrl
                                        },
                                        _secure: false
                                    });
                                }
                            });
                    }
                });

            // Wait for data to collect
            setTimeout(() => {
                console.log(`⏱️ Network scan finished. Raw tracks found: ${tracks.length}`);
                // Deduplicate by slug (prefer secure) and limit to 500 tracks
                const uniqueTracks = new Map();
                for (const item of tracks) {
                    const track = item.track;
                    const key = `${item.siteUrl}::${track.id}`;
                    if (!uniqueTracks.has(key) || item._secure) {
                        uniqueTracks.set(key, item);
                    }
                    if (uniqueTracks.size >= 500) break;
                }
                const result = Array.from(uniqueTracks.values());
                console.log(`🌐 Found ${result.length} unique community tracks`);

                // Update Cache
                cache.tracks = { data: result, timestamp: Date.now() };

                resolve(result);
            }, 5000); // Reduced from 8000
        });
    }

    // User profiles namespace
    const USERS_NAMESPACE = "tunecamp-users";

    async function registerUser(pubKey: string, username: string): Promise<boolean> {
        if (!initialized || !gun) return false;

        const now = Date.now();
        const userRecord: UserProfile = {
            pubKey,
            username,
            createdAt: now,
        };

        return new Promise((resolve) => {
            // Store user by pubKey
            gun
                .get(REGISTRY_ROOT)
                .get(USERS_NAMESPACE)
                .get("byPubKey")
                .get(pubKey)
                .put(userRecord, (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to register user:", ack.err);
                        resolve(false);
                    }
                });

            // Also store username -> pubKey mapping
            gun
                .get(REGISTRY_ROOT)
                .get(USERS_NAMESPACE)
                .get("byUsername")
                .get(username.toLowerCase())
                .put({ pubKey, username }, (ack: any) => {
                    if (ack.err) {
                        resolve(false);
                    } else {
                        console.log(`👤 User registered: ${username}`);
                        resolve(true);
                    }
                });

            // Timeout fallback
            setTimeout(() => resolve(true), 3000);
        });
    }

    async function getUser(pubKey: string): Promise<UserProfile | null> {
        if (!initialized || !gun) return null;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(USERS_NAMESPACE)
                .get("byPubKey")
                .get(pubKey)
                .once((data: any) => {
                    if (data && data.username) {
                        resolve({
                            pubKey: data.pubKey || pubKey,
                            username: data.username,
                            createdAt: data.createdAt || 0,
                            avatar: data.avatar,
                        });
                    } else {
                        resolve(null);
                    }
                });

            setTimeout(() => resolve(null), 3000);
        });
    }

    async function getUserByUsername(username: string): Promise<UserProfile | null> {
        if (!initialized || !gun) return null;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(USERS_NAMESPACE)
                .get("byUsername")
                .get(username.toLowerCase())
                .once(async (data: any) => {
                    if (data && data.pubKey) {
                        const user = await getUser(data.pubKey);
                        resolve(user);
                    } else {
                        resolve(null);
                    }
                });

            setTimeout(() => resolve(null), 3000);
        });
    }

    // Comments namespace
    const COMMENTS_NAMESPACE = "tunecamp-comments";

    async function addComment(
        trackId: number,
        data: { pubKey: string; username: string; text: string; signature?: string }
    ): Promise<Comment | null> {
        if (!initialized || !gun) return null;

        const commentId = `${trackId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        // GunDB doesn't accept undefined values, so use empty string for optional fields
        const comment: Comment = {
            id: commentId,
            trackId,
            pubKey: data.pubKey || "",
            username: data.username || "Anonymous",
            text: data.text,
            signature: data.signature || "",
            createdAt: now,
        };

        return new Promise((resolve) => {
            let handled = false;
            gun
                .get(REGISTRY_ROOT)
                .get(COMMENTS_NAMESPACE)
                .get(`track-${trackId}`)
                .get(commentId)
                .put(comment, (ack: any) => {
                    if (handled) return;
                    handled = true;
                    if (ack.err) {
                        console.warn("Failed to add comment:", ack.err);
                        resolve(null);
                    } else {
                        console.log(`💬 Comment added on track ${trackId}`);
                        resolve(comment);
                    }
                });

            setTimeout(() => {
                if (handled) return;
                handled = true;
                console.log(`💬 Comment added on track ${trackId} (Optimistic Resolve)`);
                resolve(comment);
            }, 5000);
        });
    }

    async function getComments(trackId: number): Promise<Comment[]> {
        if (!initialized || !gun) return [];

        return new Promise((resolve) => {
            const comments: Comment[] = [];

            gun
                .get(REGISTRY_ROOT)
                .get(COMMENTS_NAMESPACE)
                .get(`track-${trackId}`)
                .map()
                .once((data: any, id: string) => {
                    if (data && data.text && id !== "_") {
                        const pubKey = data.pubKey || "";
                        let displayUsername = data.username || "Anonymous";

                        if (pubKey) {
                            const dbUser = database.getGunUser(pubKey);
                            if (dbUser && dbUser.alias && dbUser.alias.trim() !== '') {
                                displayUsername = dbUser.alias;
                            }
                        }

                        comments.push({
                            id: data.id || id,
                            trackId: data.trackId || trackId,
                            pubKey: pubKey,
                            username: displayUsername,
                            text: data.text,
                            signature: data.signature,
                            createdAt: data.createdAt || 0,
                        });
                    }
                });

            // Wait for data to collect, then sort by time
            setTimeout(() => {
                comments.sort((a, b) => b.createdAt - a.createdAt);
                resolve(comments);
            }, 2000);
        });
    }

    async function deleteComment(commentId: string, pubKey: string, signature?: string): Promise<boolean> {
        if (!initialized || !gun) return false;

        // 1. Verify ownership proof if signature provided
        // We expect the signature to be of the commentId itself
        if (signature) {
            try {
                const isValid = await (Gun.SEA as any).verify(signature, pubKey);
                // The data signed should be the commentId
                if (isValid !== commentId) {
                    console.warn(`❌ Invalid signature for comment deletion: ${commentId}`);
                    return false;
                }
            } catch (err) {
                console.error("Signature verification error:", err);
                return false;
            }
        }

        // Extract trackId from commentId
        const parts = commentId.split("-");
        const trackId = parts[0];

        return new Promise((resolve) => {
            // Check ownership in the graph
            gun
                .get(REGISTRY_ROOT)
                .get(COMMENTS_NAMESPACE)
                .get(`track-${trackId}`)
                .get(commentId)
                .once((data: any) => {
                    if (!data || data.pubKey !== pubKey) {
                        resolve(false);
                        return;
                    }

                    // Delete by setting to null
                    gun
                        .get(REGISTRY_ROOT)
                        .get(COMMENTS_NAMESPACE)
                        .get(`track-${trackId}`)
                        .get(commentId)
                        .put(null, (ack: any) => {
                            if (ack.err) {
                                resolve(false);
                            } else {
                                console.log(`🗑️ Comment deleted from GunDB: ${commentId}`);
                                resolve(true);
                            }
                        });
                });

            setTimeout(() => resolve(false), 5000);
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
        getTrackPlayCount,
        incrementTrackPlayCount,
        getTrackLikeCount,
        incrementTrackLikeCount,
        decrementTrackLikeCount,
        setTrackRating,
        getCommunitySites,
        getCommunityTracks,
        // User profiles
        registerUser,
        getUser,
        getUserByUsername,
        // Comments
        addComment,
        getComments,
        deleteComment,
        // Key Management
        getIdentityKeyPair,
        setIdentityKeyPair,
        syncNetwork: cleanupNetwork,
        cleanupGlobalNetwork,
        invalidateCache,
        getPeerCount: () => {
            if (!gun) return 0;
            try {
                // Gun.chain.back(Infinity) usually gives the root, 
                // but getting peers is internal. 
                // We can access via gun._.opt.peers
                const peers = gun._.opt.peers;
                return Object.keys(peers || {}).filter(k => peers[k].wire && peers[k].wire.readyState === 1).length;
            } catch (e) {
                return 0;
            }
        }
    };

    /**
     * Get or create a persistent Site ID
     */
    async function getPersistentSiteId(siteInfo: SiteInfo): Promise<string> {
        // Try to get from settings
        const storedId = database.getSetting("siteId");
        if (storedId) return storedId;

        // Generate new one (compatible with old logic if possible, or just random)
        // usage of old logic for migration if title/artist match? 
        // Better to just generate a robust one now.
        const identifier = `${(siteInfo.title || "untitled").toLowerCase().trim()}::${(siteInfo.artistName || "unknown").toLowerCase().trim()}::${Date.now()}`;
        let hash = 0;
        for (let i = 0; i < identifier.length; i++) {
            const char = identifier.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const newId = Math.abs(hash).toString(36) + Math.random().toString(36).substr(2, 5);

        // Save it
        database.setSetting("siteId", newId);
        console.log(`🆔 Generated new persistent Site ID: ${newId}`);
        return newId;
    }

    /**
     * Background task to clean up invalid tracks from the network
     * This compares what we are advertising on GunDB with what is actually in our database (public)
     */
    async function cleanupNetwork() {
        if (!initialized || !gun || !serverPair) return;

        try {
            // Get current site info to determine our valid ID
            const publicUrl = database.getSetting("publicUrl");
            // If we don't have a public URL, we shouldn't be registered at all? 
            // For now, proceed only if we can determine our expected ID.
            if (!publicUrl) return;

            const siteName = database.getSetting("siteName") || "TuneCamp Server";
            const artistName = database.getSetting("artistName") || "";

            const siteInfo = { url: publicUrl, title: siteName, artistName };
            const currentSiteId = await getPersistentSiteId(siteInfo);

            console.log(`🧹 Starting secure network cleanup (Current Site ID: ${currentSiteId})...`);

            // --- 1. TCleanup TRACKS (Secure Graph) ---
            const publicAlbums = database.getAlbums(true);
            const publicReleases = database.getReleases(true);
            const validTrackSlugs = new Set<string>();

            for (const album of publicAlbums) {
                const tracks = database.getTracks(album.id);
                for (const track of tracks) {
                    validTrackSlugs.add(generateTrackSlug(album.title, track.title));
                }
            }

            for (const release of publicReleases) {
                const tracks = database.getTracksByReleaseId(release.id);
                for (const track of tracks) {
                    validTrackSlugs.add(generateTrackSlug(release.title, track.title));
                }
            }

            const tracksRef = gun.user().get('tunecamp').get('tracks');
            tracksRef.map().once((data: any, key: string) => {
                if (key === '_' || !data) return;
                // If this track key is NOT in our valid list, remove it
                if (!validTrackSlugs.has(key)) {
                    console.log(`🧹 Removing orphaned track from secure graph: ${key}`);
                    tracksRef.get(key).put(null);
                }
            });

            // --- 2. Cleanup INSTANCES (Public Directory) ---
            // Remove any site registration that claims to be us (signed by our pub key)
            // but is NOT our current Site ID.
            gun.get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .map()
                .once((siteData: any, siteId: string) => {
                    if (!siteData || siteId === "_") return;

                    // Check if this site was registered by US
                    if (siteData.pub === serverPair.pub) {
                        // If it's not our CURRENT ID, it's stale/duplicate
                        if (siteId !== currentSiteId) {
                            console.log(`🧹 Removing stale site registration: ${siteId} (is: ${siteData.url}, expected: ${publicUrl})`);
                            gun.get(REGISTRY_ROOT)
                                .get(REGISTRY_NAMESPACE)
                                .get("sites")
                                .get(siteId)
                                .put(null);
                        }
                    }
                });

        } catch (error) {
            console.error("Error in network cleanup:", error);
        } finally {
            invalidateCache();
        }
    }

    /**
     * Global network cleanup: checks all registered sites for reachability
     * and removes those that are offline.
     */
    async function cleanupGlobalNetwork() {
        if (!initialized || !gun) return;

        console.log("🧹 Starting GLOBAL network cleanup...");

        return new Promise<void>((resolve) => {
            let total = 0;
            let checked = 0;
            let removed = 0;

            const sitesRef = gun.get(REGISTRY_ROOT).get(REGISTRY_NAMESPACE).get("sites");

            sitesRef.once((sites: any) => {
                if (!sites) {
                    resolve();
                    return;
                }

                const siteIds = Object.keys(sites).filter(id => id !== "_" && id !== "undefined" && id !== "null");
                total = siteIds.length;

                if (total === 0) {
                    resolve();
                    return;
                }

                console.log(`🔍 Found ${total} sites to check.`);

                siteIds.forEach(siteId => {
                    sitesRef.get(siteId).once(async (siteData: any) => {
                        try {
                            if (!siteData || !siteData.url) {
                                checked++;
                                if (checked >= total) resolve();
                                return;
                            }

                            // 1. Basic reachability check
                            const isReachable = await checkSiteReachability(siteData.url);

                            if (!isReachable) {
                                console.log(`🗑️ Site unreachable, removing: ${siteData.url} (${siteId})`);
                                sitesRef.get(siteId).put(null);
                                removed++;
                            } else {
                                // 2. Site is reachable, verify it's the SAME instance
                                // We check if the remote siteId matches the one in GunDB
                                const remoteSettings = await getRemoteSiteSettings(siteData.url);
                                if (remoteSettings && remoteSettings.siteId) {
                                    if (remoteSettings.siteId !== siteId) {
                                        console.log(`🗑️ Site ID mismatch, removing stale entry: ${siteData.url} (Old: ${siteId}, New: ${remoteSettings.siteId})`);
                                        sitesRef.get(siteId).put(null);
                                        removed++;
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Error checking site ${siteId}:`, err);
                        } finally {
                            checked++;
                            if (checked >= total) {
                                console.log(`✅ Global cleanup complete. Checked ${checked} sites, removed ${removed}.`);
                                invalidateCache();
                                resolve();
                            }
                        }
                    });
                });
            });

            // Safety timeout
            setTimeout(() => {
                if (checked < total) {
                    console.log(`⚠️ Global cleanup partial timeout. Checked ${checked}/${total}.`);
                    invalidateCache();
                    resolve();
                }
            }, 60000);
        });
    }

    async function checkSiteReachability(url: string): Promise<boolean> {
        try {
            // Validate SSRF
            if (!(await isSafeUrl(url))) {
                console.warn(`⚠️ Blocked unsafe community URL: ${url}`);
                return false;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout for HEAD

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                headers: { 'User-Agent': 'TuneCamp-HealthCheck/2.0' }
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async function getRemoteSiteSettings(url: string): Promise<any> {
        try {
            const baseUrl = url.endsWith('/') ? url : `${url}/`;
            const settingsUrl = `${baseUrl}api/catalog/settings`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const response = await fetch(settingsUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'TuneCamp-HealthCheck/2.0'
                }
            });

            clearTimeout(timeoutId);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            return null;
        }
    }
}
