import axios from 'axios';
import type {
    AuthStatus, Track, Album, Artist, Playlist, SiteSettings, User,
    Release, Post, UnlockCode, NetworkSite, NetworkTrack, AdminStats
} from '../types';

const API_URL = '/api';

const api = axios.create({
    baseURL: API_URL,
});

// Interceptor to add token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('tunecamp_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Helper to handle response
const handleResponse = async <T>(request: Promise<{ data: T }>): Promise<T> => {
    try {
        const response = await request;
        return response.data;
    } catch (error: any) {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('tunecamp_token');
            // Trigger an event so the app knows to update auth state
            window.dispatchEvent(new Event('auth:unauthorized'));
        }
        throw new Error(error.response?.data?.message || error.response?.data || error.message);
    }
};

export const API = {
    getToken: () => localStorage.getItem('tunecamp_token'),
    setToken: (token: string | null) => {
        if (token) localStorage.setItem('tunecamp_token', token);
        else localStorage.removeItem('tunecamp_token');
    },

    // --- Auth ---
    getAuthStatus: () => handleResponse(api.get<AuthStatus>('/auth/status')),
    login: (username: string, password?: string) =>
        handleResponse(api.post<{ token: string, user?: User, username?: string, isRootAdmin?: boolean, artistId?: string, mustChangePassword?: boolean }>('/auth/login', { username, password })),
    register: (username: string, password: string) =>
        handleResponse(api.post<{ token: string, user: User }>('/auth/register', { username, password })),
    /** First-time admin setup when no admin exists yet */
    setup: (username: string, password: string) =>
        handleResponse(api.post<{ token: string, user: User }>('/auth/setup', { username, password })),
    changePassword: (currentPassword: string, newPassword: string) =>
        handleResponse(api.post('/auth/password', { currentPassword, newPassword })),
    logout: () => {
        API.setToken(null);
    },

    // --- Mastodon Auth ---
    mastodonInit: (instanceUrl: string, redirectUri: string) =>
        handleResponse(api.post<{ authUrl: string }>('/auth/mastodon/init', { instanceUrl, redirectUri })),
    mastodonCallback: (instanceUrl: string, code: string, redirectUri: string) =>
        handleResponse(api.post<{ success: boolean; pair: any; alias: string }>('/auth/mastodon/callback', { instanceUrl, code, redirectUri })),

    // --- Catalog & Search ---
    getCatalog: () => handleResponse(api.get<any>('/catalog')),
    getSiteSettings: () => handleResponse(api.get<SiteSettings>('/catalog/settings')),
    search: (query: string) => handleResponse(api.get<any>(`/catalog/search?q=${encodeURIComponent(query)}`)),
    searchMetadata: (query: string) => handleResponse(api.get<any>(`/metadata/search?q=${encodeURIComponent(query)}`)),

    // --- Library (Browsing) ---
    getAlbums: () => handleResponse(api.get<Album[]>('/albums')),
    getAlbum: (id: string | number) => handleResponse(api.get<Album>(`/albums/${id}`)),
    getAlbumCoverUrl: (id: string | number, timestamp?: number) => id ? `${API_URL}/albums/${id}/cover${timestamp ? `?v=${timestamp}` : ''}` : '',

    getArtists: () => handleResponse(api.get<Artist[]>('/artists')),
    getArtist: (idOrSlug: string | number) => handleResponse(api.get<Artist>(`/artists/${idOrSlug}`)),
    getArtistCoverUrl: (idOrSlug: string | number, timestamp?: number) => idOrSlug ? `${API_URL}/artists/${idOrSlug}/cover${timestamp ? `?v=${timestamp}` : ''}` : '',

    getTracks: () => handleResponse(api.get<Track[]>('/tracks')),
    getTrack: (id: string | number) => handleResponse(api.get<Track>(`/tracks/${id}`)),

    getPlaylists: () => handleResponse(api.get<Playlist[]>('/playlists')),
    getPlaylist: (id: string) => handleResponse(api.get<Playlist>(`/playlists/${id}`)),
    createPlaylist: (name: string, description?: string) =>
        handleResponse(api.post<Playlist>('/playlists', { name, description })),
    updatePlaylist: (id: string, data: Partial<Playlist>) => handleResponse(api.put<Playlist>(`/playlists/${id}`, data)),
    deletePlaylist: (id: string) => handleResponse(api.delete(`/playlists/${id}`)),
    addTrackToPlaylist: (playlistId: string, trackId: string) =>
        handleResponse(api.post(`/playlists/${playlistId}/tracks`, { trackId })),
    removeTrackFromPlaylist: (playlistId: string, trackId: string) =>
        handleResponse(api.delete(`/playlists/${playlistId}/tracks/${trackId}`)),

    // --- Streaming & Interactions ---
    getStreamUrl: (id: string, format?: string) => {
        let url = `${API_URL}/tracks/${id}/stream`;
        if (format) url += `?format=${format}`;
        return url;
    },
    getLyrics: (trackId: string) => handleResponse(api.get<{ lyrics: string | { text: string }[] }>(`/tracks/${trackId}/lyrics`)),
    recordPlay: (trackId: string | number) => {
        // Only record play for database tracks (numeric IDs)
        // prevents 404 for raw files in browser section
        if (typeof trackId === 'string' && isNaN(parseInt(trackId, 10))) {
            return Promise.resolve({ success: false, ignored: true });
        }
        return handleResponse(api.post(`/stats/library/play/${trackId}`));
    },

    // --- Stats ---
    getRecentPlays: (limit = 50) => handleResponse(api.get<any[]>(`/stats/library/recent?limit=${limit}`)),
    getTopTracks: (limit = 20, days = 30) => handleResponse(api.get<any[]>(`/stats/library/top-tracks?limit=${limit}&days=${days}`)),
    getTopArtists: (limit = 10, days = 30) => handleResponse(api.get<any[]>(`/stats/library/top-artists?limit=${limit}&days=${days}`)),
    getListeningStats: () => handleResponse(api.get<any>('/stats/library/overview')),

    // --- Community / ActivityPub ---
    getArtistPosts: (idOrSlug: string) => handleResponse(api.get<Post[]>(`/artists/${idOrSlug}/posts`)),
    getPostBySlug: (slug: string) => handleResponse(api.get<Post>(`/posts/${slug}`)),
    createPost: (artistId: number, content: string, visibility: string) => handleResponse(api.post('/admin/posts', { artistId, content, visibility })),
    updatePost: (id: number, content: string, visibility: string) => handleResponse(api.put(`/admin/posts/${id}`, { content, visibility })),
    deletePost: (id: number) => handleResponse(api.delete(`/admin/posts/${id}`)),

    // --- ActivityPub Notes ---
    getPublishedContent: (artistId: string | number) => handleResponse(api.get<any[]>(`/ap/published/${artistId}`)),
    deletePublishedContent: (noteId: string) => handleResponse(api.delete(`/ap/note?id=${encodeURIComponent(noteId)}`)),

    // --- Network ---
    getNetworkSites: () => handleResponse(api.get<NetworkSite[]>('/stats/network/sites')),
    getNetworkTracks: () => handleResponse(api.get<NetworkTrack[]>('/stats/network/tracks')),

    // --- Admin: Releases & Content ---
    getAdminReleases: () => handleResponse(api.get<Release[]>('/admin/releases')),
    createRelease: (data: Partial<Release>) => handleResponse(api.post<Release>('/admin/releases', data)),
    updateRelease: (id: string, data: Partial<Release>) => handleResponse(api.put<Release>(`/admin/releases/${id}`, data)),
    deleteRelease: (id: string, keepFiles = false) =>
        handleResponse(api.delete(`/admin/releases/${id}${keepFiles ? '?keepFiles=true' : ''}`)),

    toggleReleaseVisibility: (id: string, visibility: boolean | 'public' | 'private' | 'unlisted') =>
        handleResponse(api.put(`/admin/releases/${id}/visibility`, typeof visibility === 'boolean' ? { isPublic: visibility } : { visibility })),

    promoteToRelease: (id: string) => handleResponse(api.post(`/albums/${id}/promote`, {})),

    addTrackToRelease: (releaseId: string, trackId: string) =>
        handleResponse(api.post(`/admin/releases/${releaseId}/tracks/add`, { trackId })),

    // --- Comments ---
    getComments: (trackId: string) => handleResponse(api.get<any[]>(`/comments/track/${trackId}`)),
    postComment: (trackId: string, data: { text: string, pubKey: string, username: string, signature: string }) => handleResponse(api.post('/comments/track/' + trackId, data)),
    deleteComment: (commentId: string, data?: { pubKey: string, signature: string }) => handleResponse(api.delete(`/comments/${commentId}`, { data })),
    syncGunUser: (pub: string, epub: string, alias: string) => handleResponse(api.post('/users/sync', { pub, epub, alias })),

    // --- Admin: Artists ---
    createArtist: (data: Partial<Artist>) => handleResponse(api.post<Artist>('/artists', data)),
    updateArtist: (id: string, data: Partial<Artist>) => handleResponse(api.put<Artist>(`/artists/${id}`, data)),
    deleteArtist: (id: string) => handleResponse(api.delete(`/artists/${id}`)),

    // --- Admin: Tracks ---
    createTrack: (data: { title: string, albumId?: number, artistId?: number, trackNum?: number, url?: string, service?: string, externalArtwork?: string, duration?: number }) =>
        handleResponse(api.post<Track>('/tracks', data)),
    updateTrack: (id: string, data: Partial<Track>) => handleResponse(api.put<Track>(`/tracks/${id}`, data)),
    deleteTrack: (id: string, deleteFile = false) =>
        handleResponse(api.delete(`/tracks/${id}${deleteFile ? '?deleteFile=true' : ''}`)),

    // --- Admin: Uploads ---
    uploadTracks: (files: File[], options: { releaseSlug?: string, onProgress?: (percent: number) => void } = {}) => {
        const formData = new FormData();
        if (options.releaseSlug) {
            formData.append('releaseSlug', options.releaseSlug);
            formData.append('type', 'release');
        }
        files.forEach(file => formData.append('files', file));
        return handleResponse(api.post('/admin/upload/tracks', formData, {
            onUploadProgress: (progressEvent) => {
                if (options.onProgress && progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    options.onProgress(percentCompleted);
                }
            }
        }));
    },
    uploadCover: (file: File, releaseSlug?: string) => {
        const formData = new FormData();
        // Append file FIRST to help some parsers
        formData.append('file', file);
        if (releaseSlug) {
            formData.append('releaseSlug', releaseSlug);
            formData.append('type', 'release');
        }
        return handleResponse(api.post('/admin/upload/cover', formData));
    },
    uploadArtistAvatar: (artistId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('artistId', artistId);
        return handleResponse(api.post('/admin/upload/avatar', formData));
    },
    uploadBackgroundImage: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return handleResponse(api.post('/admin/upload/background', formData));
    },
    uploadSiteCover: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return handleResponse(api.post('/admin/upload/site-cover', formData));
    },

    // --- Admin: System ---
    rescan: () => handleResponse(api.post('/admin/scan')),
    cleanupNetwork: () => handleResponse(api.post('/admin/network/cleanup')),
    getAdminStats: () => handleResponse(api.get<AdminStats>('/admin/stats')),
    getBrowser: (path = '') => handleResponse(api.get<any>(`/browser?path=${encodeURIComponent(path)}`)),
    deleteBrowserPath: (path: string) => handleResponse(api.delete(`/browser?path=${encodeURIComponent(path)}`)),
    renameBrowserPath: (oldPath: string, newPath: string) => handleResponse(api.put("/browser", { oldPath, newPath })),
    syncActivityPub: () => handleResponse(api.post('/ap/sync')),
    uploadBackup: async (file: File, onProgress?: (percent: number) => void) => {
        // Chunked upload to avoid timeouts on large files/slow connections
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
        const MAX_RETRIES = 3;
        const uploadId = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        let uploadedBytes = 0;

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append("uploadId", uploadId);
            formData.append("chunkIndex", i.toString());
            formData.append("chunk", chunk);

            // Retry logic with exponential backoff
            let lastError: any = null;
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    await handleResponse(api.post('/admin/backup/chunk', formData, {
                        timeout: 300000 // 5m per chunk
                    }));
                    lastError = null;
                    break;
                } catch (e: any) {
                    lastError = e;
                    console.warn(`Chunk ${i} upload failed (attempt ${attempt + 1}/${MAX_RETRIES}):`, e.message);
                    if (attempt < MAX_RETRIES - 1) {
                        // Exponential backoff: 2s, 4s, 8s
                        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
                    }
                }
            }
            if (lastError) {
                throw new Error(`Chunk ${i + 1}/${totalChunks} failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
            }

            uploadedBytes += (end - start);
            if (onProgress) {
                const percent = Math.round((uploadedBytes / file.size) * 100);
                onProgress(percent);
            }
        }

        // Finalize — longer timeout since server may take a while to assemble chunks
        return handleResponse(api.post('/admin/backup/restore-chunked', { uploadId }, {
            timeout: 300000 // 5m for assembly + response
        }));
    },

    // --- Identity ---
    getIdentity: () => handleResponse(api.get<{ pub: string, epub: string, alias: string }>('/admin/system/identity')),
    importIdentity: (pair: any) => handleResponse(api.post('/admin/system/identity', pair)),

    // --- Admin: Users ---
    getUsers: () => handleResponse(api.get<User[]>('/admin/system/users')),
    getCurrentUser: () => handleResponse(api.get<User>('/admin/system/me')),
    createUser: (data: Partial<User> & { password: string }) => handleResponse(api.post<User>('/admin/system/users', data)),
    updateUser: (id: string, data: Partial<User>) => handleResponse(api.put<User>(`/admin/system/users/${id}`, data)),
    deleteUser: (id: string) => handleResponse(api.delete(`/admin/system/users/${id}`)),
    resetUserPassword: (id: string, password: string) => handleResponse(api.put(`/admin/system/users/${id}/password`, { password })),

    // --- Unlock Codes ---
    validateUnlockCode: (code: string) => handleResponse(api.post('/unlock/validate', { code })),
    redeemUnlockCode: (code: string) => handleResponse(api.post('/unlock/redeem', { code })),
    createUnlockCodes: (releaseId: string, count: number) => handleResponse(api.post<UnlockCode[]>('/unlock/admin/create', { releaseId, count })),
    getUnlockCodes: (releaseId?: string) => {
        const query = releaseId ? `?releaseId=${releaseId}` : '';
        return handleResponse(api.get<UnlockCode[]>(`/unlock/admin/list${query}`));
    },

    // --- Admin: Settings ---
    getAdminSettings: () => handleResponse(api.get<SiteSettings>('/admin/settings')),
    updateSettings: (data: Partial<SiteSettings>) => handleResponse(api.put<SiteSettings>('/admin/settings', data)),

    // --- Admin: Artist identity (ActivityPub keys per artist) ---
    getArtistIdentity: (artistId: string) =>
        handleResponse(api.get<{ publicKey: string, privateKey: string }>(`/admin/artists/${artistId}/identity`)),
};

export default API;
