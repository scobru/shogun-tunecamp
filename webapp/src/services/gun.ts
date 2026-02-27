import Gun from 'gun';
import 'gun/sea';
import "gun/lib/yson.js"
import API from './api';
import type { UserPlaylist, UserPlaylistTrack } from '../types';


// Define Gun peers (should be configurable)
// Define Gun peers (should be configurable)
const PEERS = import.meta.env.VITE_GUN_PEERS?.split(',') || [
    "https://shogun-relay.scobrudot.dev/gun",
    "https://gun.defucc.me/gun",
    "https://gun.o8.is/gun",
    "https://relay.peer.ooo/gun",
    "http://localhost:1970/gun"
];

// Initialize Gun
const gun = Gun({
    peers: PEERS,
    localStorage: true, // Enable local persistence to survive peer drops
    radisk: false,
    wire: true,
    axe: true
});

const user = gun.user();

// Helper interface for Gun User Profile
export interface GunProfile {
    pub: string;
    alias: string;
    epub: string;
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
                    API.syncGunUser(profile.pub, profile.epub, profile.alias).catch(console.error);
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
    createPlaylist: (name: string, description?: string): Promise<UserPlaylist> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            const id = generateId();
            const now = Date.now();
            const playlist = {
                id,
                name,
                description: description || '',
                ownerPub: user.is.pub as string,
                ownerAlias: user.is.alias as string,
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
                    // Add edge to public index so unauthenticated users can resolve it
                    gun.get('tunecamp-public-playlists').get(id).put(playlistNode);
                    resolve({ ...playlist, tracks: [], trackCount: 0 });
                }
            });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    // Fallback edge creation
                    gun.get('tunecamp-public-playlists').get(id).put(playlistNode);
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
                    ownerPub: data.ownerPub || '',
                    ownerAlias: data.ownerAlias || '',
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
            const processData = (data: any) => {
                if (!data || !data.id) return resolve(null);
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
                    ownerPub: data.ownerPub || '',
                    ownerAlias: data.ownerAlias || '',
                    createdAt: data.createdAt || 0,
                    updatedAt: data.updatedAt || 0,
                    tracks,
                    trackCount: tracks.length
                });
            };

            // 1) Try fetching from the global public edge index first
            gun.get('tunecamp-public-playlists').get(id).once((data: any) => {
                if (data && data.id) {
                    return processData(data);
                }

                // 2) Fallback: if not found publicly but user is logged in, try fetching from personal graph
                if (user.is) {
                    user.get(PLAYLISTS_NODE).get(id).once((personalData: any) => {
                        processData(personalData);
                    });
                } else {
                    resolve(null);
                }
            });
        });
    },

    /**
     * Update playlist metadata
     */
    updatePlaylist: (id: string, updates: { name?: string; description?: string }): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            const updateData: any = { updatedAt: Date.now() };
            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.description !== undefined) updateData.description = updates.description;

            let resolved = false;
            user.get(PLAYLISTS_NODE).get(id).put(updateData, (ack: any) => {
                if (resolved) return;
                if (ack.err) {
                    console.warn("GunDB updatePlaylist ack error (ignoring):", ack.err);
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
