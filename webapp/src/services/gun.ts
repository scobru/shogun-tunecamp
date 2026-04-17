import ZEN from 'zen';



// Remove redundant imports as ZEN includes everything needed
import { DEFAULT_GUN_PEERS } from '../../../src/common/gun-config';
import API from './api';
import type { UserPlaylist, UserPlaylistTrack, Track } from '../types';

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (!DEFAULT_GUN_PEERS.includes("ws://localhost:1970/zen")) {
        DEFAULT_GUN_PEERS.push("ws://localhost:1970/zen");
    }
}

const envPeers = (window as any).TUNECAMP_CONFIG?.gunPeers;
let PEERS = [...DEFAULT_GUN_PEERS];

if (envPeers && typeof envPeers === 'string' && envPeers.trim().length > 0) {
    // Robustly split and normalize peers (handle commas and/or whitespace)
    PEERS = envPeers
        .split(/[,\s]+/)
        .map(p => p.trim())
        .filter(p => p.length > 0 && (p.startsWith('ws://') || p.startsWith('wss://') || p.startsWith('http://') || p.startsWith('https://')));

    console.log(`📡 GunDB initialized with ${PEERS.length} custom peers from config`);
}

// Initialize Gun
const gun = new ZEN({
    peers: PEERS,
    localStorage: false,
    radisk: false,
    axe: false
});

/**
 * ZenUser: A compatibility shim for the legacy Gun.user() API.
 * Uses ZEN's stateless External Authenticator pattern under the hood.
 */
class ZenUser {
    private _gun: any;
    private _pair: any = null;
    public is: { pub?: string; alias?: string; epub?: string } | null = null;
    public _: any = { sea: null }; // Legacy internal state accessor

    constructor(gun: any) {
        this._gun = gun;
    }

    /**
     * Recall a previously saved session from localStorage.
     */
    async recall(_opt: any, cb?: (ack: any) => void) {
        try {
            const saved = localStorage.getItem('tunecamp_auth_pair');
            if (saved) {
                const pair = JSON.parse(saved);
                const alias = localStorage.getItem('tunecamp_auth_alias');
                this._setSession(pair, alias || '');
                if (cb) cb({ ok: 1 });
                return this;
            }
        } catch (e) {
            console.error("ZenUser recall failed:", e);
        }
        if (cb) cb({ err: 'No session' });
        return this;
    }

    /**
     * Create a new user identity.
     */
    async create(alias: string, pass: string, cb?: (ack: any) => void) {
        try {
            // HIGH SECURITY: Combine alias + pass as seed to ensure unique identity
            // even if two users choose the same password.
            const seed = alias + pass;
            const pair = await (ZEN as any).pair(null, { seed });
            
            // Register alias -> pub mapping
            await this._gun.get('~@' + alias).put({ '#': '~' + pair.pub }).then();
            
            // Set initial profile data
            await this._gun.get('~' + pair.pub).get('alias').put(alias, { authenticator: pair }).then();

            if (cb) cb({ ok: 1, pub: pair.pub });
            return pair;
        } catch (e: any) {
            if (cb) cb({ err: e.message || e });
            throw e;
        }
    }

    /**
     * Authenticate an existing user.
     */
    async auth(alias: any, pass?: string | ((ack: any) => void), cb?: (ack: any) => void, _opt?: any) {
        // Handle login-with-pair vs login-with-credentials
        if (typeof pass === 'function') {
            cb = pass;
            pass = undefined;
        }

        let pair = alias;
        let actualAlias = typeof alias === 'string' ? alias : '';

        try {
            if (pass !== undefined) {
                // Generate pair from combined username + password seed
                const seed = actualAlias + pass;
                pair = await (ZEN as any).pair(null, { seed });
            } else if (typeof alias === 'object' && alias.pub) {
                pair = alias;
            }

            this._setSession(pair, actualAlias);
            
            // Persist for recall
            localStorage.setItem('tunecamp_auth_pair', JSON.stringify(pair));
            localStorage.setItem('tunecamp_auth_alias', actualAlias);

            if (cb) cb({ ok: 1 });
            return this;
        } catch (e: any) {
            if (cb) cb({ err: e.message || e });
            throw e;
        }
    }

