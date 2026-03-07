import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

export interface OAuthClient {
    instance_url: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    created_at: string;
}

export interface OAuthLink {
    provider: string; // 'mastodon'
    subject: string;  // @user@instance.social
    gun_pub: string;
    gun_priv: string; // Encrypted SEA pair
    created_at: string;
}

export interface Artist {
    id: number;
    name: string;
    slug: string;
    bio: string | null;
    photo_path: string | null;
    links: string | null;  // JSON string of links
    post_params: string | null; // JSON string of ActivityPub/Mastodon config
    public_key: string | null;
    private_key: string | null;
    created_at: string;
}

export interface Follower {
    id: number;
    artist_id: number;
    actor_uri: string;
    inbox_uri: string;
    shared_inbox_uri: string | null;
    created_at: string;
}

export interface Album {
    id: number;
    title: string;
    slug: string;
    artist_id: number | null;
    artist_name?: string;
    artist_slug?: string;
    date: string | null;
    cover_path: string | null;
    genre: string | null;
    description: string | null;
    type: 'album' | 'single' | 'ep' | null; // Added
    year: number | null; // Added
    download: string | null; // 'free' | 'paid' | null
    external_links: string | null; // JSON string of ExternalLink[]
    is_public: boolean;
    visibility: 'public' | 'private' | 'unlisted'; // Added
    is_release: boolean; // true = published release, false = library album
    published_to_gundb: boolean; // specific toggle for GunDB
    published_to_ap: boolean; // specific toggle for ActivityPub
    published_at: string | null;
    created_at: string;
}

export interface Track {
    id: number;
    title: string;
    album_id: number | null;
    album_title?: string;
    artist_id: number | null;
    artist_name?: string;
    track_num: number | null;
    duration: number | null;
    file_path: string | null;
    format: string | null;
    bitrate: number | null;
    sample_rate: number | null;
    lossless_path: string | null;
    waveform: string | null; // JSON string of number[]
    url: string | null;
    service: string | null;
    external_artwork: string | null;
    created_at: string;
}

export interface Playlist {
    id: number;
    name: string;
    description: string | null;
    isPublic: boolean;
    coverPath: string | null;
    created_at: string;
}

export interface PlayHistoryEntry {
    id: number;
    track_id: number;
    track_title: string;
    artist_name: string | null;
    album_title: string | null;
    played_at: string;
}

export interface Post {
    id: number;
    artist_id: number;
    artist_name?: string;
    artist_slug?: string;
    artist_photo?: string;
    content: string;
    slug: string;
    visibility: 'public' | 'private' | 'unlisted';
    published_at?: string;
    created_at: string;
}

export interface ApNote {
    id: number;
    artist_id: number;
    note_id: string;  // Full AP Note URI
    note_type: 'post' | 'release';  // What type of content
    content_id: number;  // ID of post or album
    content_slug: string;  // Slug for display
    content_title: string;  // Title/preview
    published_at: string;
    deleted_at: string | null;
}

export interface TrackWithPlayCount extends Track {
    play_count: number;
}

export interface ArtistWithPlayCount extends Artist {
    play_count: number;
}

export interface ListeningStats {
    totalPlays: number;
    totalListeningTime: number; // in seconds
    uniqueTracks: number;
    playsToday: number;
    playsThisWeek: number;
    playsThisMonth: number;
}

