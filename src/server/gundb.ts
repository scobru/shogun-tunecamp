import Gun from "gun";
import "gun/lib/yson.js";
import "gun/sea.js";

import type { DatabaseService } from "./database.js";
import { normalizeUrl } from "../utils/audioUtils.js";
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
    // Instance signaling (discovery)
    registerSite(siteInfo: SiteInfo): Promise<boolean>;
    getCommunitySites(): Promise<any[]>;
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
        itemsTTL: 10 * 60 * 1000 // 10 minutes
    };

    let isRefreshingSites = false;
    let firstStart = true;

    function invalidateCache() {
        cache.sites = { data: [], timestamp: 0 };
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
                    // Generate a new one if it's completely broken
                    if (missing.includes('priv') || missing.includes('pub')) {
                         console.warn("⚠️  Server identity is unusable. Generating a new one for recovery...");
                         serverPair = await Gun.SEA.pair();
                         database.setSetting("gunPair", JSON.stringify(serverPair));
                    }
                }
            } else {
                console.error("🚨 [GunDB] NO Server Identity (serverPair) found before authentication!");
            }

            // Authenticate with a promise to wait for result
            const authPromise = new Promise<void>((resolve, reject) => {
                user.auth(serverPair, (ack: any) => {
                    if (ack.err) {
                        console.error("❌ Failed to authenticate GunDB user:", ack.err);
                        if (ack.err === '0 length key!') {
                            console.error("🚨 [GunDB] CONFIRMED: 0 length key error during authentication.");
                        }
                        reject(new Error(ack.err));
                    } else {
                        console.log(`🔐 GunDB Authenticated as pubKey: ${serverPair.pub.slice(0, 8)}...`);
                        resolve();
                    }
                });
                // Max timeout for auth
                setTimeout(() => resolve(), 10000);
            });

            try {
                await authPromise;
            } catch (e) {
                console.warn("⚠️ GunDB Authentication had errors, but continuing initialization.");
            }

            initialized = true;
            console.log("🌐 GunDB initialized (signaling + identity + stats)");

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

    // ─── Instance Signaling ─────────────────────────────────────────────────────

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
            type: "tunecamp-site",
            pub: serverPair.pub
        };

        const attemptRegistration = async (retryCount = 0): Promise<boolean> => {
            return new Promise(async (resolve) => {
                // 1. Sign data manually to avoid "Unverified data" errors in public graph
                const signedSite = await Gun.SEA.sign(siteRecord, serverPair);

                // 2. Write to Public Content Node (Identified by PubKey)
                const contentRef = gun
                    .get(REGISTRY_ROOT)
                    .get(REGISTRY_NAMESPACE)
                    .get("content")
                    .get(serverPair.pub)
                    .get("profile");

                contentRef.put(signedSite, async (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to write to public content node:", ack.err);
                        
                        const isJsonError = (typeof ack.err === 'string' && ack.err.includes("JSON error")) ||
                            (ack.err && ack.err.err === "JSON error!");

                        if (isJsonError && retryCount < 1) {
                            console.error("❌ GunDB Corruption detected! Attempting auto-recovery...");
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

                                const isJsonError = (typeof pubAck.err === 'string' && pubAck.err.includes("JSON error")) ||
                                    (pubAck.err && pubAck.err.err === "JSON error!");

                                if (isJsonError && retryCount < 1) {
                                    console.error("❌ GunDB Corruption detected in public directory! Attempting auto-recovery...");
                                    await clearRadata();
                                    console.log("🔄 Retrying registration after recovery...");
                                    const result = await attemptRegistration(retryCount + 1);
                                    resolve(result);
                                    return;
                                }

                                resolve(false);
                            } else {
                                console.log(`✅ Server registered in Tunecamp Community (Public-Verified Node) - Site ID: ${siteId}`);
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

    // ─── Community Site Discovery ────────────────────────────────────────────────

    async function getCommunitySites(): Promise<any[]> {
        if (!initialized || !gun) return [];

        const CACHE_KEY = "community_sites";
        const TTL = 60 * 60; // 1 hour

        // 1. Try SQLite cache first for instant response
        const cached = database.getGunCache(CACHE_KEY);
        if (cached) {
            try {
                const sites = JSON.parse(cached.value);
                // Trigger background refresh if we haven't checked recently in this session
                if (Date.now() - cache.sites.timestamp > cache.itemsTTL) {
                    refreshCommunitySitesInBackground();
                }
                return sites;
            } catch (e) {
                console.error("Failed to parse cached sites:", e);
            }
        }

        // 2. If no cache or first run, do the normal scan
        if (firstStart) {
            // Delay first discovery by 30s to allow server to stabilize
            console.log("⏱️  GunDB Community Discovery scheduled for 30s delay...");
            return new Promise(resolve => {
                setTimeout(async () => {
                    firstStart = false;
                    resolve(await refreshCommunitySitesInBackground());
                }, 30000);
            });
        }

        return refreshCommunitySitesInBackground();
    }

    async function refreshCommunitySitesInBackground(): Promise<any[]> {
        if (isRefreshingSites) return cache.sites.data;
        isRefreshingSites = true;

        const CACHE_KEY = "community_sites";
        const TTL = 60 * 60; // 1 hour

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

                    if (directoryData.pub) {
                        const registerPub = directoryData.pub;
                        
                        // Try NEW mechanism: Directed-Path Public Verified Node
                        gun.get(REGISTRY_ROOT)
                           .get(REGISTRY_NAMESPACE)
                           .get("content")
                           .get(registerPub)
                           .get("profile")
                           .once(async (signedData: any) => {
                               if (signedData) {
                                   const profileData = await Gun.SEA.verify(signedData, registerPub);
                                   if (profileData && profileData.type === "tunecamp-site") {
                                       sites.push({
                                           ...profileData,
                                           id: siteId,
                                           name: profileData.title || profileData.name || directoryData.title || "Untitled",
                                           lastSeen: profileData.lastSeen || directoryData.lastSeen || Date.now(),
                                           _secure: true,
                                           _verified: true
                                       });
                                       return;
                                   }
                               }

                               // FALLBACK: Old mechanism (User Graph)
                               gun.user(registerPub)
                                   .get('tunecamp')
                                   .get('profile')
                                   .once((profileData: any) => {
                                       if (profileData) {
                                           sites.push({
                                               ...profileData,
                                               id: siteId,
                                               name: profileData.title || profileData.name || directoryData.title || "Untitled",
                                               lastSeen: profileData.lastSeen || directoryData.lastSeen || Date.now(),
                                               _secure: true
                                           });
                                       } else {
                                           sites.push({
                                               id: siteId,
                                               ...directoryData,
                                               name: directoryData.title || directoryData.name || "Untitled",
                                               lastSeen: directoryData.lastSeen || Date.now(),
                                               _secure: false
                                           });
                                       }
                                   });
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
                isRefreshingSites = false;
                if (sites.length > 0) {
                    console.log(`⏱️ Discovery: Found ${sites.length} potential community sites. Updating SQLite cache.`);
                    database.setGunCache(CACHE_KEY, JSON.stringify(sites), "sites", TTL);
                    cache.sites = { data: sites, timestamp: Date.now() };

                    // Pre-emptive GC if exposed
                    if (global.gc) {
                        const before = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
                        global.gc();
                        const after = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
                        console.log(`[GunDB] Cleanup: Discovery complete. Memory: ${before}MB -> ${after}MB`);
                    }
                }
                resolve(sites);
            }, 10000); // Wait longer for a more complete picture in one go
        });
    }

    // ─── Download / Play / Like Stats ────────────────────────────────────────────

    const STATS_NAMESPACE = "tunecamp-stats";

    async function getDownloadCount(releaseSlug: string): Promise<number> {
        if (!initialized || !gun) return 0;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug).get("downloads")
                .once((data: any) => { resolve(data ? parseInt(data, 10) || 0 : 0); });
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementDownloadCount(releaseSlug: string): Promise<number> {
        if (!initialized || !gun) return 0;
        const currentCount = await getDownloadCount(releaseSlug);
        const newCount = currentCount + 1;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug).get("downloads")
                .put(newCount, (ack: any) => { resolve(ack.err ? currentCount : newCount); });
            setTimeout(() => resolve(newCount), 2000);
        });
    }

    async function getTrackPlayCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug)
                .get("tracks").get(trackId).get("plays").once((data: any) => {
                    resolve(data ? parseInt(data, 10) || 0 : 0);
                });
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementTrackPlayCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;
        const currentCount = await getTrackPlayCount(releaseSlug, trackId);
        const newCount = currentCount + 1;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug)
                .get("tracks").get(trackId).get("plays").put(newCount, (ack: any) => {
                    resolve(ack.err ? currentCount : newCount);
                });
            setTimeout(() => resolve(newCount), 2000);
        });
    }

    async function getTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug)
                .get("tracks").get(trackId).get("downloads").once((data: any) => {
                    resolve(data ? parseInt(data, 10) || 0 : 0);
                });
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;
        const currentCount = await getTrackDownloadCount(releaseSlug, trackId);
        const newCount = currentCount + 1;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(STATS_NAMESPACE).get("releases").get(releaseSlug)
                .get("tracks").get(trackId).get("downloads").put(newCount, (ack: any) => {
                    resolve(ack.err ? currentCount : newCount);
                });
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

    // ─── User Profiles ──────────────────────────────────────────────────────────

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
            gun.get(REGISTRY_ROOT).get(USERS_NAMESPACE).get("byPubKey").get(pubKey)
                .put(userRecord, (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to register user:", ack.err);
                        resolve(false);
                    }
                });

            gun.get(REGISTRY_ROOT).get(USERS_NAMESPACE).get("byUsername").get(username.toLowerCase())
                .put({ pubKey, username }, (ack: any) => {
                    if (ack.err) {
                        resolve(false);
                    } else {
                        console.log(`👤 User registered: ${username}`);
                        resolve(true);
                    }
                });

            setTimeout(() => resolve(true), 3000);
        });
    }

    async function getUser(pubKey: string): Promise<UserProfile | null> {
        if (!initialized || !gun) return null;
        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(USERS_NAMESPACE).get("byPubKey").get(pubKey)
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
            gun.get(REGISTRY_ROOT).get(USERS_NAMESPACE).get("byUsername").get(username.toLowerCase())
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

    // ─── Comments ────────────────────────────────────────────────────────────────

    const COMMENTS_NAMESPACE = "tunecamp-comments";

    async function addComment(
        trackId: number,
        data: { pubKey: string; username: string; text: string; signature?: string }
    ): Promise<Comment | null> {
        if (!initialized || !gun) return null;

        const commentId = `${trackId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

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
            gun.get(REGISTRY_ROOT).get(COMMENTS_NAMESPACE).get(`track-${trackId}`).get(commentId)
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

            gun.get(REGISTRY_ROOT).get(COMMENTS_NAMESPACE).get(`track-${trackId}`)
                .map().once((data: any, id: string) => {
                    if (data && data.text && id !== "_") {
                        const pubKey = data.pubKey || "";
                        let displayUsername = data.username || "Anonymous";

                        if (pubKey) {
                            const dbUser = database.getGunUser(pubKey);
                            if (dbUser && dbUser.alias && dbUser.alias.trim() !== '' && dbUser.alias !== pubKey) {
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

            setTimeout(() => {
                comments.sort((a, b) => b.createdAt - a.createdAt);
                resolve(comments);
            }, 2000);
        });
    }

    async function deleteComment(commentId: string, pubKey: string, signature?: string): Promise<boolean> {
        if (!initialized || !gun) return false;

        // Verify ownership proof if signature provided
        if (signature) {
            try {
                const isValid = await (Gun.SEA as any).verify(signature, pubKey);
                if (isValid !== commentId) {
                    console.warn(`❌ Invalid signature for comment deletion: ${commentId}`);
                    return false;
                }
            } catch (err) {
                console.error("Signature verification error:", err);
                return false;
            }
        }

        const parts = commentId.split("-");
        const trackId = parts[0];

        return new Promise((resolve) => {
            gun.get(REGISTRY_ROOT).get(COMMENTS_NAMESPACE).get(`track-${trackId}`).get(commentId)
                .once((data: any) => {
                    if (!data || data.pubKey !== pubKey) {
                        resolve(false);
                        return;
                    }

                    gun.get(REGISTRY_ROOT).get(COMMENTS_NAMESPACE).get(`track-${trackId}`).get(commentId)
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

    // ─── Network Cleanup (sites only) ────────────────────────────────────────────

    async function cleanupNetwork() {
        if (!initialized || !gun || !serverPair) return;

        try {
            const publicUrl = database.getSetting("publicUrl");
            if (!publicUrl) return;

            const siteName = database.getSetting("siteName") || "TuneCamp Server";
            const artistName = database.getSetting("artistName") || "";
            const siteInfo = { url: publicUrl, title: siteName, artistName };
            const currentSiteId = await getPersistentSiteId(siteInfo);

            console.log(`🧹 Starting network cleanup (Site ID: ${currentSiteId})...`);

            // Cleanup stale site registrations that belong to us but have a different ID
            gun.get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .map()
                .once((siteData: any, siteId: string) => {
                    if (!siteData || siteId === "_") return;
                    if (siteData.pub === serverPair.pub && siteId !== currentSiteId) {
                        console.log(`🧹 Removing stale site registration: ${siteId}`);
                        gun.get(REGISTRY_ROOT).get(REGISTRY_NAMESPACE).get("sites").get(siteId).put(null);
                    }
                });

        } catch (error) {
            console.error("Error in network cleanup:", error);
        } finally {
            invalidateCache();
        }
    }

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

                            const isReachable = await checkSiteReachability(siteData.url);
                            if (!isReachable) {
                                console.log(`🗑️ Site unreachable, removing: ${siteData.url} (${siteId})`);
                                sitesRef.get(siteId).put(null);
                                removed++;
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
            if (!(await isSafeUrl(url))) {
                console.warn(`⚠️ Blocked unsafe community URL: ${url}`);
                return false;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

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

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    async function getPersistentSiteId(siteInfo: SiteInfo): Promise<string> {
        const storedId = database.getSetting("siteId");
        if (storedId) return storedId;

        const identifier = `${(siteInfo.title || "untitled").toLowerCase().trim()}::${(siteInfo.artistName || "unknown").toLowerCase().trim()}::${Date.now()}`;
        let hash = 0;
        for (let i = 0; i < identifier.length; i++) {
            const char = identifier.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const newId = Math.abs(hash).toString(36) + Math.random().toString(36).substr(2, 5);

        database.setSetting("siteId", newId);
        console.log(`🆔 Generated new persistent Site ID: ${newId}`);
        return newId;
    }

    return {
        init,
        registerSite,
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
                const peers = gun._.opt.peers;
                return Object.keys(peers || {}).filter(k => peers[k].wire && peers[k].wire.readyState === 1).length;
            } catch (e) {
                return 0;
            }
        }
    };
}