    /**
     * Logout and clear session.
     */
    leave() {
        this._pair = null;
        this.is = null;
        this._.sea = null;
        localStorage.removeItem('tunecamp_auth_pair');
        localStorage.removeItem('tunecamp_auth_alias');
    }

    /**
     * Get a chain starting from the user's namespace (~pub).
     * Automatically wraps the chain to inject the authenticator into .put() calls.
     */
    get(path: string) {
        if (!this.is || !this._pair) {
            // If not logged in, return a regular graph chain (read-only for user-space)
            return this._gun.get(path);
        }

        const userRoot = this._gun.get('~' + this.is.pub);
        const chain = userRoot.get(path);
        return this._wrapChain(chain);
    }

    private _setSession(pair: any, alias: string) {
        this._pair = pair;
        this._.sea = pair;
        this.is = {
            pub: pair.pub,
            epub: pair.epub,
            alias: alias
        };
    }

    /**
     * Overrides .put() on a chain to automatically include the authenticator.
     */
    private _wrapChain(chain: any) {
        const originalPut = chain.put.bind(chain);
        const originalGet = chain.get.bind(chain);
        const self = this;

        chain.put = (data: any, opt: any, cb: any) => {
            if (typeof opt === 'function') {
                cb = opt;
                opt = {};
            }
            opt = opt || {};
            // Inject authenticator
            opt.authenticator = self._pair;
            return originalPut(data, opt, cb);
        };

        // Recursively wrap children
        chain.get = (path: string) => {
            return self._wrapChain(originalGet(path));
        };

        return chain;
    }
}

// Initialize the shim
const user = new ZenUser(gun);

// Helper interface for Gun User Profile
export interface GunProfile {
    pub: string;
    alias: string;
    epub: string;
    profile?: {
        avatar?: string;
        bio?: string;
    };
}