export interface DatabaseService {
    db: DatabaseType;
    // Artists
    getArtists(): Artist[];
    getArtist(id: number): Artist | undefined;
    getArtistByName(name: string): Artist | undefined;
    getArtistBySlug(slug: string): Artist | undefined;
    createArtist(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any): number;
    updateArtist(id: number, bio?: string, photoPath?: string, links?: any, postParams?: any): void;
    updateArtistKeys(id: number, publicKey: string, privateKey: string): void;
    deleteArtist(id: number): void;
    // Followers
    addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string): void;
    removeFollower(artistId: number, actorUri: string): void;
    getFollowers(artistId: number): Follower[];
    getFollower(artistId: number, actorUri: string): Follower | undefined;
    // Albums
    getAlbums(publicOnly?: boolean): Album[];
    getReleases(publicOnly?: boolean): Album[]; // is_release=1
    getLibraryAlbums(): Album[]; // is_release=0
    getAlbum(id: number): Album | undefined;
    getAlbumBySlug(slug: string): Album | undefined;
    getAlbumByTitle(title: string, artistId?: number): Album | undefined;
    getAlbumsByArtist(artistId: number, publicOnly?: boolean): Album[];
    createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number;
    updateAlbumVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void;
    updateAlbumFederationSettings(id: number, publishedToGunDB: boolean, publishedToAP: boolean): void;
    updateAlbumArtist(id: number, artistId: number): void;
    updateAlbumTitle(id: number, title: string): void;
    updateAlbumCover(id: number, coverPath: string): void;
    updateAlbumDownload(id: number, download: string | null): void;
    updateAlbumLinks(id: number, links: string | null): void;
    promoteToRelease(id: number): void; // Mark library album as release
    deleteAlbum(id: number, keepTracks?: boolean): void;
    // Tracks
    getTracks(albumId?: number, publicOnly?: boolean): Track[];
    getTracksByAlbumIds(albumIds: number[]): Track[];
    getTracksByReleaseId(releaseId: number): Track[];
    getTrack(id: number): Track | undefined;
    getTrackByPath(filePath: string): Track | undefined;
    createTrack(track: Omit<Track, "id" | "created_at" | "album_title" | "artist_name">): number;
    updateTrackAlbum(id: number, albumId: number | null): void;
    updateTrackArtist(id: number, artistId: number | null): void;
    getTrackByMetadata(title: string, artistId: number | null, albumId: number | null): Track | undefined;
    updateTrackTitle(id: number, title: string): void;
    updateTrackPath(id: number, filePath: string, albumId: number | null): void;
    updateTrackDuration(id: number, duration: number): void;
    updateTrackWaveform(id: number, waveform: string): void;
    updateTrackLosslessPath(id: number, losslessPath: string | null): void;
    deleteTrack(id: number): void;
    addTrackToRelease(releaseId: number, trackId: number): void;
    removeTrackFromRelease(releaseId: number, trackId: number): void;
    updateReleaseTracks(releaseId: number, toAdd: number[], toRemove: number[]): void;
    getReleaseTrackIds(releaseId: number): number[];
    // Playlists
    getPlaylists(publicOnly?: boolean): Playlist[];
    getPlaylist(id: number): Playlist | undefined;
    createPlaylist(name: string, description?: string, isPublic?: boolean): number;
    updatePlaylistVisibility(id: number, isPublic: boolean): void;
    updatePlaylistCover(id: number, coverPath: string | null): void;
    deletePlaylist(id: number): void;
    getPlaylistTracks(playlistId: number): Track[];
    addTrackToPlaylist(playlistId: number, trackId: number): void;
    removeTrackFromPlaylist(playlistId: number, trackId: number): void;
    // Posts
    getPostsByArtist(artistId: number, publicOnly?: boolean): Post[];
    getPost(id: number): Post | undefined;
    getPostBySlug(slug: string): Post | undefined;
    createPost(artistId: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): number;
    updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): void;
    deletePost(id: number): void;
    // Stats
    getStats(): Promise<{ artists: number; albums: number; tracks: number; publicAlbums: number; totalUsers: number; storageUsed: number; networkSites: number; totalTracks: number }>;
    getPublicTracksCount(): number;
    // Play History
    recordPlay(trackId: number): void;
    getRecentPlays(limit?: number): PlayHistoryEntry[];
    getTopTracks(limit?: number, days?: number): TrackWithPlayCount[];
    getTopArtists(limit?: number, days?: number): ArtistWithPlayCount[];
    getListeningStats(): ListeningStats;
    // Search
    search(query: string, publicOnly?: boolean): { artists: Artist[]; albums: Album[]; tracks: Track[] };
    // Settings
    getSetting(key: string): string | undefined;
    setSetting(key: string, value: string): void;
    getAllSettings(): { [key: string]: string };

    // Unlock Codes
    createUnlockCode(code: string, releaseId?: number): void;
    validateUnlockCode(code: string): { valid: boolean; releaseId?: number; isUsed: boolean };
    redeemUnlockCode(code: string): void;
    listUnlockCodes(releaseId?: number): any[];

    // ActivityPub Notes
    createApNote(artistId: number, noteId: string, noteType: 'post' | 'release', contentId: number, contentSlug: string, contentTitle: string): number;
    getApNotes(artistId: number, includeDeleted?: boolean): ApNote[];
    getApNote(noteId: string): ApNote | undefined;
    markApNoteDeleted(noteId: string): void;
    deleteApNote(noteId: string): void;
    // Gun Users
    syncGunUser(pub: string, epub: string, alias: string): void;
    getGunUser(pub: string): { pub: string; epub: string; alias: string } | undefined;

    // OAuth
    getOAuthClient(instanceUrl: string): OAuthClient | undefined;
    saveOAuthClient(client: Omit<OAuthClient, "created_at">): void;

    getOAuthLink(provider: string, subject: string): OAuthLink | undefined;
    createOAuthLink(provider: string, subject: string, gunPub: string, gunPriv: string): void;
}

export function createDatabase(dbPath: string): DatabaseService {
    const db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");

    // Register custom Levenshtein function
    db.function("levenshtein", (a: string, b: string) => {
        if (!a) return b ? b.length : 0;
        if (!b) return a ? a.length : 0;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    });

    // Create tables
    db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      bio TEXT,
      photo_path TEXT,
      links TEXT,
      public_key TEXT,
      private_key TEXT,
