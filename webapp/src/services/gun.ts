import Gun from 'gun';
import 'gun/sea';
import "gun/lib/yson.js"
import 'gun/lib/radix';
import 'gun/lib/radisk';
import 'gun/lib/rindexed';
import API from './api';
import type { UserPlaylist, UserPlaylistTrack, Track } from '../types';


const defaultPeers = [
    "https://shogun-relay.scobrudot.dev/gun",
    "https://gun.defucc.me/gun",
    "https://gun.o8.is/gun",
    "https://relay.peer.ooo/gun"
];

if (import.meta.env.DEV || window.location.hostname === 'localhost') {
    defaultPeers.push("http://localhost:1970/gun");
}

const envPeers = (window as any).TUNECAMP_CONFIG?.gunPeers || import.meta.env.VITE_GUN_PEERS;
const PEERS = envPeers ? envPeers.split(',') : defaultPeers;

// Initialize Gun
const gun = Gun({
    peers: PEERS,
    localStorage: false,
    radisk: true,
    wire: true,
    axe: true
});

const user = gun.user();

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
        return new Promise((resolve) => {
            // Attempt to recall session
            user.recall({ sessionStorage: true }, (_ack: any) => {
                if (user.is) {
                    const profile = {
                        pub: user.is.pub as string,
                        alias: user.is.alias as string,
                        epub: (user.is as any).epub as string
                    };
                    // Sync with backend (fire and forget/non-blocking)
                    API.syncGunUser(profile.pub, profile.epub, profile.alias, (profile as any).profile?.avatar).catch(console.error);
                    resolve(profile);
                } else {
                    resolve(null);
                }
            });

            // Fallback immediate check
            if (user.is) {
                const profile = {
                    pub: user.is.pub as string,
                    alias: user.is.alias as string,
                    epub: (user.is as any).epub as string
                };
                API.syncGunUser(profile.pub, profile.epub, profile.alias).catch(console.error);
                resolve(profile);
            }
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
            user.create(username, pass, (ack: any) => {
                if (ack.err) {
                    reject(new Error(ack.err));
                } else {
                    // Auto login
                    GunAuth.login(username, pass).then(() => resolve()).catch(reject);
                }
            });
        });
    },

    login: (username: string, pass: string): Promise<GunProfile> => {
        return new Promise((resolve, reject) => {
            user.auth(username, pass, (ack: any) => {
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
            user.auth(pair, (ack: any) => {
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
        // @ts-ignore
        return await Gun.SEA.sign(data, user._.sea);
    },

    verify: async (data: any, pub: string) => {
        return await Gun.SEA.verify(data, pub);
    },

    /**
     * Update the user's alias/username
     */
    updateAlias: async (newAlias: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));
            user.get('alias').put(newAlias, (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
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
     * Get a single playlist by ID
     */
    getPlaylist: (id: string): Promise<UserPlaylist | null> => {
        return new Promise((resolve) => {
            let timeoutId: any;
            let bestData: any = null;
            let resolved = false;

            const processData = (data: any) => {
                if (resolved) return;

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore */ }

                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);

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

                // Merge data fields since Gun might emit them separately
                bestData = { ...bestData, ...data };

                // Only resolve if it feels complete enough (has tracks),
                // or if it was saved without tracks previously? 'tracksJson' should be set on create.
                if (bestData.name !== undefined && bestData.tracksJson !== undefined) {
                    if (ev && ev.off) ev.off(); // Prevent memory leaks once we have the data
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
                    resolved = true;
                    if (bestData && bestData.id) {
                        processData(bestData);
                    } else {
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