export const GunAuth = {
    gun,
    user,

    // Initialize/Recall session
    init: async (): Promise<GunProfile | null> => {
        // Wait for ZEN WASM and crypto primitives to be ready
        await (ZEN as any).ready;

        // Fetch and add additional peers from settings
        try {
            const settings = await API.getSiteSettings();
            if (settings.gunPeers) {
                const settingPeers = settings.gunPeers.split(/[,\s]+/).map(p => p.trim()).filter(p => p.length > 0);
                if (settingPeers.length > 0) {
                    console.log(`🌐 Adding ${settingPeers.length} GunDB peers from site settings`);
                    gun.opt({ peers: settingPeers });
                }
            }
        } catch (e) {
            console.warn("Failed to fetch GunDB peers from settings:", e);
        }

        return new Promise((resolve) => {
            // Attempt to recall session
            user.recall({ localStorage: true }, (_ack: any) => {
                if (user.is) {
                    const profile = {
                        pub: user.is.pub as string,
                        alias: user.is.alias as string,
                        epub: (user.is as any).epub as string
                    };
                    // Sync with backend (fire and forget/non-blocking)
                    API.syncGunUser(profile.pub, profile.epub, profile.alias).catch(console.error);
                    resolve(profile);
                } else {
                    resolve(null);
                }
            });
        });
    },

    isLoggedIn: () => {
        return !!(user.is && user.is.pub);
    },

    getProfile: (): GunProfile | null => {
        if (!user.is) return null;
        return {
            pub: user.is.pub as string,
            alias: user.is.alias as string,
            epub: (user.is as any).epub as string
        };
    },

    register: (username: string, pass: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("GunDB Registration Timeout: Could not reach peers"));
            }, 20000);

            const connectedPeers = Object.keys((gun as any)._.opt.peers || {}).length;
            console.log(`📡 GunDB Register attempt. Connected peers: ${connectedPeers}`);

            user.create(username, pass, (ack: any) => {
                clearTimeout(timeout);
                if (ack.err) {
                    // "User already created!" means the GunDB identity exists (e.g. from a
                    // prior partial registration). Fall back to login so the caller can still
                    // generate a proof and complete the backend registration step.
                    if (typeof ack.err === 'string' && ack.err.toLowerCase().includes('already created')) {
                        console.warn(`⚠️ GunDB user already exists, falling back to login for ${username}`);
                        GunAuth.login(username, pass).then(() => resolve()).catch(reject);
                    } else {
                        reject(new Error(ack.err));
                    }
                } else {
                    // Auto login after successful creation
                    GunAuth.login(username, pass).then(() => resolve()).catch(reject);
                }
            });
        });
    },

    login: (username: string, pass: string): Promise<GunProfile> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("GunDB Login Timeout: Could not reach peers"));
            }, 20000);

            const connectedPeers = Object.keys((gun as any)._.opt.peers || {}).length;
            console.log(`📡 GunDB Login attempt. Connected peers: ${connectedPeers}`);

            user.auth(username, pass, (ack: any) => {
                clearTimeout(timeout);
                if (ack.err) {
                    reject(new Error(ack.err));
                } else {
                    const profile = {
                        pub: user.is!.pub as string,
                        alias: user.is!.alias as string,
                        epub: (user.is as any).epub as string
                    };
                    // Sync with backend
                    API.syncGunUser(profile.pub, profile.epub, profile.alias).catch(console.error);
                    resolve(profile);
                }
            });
        });
    },

    loginWithPair: (pair: any): Promise<GunProfile> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("GunDB Re-authentication Timeout: Could not reach peers"));
            }, 20000);

            const connectedPeers = Object.keys((gun as any)._.opt.peers || {}).length;
            console.log(`📡 GunDB Pair-Auth attempt. Connected peers: ${connectedPeers}`);

            user.auth(pair, (ack: any) => {
                clearTimeout(timeout);
                if (ack.err) {
                    reject(new Error(ack.err));
                } else {
                    const profile = {
                        pub: user.is!.pub as string,
                        alias: user.is!.alias as string,
                        epub: (user.is as any).epub as string
                    };
                    // Sync with backend
                    API.syncGunUser(profile.pub, profile.epub, profile.alias).catch(console.error);
                    resolve(profile);
                }
            });
        });
    },

    logout: () => {
        user.leave();
    },

    // Example crypto helpers (signing)
    sign: async (data: any) => {
        if (!user.is) throw new Error("Not logged in");
        // Use static ZEN methods directly
        return await (ZEN as any).sign(data, (user as any)._pair);
    },

    verify: async (data: any, pub: string) => {
        return await (ZEN as any).verify(data, pub);
    },

    /**
     * Update the user's alias/username
     */
    updateAlias: async (newAlias: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));
            user.get('alias').put(newAlias, (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else {
                    const profile = GunAuth.getProfile();
                    if (profile) {
                        API.syncGunUser(profile.pub, profile.epub, newAlias).catch(console.error);
                    }
                    resolve();
                }
            });
        });
    },

    /**
     * Subscribe to profile changes
     */
    subscribeProfile: (cb: (profile: any) => void): (() => void) => {
        if (!user.is) return () => { };
        const ref = user.get('profile').on((data: any) => {
            cb(data);
        });
        return () => {
            if (ref && (ref as any).off) (ref as any).off();
        };
    },

    /**
     * Subscribe to mutable alias changes
     */
    subscribeAlias: (cb: (alias: string) => void): (() => void) => {
        if (!user.is) return () => { };
        const ref = user.get('alias').on((data: any) => {
            if (typeof data === 'string') {
                cb(data);
            }
        });
        return () => {
            if (ref && (ref as any).off) (ref as any).off();
        };
    },

    /**
     * Update extra profile data (avatar, bio)
     */
    updateProfile: async (data: { avatar?: string; bio?: string }): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            // Validate data size for GunDB (avatars can be large)
            if (data.avatar && data.avatar.length > 1024 * 1024) {
                return reject(new Error('Avatar image is too large (max 1MB)'));
            }

            user.get('profile').put(data, (ack: any) => {
                if (ack.err) {
                    console.error("GunDB profile update error:", ack.err);
                    reject(new Error(ack.err));
                } else {
                    resolve();
                }
            });
        });
    }
};

// ============================================================
// GunDB Social — Likes/Favorites
// ============================================================

export const GunSocial = {
    /**
     * Toggle like status for a track
     */
    toggleLikeTrack: async (track: Track): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            const likeNode = user.get('likes').get(track.id);
            likeNode.once((data: any) => {
                if (data) {
                    // Already liked, so remove it
                    likeNode.put(null as any, (ack: any) => {
                        if (ack.err) reject(new Error(ack.err));
                        else resolve(false);
                    });
                } else {
                    // Not liked, add it
                    const likedTrackData = {
                        id: track.id,
                        title: track.title,
                        artistName: track.artistName || '',
                        albumName: track.albumName || '',
                        albumId: track.albumId || '',
                        duration: track.duration || 0,
                        likedAt: Date.now()
                    };
                    likeNode.put(likedTrackData, (ack: any) => {
                        if (ack.err) reject(new Error(ack.err));
                        else resolve(true);
                    });
                }
            });
        });
    },

    /**
     * Check if a track is liked
     */
    isLiked: (trackId: string): Promise<boolean> => {
        return new Promise((resolve) => {
            if (!user.is) return resolve(false);
            user.get('likes').get(trackId).once((data: any) => {
                resolve(!!data);
            });
        });
    },

    /**
     * Get all tracks liked by the user
     */
    getLikedTracks: (): Promise<any[]> => {
        return new Promise((resolve) => {
            if (!user.is) return resolve([]);
            const liked: any[] = [];
            user.get('likes').map().once((data: any, id: string) => {
                if (data && id) {
                    liked.push(data);
                }
            });
            setTimeout(() => {
                liked.sort((a, b) => b.likedAt - a.likedAt);
                resolve(liked);
            }, 1000);
        });
    }
};

// ============================================================
// GunDB Playlists Service — User playlists stored in GunDB
// ============================================================

const PLAYLISTS_NODE = 'tunecamp-playlists';

function generateId(): string {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const GunPlaylists = {

    /**
     * Create a new playlist
     */
    createPlaylist: (name: string, description?: string, isPublic: boolean = false, coverUrl?: string): Promise<UserPlaylist> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            const id = generateId();
            const now = Date.now();
            const playlist = {
                id,
                name,
                description: description || '',
                coverUrl: coverUrl || '',
                ownerPub: user.is.pub as string,
                ownerAlias: user.is.alias as string,
                isPublic,
                createdAt: now,
                updatedAt: now,
                tracksJson: '[]' // Store tracks as JSON string for GunDB compatibility
            };

            let resolved = false;
            const playlistNode = user.get(PLAYLISTS_NODE).get(id);
            playlistNode.put(playlist, (ack: any) => {
                if (resolved) return;
                if (ack.err) {
                    console.warn("GunDB createPlaylist ack error (ignoring):", ack.err);
                } else {
                    resolved = true;
                    if (isPublic) {
                        gun.get('tunecamp-public-playlists').get(id).put(playlistNode);
                    }
                    resolve({ ...playlist, tracks: [], trackCount: 0 });
                }
            });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (isPublic) {
                        gun.get('tunecamp-public-playlists').get(id).put(playlistNode);
                    }
                    resolve({ ...playlist, tracks: [], trackCount: 0 });
                }
            }, 3000);
        });
    },

    /**
     * Get all playlists for the current user
     */
    getMyPlaylists: (): Promise<UserPlaylist[]> => {
        return new Promise((resolve) => {
            if (!user.is) return resolve([]);

            const playlists: UserPlaylist[] = [];
            const seen = new Set<string>();

            user.get(PLAYLISTS_NODE).map().once((data: any, key: string) => {
                if (!data || !data.id || seen.has(key)) return;
                seen.add(key);

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore parse errors */ }

                playlists.push({
                    id: data.id,
                    name: data.name || 'Untitled',
                    description: data.description || '',
                    coverUrl: data.coverUrl || '',
                    ownerPub: data.ownerPub || '',
                    ownerAlias: data.ownerAlias || '',
                    isPublic: data.isPublic || false,
                    createdAt: data.createdAt || 0,
                    updatedAt: data.updatedAt || 0,
                    tracks,
                    trackCount: tracks.length
                });
            });

            // GunDB's .map().once() is async; wait a bit then resolve
            setTimeout(() => {
                playlists.sort((a, b) => b.updatedAt - a.updatedAt);
                resolve(playlists);
            }, 1500);
        });
    },

    /**
     * Get all public playlists from the community
     */
    getPublicPlaylists: (): Promise<UserPlaylist[]> => {
        return new Promise((resolve) => {
            const playlists: UserPlaylist[] = [];
            const seen = new Set<string>();

            gun.get('tunecamp-public-playlists').map().once((data: any, key: string) => {
                if (!data || !data.id || seen.has(key)) return;
                seen.add(key);

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore parse errors */ }

                playlists.push({
                    id: data.id,
                    name: data.name || 'Untitled',
                    description: data.description || '',
                    coverUrl: data.coverUrl || '',
                    ownerPub: data.ownerPub || '',
                    ownerAlias: data.ownerAlias || '',
                    isPublic: true,
                    createdAt: data.createdAt || 0,
                    updatedAt: data.updatedAt || 0,
                    tracks,
                    trackCount: tracks.length
                });
            });

            setTimeout(() => {
                playlists.sort((a, b) => b.updatedAt - a.updatedAt);
                resolve(playlists);
            }, 1500);
        });
    },

    /**
     * Get a single playlist by ID
     */
    getPlaylist: (id: string): Promise<UserPlaylist | null> => {
        return new Promise((resolve) => {
            let timeoutId: any;
            let bestData: any = null;
            let resolved = false;
            const listeners: any[] = [];

            const processData = (data: any) => {
                if (resolved) return;
                resolved = true;

                if (timeoutId) clearTimeout(timeoutId);
                // Clean up listeners
                listeners.forEach(ev => {
                    if (ev && ev.off) ev.off();
                });

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore */ }

                resolve({
                    id: data.id,
                    name: data.name || 'Untitled',
                    description: data.description || '',
                    coverUrl: data.coverUrl || '',
                    ownerPub: data.ownerPub || '',
                    ownerAlias: data.ownerAlias || '',
                    isPublic: data.isPublic || false,
                    createdAt: data.createdAt || 0,
                    updatedAt: data.updatedAt || 0,
                    tracks,
                    trackCount: tracks.length
                });
            };

            const handleData = (data: any, ev: any) => {
                if (!data || !data.id || resolved) return;
                if (ev && !listeners.includes(ev)) listeners.push(ev);

                // Merge data fields since Gun might emit them separately
                bestData = { ...bestData, ...data };

                // Only resolve early if it feels complete enough (has name and tracksJson)
                if (bestData.name !== undefined && bestData.tracksJson !== undefined) {
                    processData(bestData);
                }
            };

            // 1) Try fetching from the global public edge index first
            gun.get('tunecamp-public-playlists').get(id).on((data: any, _key: any, _msg: any, ev: any) => {
                handleData(data, ev);
            });

            // 2) Fallback: if user is logged in, fetch from personal graph concurrently
            if (user.is) {
                user.get(PLAYLISTS_NODE).get(id).on((personalData: any, _key: any, _msg: any, ev: any) => {
                    handleData(personalData, ev);
                });
            }

            // Extended fallback timeout to prevent hanging UI (5 seconds to allow remote peer sync)
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    if (bestData && bestData.id) {
                        processData(bestData);
                    } else {
                        resolved = true;
                        // Clean up listeners
                        listeners.forEach(ev => {
                            if (ev && ev.off) ev.off();
                        });
                        resolve(null);
                    }
                }
            }, 5000);
        });
    },

    /**
     * Update playlist metadata
     */
    updatePlaylist: (id: string, updates: { name?: string; description?: string; isPublic?: boolean; coverUrl?: string }): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            const updateData: any = { updatedAt: Date.now() };
            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.description !== undefined) updateData.description = updates.description;
            if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;
            if (updates.coverUrl !== undefined) updateData.coverUrl = updates.coverUrl;

            let resolved = false;
            const playlistNode = user.get(PLAYLISTS_NODE).get(id);
            playlistNode.put(updateData, (ack: any) => {
                if (resolved) return;
                if (ack.err) {
                    console.warn("GunDB updatePlaylist ack error (ignoring):", ack.err);
                } else {
                    resolved = true;
                    if (updates.isPublic !== undefined) {
                        if (updates.isPublic) {
                            gun.get('tunecamp-public-playlists').get(id).put(playlistNode);
                        } else {
                            // To remove an edge in Gun, you set it to null
                            gun.get('tunecamp-public-playlists').get(id).put(null as any);
                        }
                    }
                    resolve();
                }
            });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (updates.isPublic !== undefined) {
                        if (updates.isPublic) {
                            gun.get('tunecamp-public-playlists').get(id).put(playlistNode);
                        } else {
                            gun.get('tunecamp-public-playlists').get(id).put(null as any);
                        }
                    }
                    resolve();
                }
            }, 3000);
        });
    },

    /**
     * Delete a playlist
     */
    deletePlaylist: (id: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            let resolved = false;
            user.get(PLAYLISTS_NODE).get(id).put(null, (ack: any) => {
                if (resolved) return;
                if (ack.err) {
                    console.warn("GunDB deletePlaylist ack error (ignoring):", ack.err);
                } else {
                    resolved = true;
                    resolve();
                }
            });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            }, 3000);
        });
    },

    /**
     * Add a track to a playlist
     */
    addTrackToPlaylist: (playlistId: string, track: UserPlaylistTrack): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            user.get(PLAYLISTS_NODE).get(playlistId).once((data: any) => {
                if (!data || !data.id) return reject(new Error('Playlist not found'));

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore */ }

                // Ensure the track has an ID
                if (!track.id) track.id = generateId();
                track.addedAt = Date.now();

                tracks.push(track);

                let resolved = false;
                user.get(PLAYLISTS_NODE).get(playlistId).put({
                    tracksJson: JSON.stringify(tracks),
                    updatedAt: Date.now()
                }, (ack: any) => {
                    if (resolved) return;
                    if (ack.err) {
                        console.warn("GunDB addTrack ack error (ignoring):", ack.err);
                    } else {
                        resolved = true;
                        resolve();
                    }
                });
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                }, 3000);
            });
        });
    },

    /**
     * Remove a track from a playlist
     */
    removeTrackFromPlaylist: (playlistId: string, trackId: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            user.get(PLAYLISTS_NODE).get(playlistId).once((data: any) => {
                if (!data || !data.id) return reject(new Error('Playlist not found'));

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore */ }

                tracks = tracks.filter(t => t.id !== trackId);

                let resolved = false;
                user.get(PLAYLISTS_NODE).get(playlistId).put({
                    tracksJson: JSON.stringify(tracks),
                    updatedAt: Date.now()
                }, (ack: any) => {
                    if (resolved) return;
                    if (ack.err) {
                        console.warn("GunDB removeTrack ack error (ignoring):", ack.err);
                    } else {
                        resolved = true;
                        resolve();
                    }
                });
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                }, 3000);
            });
        });
    }
};
