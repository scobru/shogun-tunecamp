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
    wallet_address: string | null;
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

export interface LikeEntry {
    id: number;
    remote_actor_fid: string;
    object_type: 'album' | 'track' | 'post';
    object_id: number;
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
    price: number | null; // Added
    currency: 'ETH' | 'USD'; // Added
    external_links: string | null; // JSON string of ExternalLink[]
    is_public: boolean;
    visibility: 'public' | 'private' | 'unlisted'; // Added
    is_release: boolean; // true = published release, false = library album
    published_to_gundb: boolean; // specific toggle for GunDB
    published_to_ap: boolean; // specific toggle for ActivityPub
    published_at: string | null;
    walletAddress?: string;
    created_at: string;
}

export interface Track {
    id: number;
    title: string;
    album_id: number | null;
    album_title?: string;
    album_download?: string;
    album_visibility?: string;
    artist_id: number | null;
    artist_name?: string;
    track_num: number | null;
    duration: number | null;
    file_path: string | null;
    format: string | null;
    bitrate: number | null;
    sample_rate: number | null;
    price: number | null; // Added
    currency: 'ETH' | 'USD'; // Added
    lossless_path: string | null;
    waveform: string | null; // JSON string of number[]
    url: string | null;
    service: string | null;
    external_artwork: string | null;
    lyrics?: string | null;
    created_at: string;
}


function mapAlbum(row: any): Album | undefined {
    if (!row) return undefined;
    return {
        ...row,
        currency: row.currency || 'ETH',
        is_public: !!row.is_public,
        is_release: !!row.is_release,
        published_to_gundb: !!row.published_to_gundb,
        published_to_ap: !!row.published_to_ap,
    } as Album;
}

function mapAlbums(rows: any[]): Album[] {
    return rows.map(mapAlbum) as Album[];
}

export interface Playlist {
    id: number;
    name: string;
    username: string;
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

export interface RemoteActor {
    id: number;
    uri: string;
    type: string;
    username: string | null;
    name: string | null;
    summary: string | null;
    icon_url: string | null;
    inbox_url: string | null;
    outbox_url: string | null;
    last_seen: string;
}

export interface RemoteContent {
    id: number;
    ap_id: string;
    actor_uri: string;
    type: string; // 'release' | 'post'
    title: string | null;
    content: string | null;
    url: string | null;
    cover_url: string | null;
    stream_url: string | null;
    artist_name: string | null;
    album_name: string | null;
    duration: number | null;
    published_at: string | null;
    received_at: string;
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
    createArtist(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string): number;
    updateArtist(id: number, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string): void;
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
    updateAlbumGenre(id: number, genre: string | null): void;
    updateAlbumDownload(id: number, download: string | null): void;
    updateAlbumPrice(id: number, price: number | null, currency?: 'ETH' | 'USD'): void;
    updateAlbumLinks(id: number, links: string | null): void;
    promoteToRelease(id: number): void; // Mark library album as release
    deleteAlbum(id: number, keepTracks?: boolean): void;
    // Tracks
    getTracks(albumId?: number, publicOnly?: boolean): Track[];
    getTracksByArtist(artistId: number, publicOnly?: boolean): Track[];
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
    updateTrackPrice(id: number, price: number | null, currency?: 'ETH' | 'USD'): void;
    updateTrackDuration(id: number, duration: number): void;
    updateTrackWaveform(id: number, waveform: string): void;
    updateTrackLosslessPath(id: number, losslessPath: string | null): void;
    updateTrackLyrics(id: number, lyrics: string | null): void;
    updateTrackPathsPrefix(oldPrefix: string, newPrefix: string): void;
    deleteTrack(id: number): void;
    addTrackToRelease(releaseId: number, trackId: number): void;
    removeTrackFromRelease(releaseId: number, trackId: number): void;
    updateReleaseTracks(releaseId: number, toAdd: number[], toRemove: number[]): void;
    getReleaseTrackIds(releaseId: number): number[];
    // Playlists
    getPlaylists(username?: string, publicOnly?: boolean): Playlist[];
    getPlaylist(id: number): Playlist | undefined;
    createPlaylist(name: string, username: string, description?: string, isPublic?: boolean): number;
    updatePlaylistVisibility(id: number, isPublic: boolean): void;
    updatePlaylistCover(id: number, coverPath: string | null): void;
    deletePlaylist(id: number): void;
    getPlaylistTracks(playlistId: number): Track[];
    isTrackInPublicPlaylist(trackId: number): boolean;
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
    getStats(artistId?: number): Promise<{ artists: number; albums: number; tracks: number; publicAlbums: number; totalUsers: number; storageUsed: number; networkSites: number; totalTracks: number; genresCount: number }>;
    getPublicTracksCount(): number;
    // Play History
    recordPlay(trackId: number, playedAt?: string): void;
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
    syncGunUser(pub: string, epub: string, alias: string, avatar?: string): void;
    getGunUser(pub: string): { pub: string; epub: string; alias: string } | undefined;

    // Remote Federation (ActivityPub)
    upsertRemoteActor(actor: Omit<RemoteActor, "id" | "last_seen">): void;
    getRemoteActor(uri: string): RemoteActor | undefined;
    getRemoteActors(): RemoteActor[];
    upsertRemoteContent(content: Omit<RemoteContent, "id" | "received_at">): void;
    getRemoteContent(apId: string): RemoteContent | undefined;
    getRemoteTracks(): RemoteContent[];
    getRemotePosts(): RemoteContent[];
    deleteRemoteContent(apId: string): void;

    // Likes
    addLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void;
    removeLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void;
    getLikesCount(objectType: 'album' | 'track' | 'post', objectId: number): number;
    hasLiked(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): boolean;

    // OAuth
    getOAuthClient(instanceUrl: string): OAuthClient | undefined;
    saveOAuthClient(client: Omit<OAuthClient, "created_at">): void;

    getOAuthLink(provider: string, subject: string): OAuthLink | undefined;
    createOAuthLink(provider: string, subject: string, gunPub: string, gunPriv: string): void;

    // Starred Items (Subsonic)
    starItem(username: string, itemType: string, itemId: string): void;
    unstarItem(username: string, itemType: string, itemId: string): void;
    getStarredItems(username: string, itemType?: string): { item_type: string; item_id: string; created_at: string }[];
    isStarred(username: string, itemType: string, itemId: string): boolean;

    // Play Queue (Subsonic)
    savePlayQueue(username: string, trackIds: string[], current: string | null, positionMs: number): void;
    getPlayQueue(username: string): { trackIds: string[], current: string | null, positionMs: number };

    // Ratings & Bookmarks
    setItemRating(username: string, itemType: string, itemId: string, rating: number): void;
    getItemRating(username: string, itemType: string, itemId: string): number;
    createBookmark(username: string, trackId: string, positionMs: number, comment?: string): void;
    getBookmarks(username: string): any[];
    deleteBookmark(username: string, trackId: string): void;
    getBookmark(username: string, trackId: string): any | undefined;
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
      wallet_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS followers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      actor_uri TEXT NOT NULL,
      inbox_uri TEXT NOT NULL,
      shared_inbox_uri TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(artist_id, actor_uri)
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_actor_fid TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(remote_actor_fid, object_type, object_id)
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      artist_id INTEGER REFERENCES artists(id),
      date TEXT,
      cover_path TEXT,
      genre TEXT,
      description TEXT,
      download TEXT,
      price REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      external_links TEXT,
      is_public INTEGER DEFAULT 0,
      visibility TEXT DEFAULT 'private',
      is_release INTEGER DEFAULT 0,
      published_to_gundb INTEGER DEFAULT 0,
      published_to_ap INTEGER DEFAULT 0,
      published_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      album_id INTEGER REFERENCES albums(id),
      artist_id INTEGER REFERENCES artists(id),
      track_num INTEGER,
      duration REAL,
      file_path TEXT,
      format TEXT,
      bitrate INTEGER,
      sample_rate INTEGER,
      price REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      waveform TEXT,
      url TEXT,
      service TEXT,
      external_artwork TEXT,
      lyrics TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      description TEXT,
      is_public INTEGER DEFAULT 0,
      cover_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS release_tracks (
      release_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      PRIMARY KEY (release_id, track_id)
    );
    CREATE INDEX IF NOT EXISTS idx_release_tracks_track_id ON release_tracks(track_id);


    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      played_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at);
    CREATE INDEX IF NOT EXISTS idx_play_history_track_id ON play_history(track_id);

    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
    CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
    CREATE INDEX IF NOT EXISTS idx_albums_public ON albums(is_public);
    CREATE INDEX IF NOT EXISTS idx_albums_release ON albums(is_release);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS unlock_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      release_id INTEGER REFERENCES albums(id),
      is_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      redeemed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      visibility TEXT DEFAULT 'public',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_posts_artist_id ON posts(artist_id);

    CREATE TABLE IF NOT EXISTS ap_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      note_id TEXT NOT NULL UNIQUE,
      note_type TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      content_slug TEXT NOT NULL,
      content_title TEXT NOT NULL,
      published_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ap_notes_artist ON ap_notes(artist_id);

    CREATE TABLE IF NOT EXISTS gun_users (
      pub TEXT PRIMARY KEY,
      epub TEXT,
      alias TEXT,
      avatar TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      instance_url TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_links (
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      gun_pub TEXT NOT NULL,
      gun_priv TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, subject)
    );

    CREATE TABLE IF NOT EXISTS remote_actors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uri TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      username TEXT,
      name TEXT,
      summary TEXT,
      icon_url TEXT,
      inbox_url TEXT,
      outbox_url TEXT,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS remote_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ap_id TEXT NOT NULL UNIQUE,
      actor_uri TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      url TEXT,
      cover_url TEXT,
      stream_url TEXT,
      artist_name TEXT,
      album_name TEXT,
      duration REAL,
      published_at TEXT,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS starred_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(username, item_type, item_id)
    );

    CREATE TABLE IF NOT EXISTS play_queue_state (
      username TEXT PRIMARY KEY,
      current_track_id TEXT,
      position_ms INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS play_queue_tracks (
      username TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (username, position)
    );

    CREATE TABLE IF NOT EXISTS item_ratings (
      username TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (username, item_type, item_id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position_ms INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(username);
  `);

    // Migration: Add is_release column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN is_release INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added is_release column");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add subsonic_token to admin
    try {
        db.exec(`ALTER TABLE admin ADD COLUMN subsonic_token TEXT`);
        console.log("📦 Migrated database: added subsonic_token to admin");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add subsonic_password (encrypted cleartext) to admin for token+salt auth
    try {
        db.exec(`ALTER TABLE admin ADD COLUMN subsonic_password TEXT`);
        console.log("📦 Migrated database: added subsonic_password to admin");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add epub, alias, avatar to gun_users
    try {
        db.exec(`ALTER TABLE gun_users ADD COLUMN epub TEXT`);
        console.log("📦 Migrated database: added epub to gun_users");
    } catch (e) { }
    try {
        db.exec(`ALTER TABLE gun_users ADD COLUMN alias TEXT`);
        console.log("📦 Migrated database: added alias to gun_users");
    } catch (e) { }
    try {
        db.exec(`ALTER TABLE gun_users ADD COLUMN avatar TEXT`);
        console.log("📦 Migrated database: added avatar to gun_users");
    } catch (e) { }

    // Migration: Add download column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN download TEXT`);
        console.log("📦 Migrated database: added download column");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add price columns 
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN price REAL DEFAULT 0`);
        console.log("📦 Migrated database: added price column to albums");
    } catch (e) {
    }

    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN price REAL DEFAULT 0`);
        console.log("📦 Migrated database: added price column to tracks");
    } catch (e) {
    }

    // Migration: Add currency columns
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN currency TEXT DEFAULT 'ETH'`);
        console.log("📦 Migrated database: added currency column to albums");
    } catch (e) {
    }

    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN currency TEXT DEFAULT 'ETH'`);
        console.log("📦 Migrated database: added currency column to tracks");
    } catch (e) {
    }

    // Migration: Add external_links column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN external_links TEXT`);
        console.log("📦 Migrated database: added external_links column");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add waveform column to tracks
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN waveform TEXT`);
        console.log("📦 Migrated database: added waveform column");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add lossless_path column to tracks
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN lossless_path TEXT`);
        console.log("📦 Migrated database: added lossless_path column");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add lower(title) index to tracks
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_title_lower ON tracks(lower(title))`);
    } catch (e) {
        // Ignore
    }

    // Migration: Add is_public column to playlists if it doesn't exist
    try {
        db.exec(`ALTER TABLE playlists ADD COLUMN is_public INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added is_public column to playlists");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add cover_path column to playlists if it doesn't exist
    try {
        db.exec(`ALTER TABLE playlists ADD COLUMN cover_path TEXT`);
        console.log("📦 Migrated database: added cover_path column to playlists");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add username column to playlists if it doesn't exist
    try {
        db.exec(`ALTER TABLE playlists ADD COLUMN username TEXT`);
        db.prepare("UPDATE playlists SET username = 'admin' WHERE username IS NULL").run();
        console.log("📦 Migrated database: added username column to playlists");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add keys to artists
    try {
        db.exec(`ALTER TABLE artists ADD COLUMN public_key TEXT`);
        db.exec(`ALTER TABLE artists ADD COLUMN private_key TEXT`);
        console.log("📦 Migrated database: added keys to artists");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add post_params to artists
    try {
        db.exec(`ALTER TABLE artists ADD COLUMN post_params TEXT`);
        console.log("📦 Migrated database: added post_params to artists");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add wallet_address to artists
    try {
        db.exec(`ALTER TABLE artists ADD COLUMN wallet_address TEXT`);
        console.log("📦 Migrated database: added wallet_address to artists");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add visibility to albums
    try {
        const columns = db.pragma("table_info(albums)") as any[];
        const hasVisibility = columns.some(c => c.name === "visibility");

        if (!hasVisibility) {
            db.exec(`ALTER TABLE albums ADD COLUMN visibility TEXT DEFAULT 'private'`);
            // Backfill based on is_public
            db.prepare("UPDATE albums SET visibility = 'public' WHERE is_public = 1").run();
            db.prepare("UPDATE albums SET visibility = 'private' WHERE is_public = 0").run();
            console.log("📦 Migrated database: added visibility to albums");
        }
    } catch (e) {
        console.warn("⚠️  Migration warning (albums.visibility):", e);
    }

    // Ensure index on visibility
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_albums_visibility ON albums(visibility)`);
    } catch (e) {
        // Ignore
    }

    // Migration: Add type and year to albums
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN type TEXT`);
        db.exec(`ALTER TABLE albums ADD COLUMN year INTEGER`);
        console.log("📦 Migrated database: added type and year to albums");
    } catch (e) {
        // Columns already exist
    }

    // Migration: Add visibility to posts
    try {
        db.exec(`ALTER TABLE posts ADD COLUMN visibility TEXT DEFAULT 'public'`);
        console.log("📦 Migrated database: added visibility to posts");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add federation settings to albums
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN published_to_gundb INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE albums ADD COLUMN published_to_ap INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added federation settings to albums");

        // Backfill based on visibility
        db.prepare("UPDATE albums SET published_to_gundb = 1, published_to_ap = 1 WHERE visibility IN ('public', 'unlisted')").run();
    } catch (e) {
        // Columns already exist
    }

    // Migration: Add published_at to posts
    try {
        db.exec(`ALTER TABLE posts ADD COLUMN published_at TEXT`);
        // Backfill published_at with created_at for existing public posts
        db.prepare("UPDATE posts SET published_at = created_at WHERE visibility = 'public'").run();
        console.log("📦 Migrated database: added published_at to posts");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add external track columns
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN url TEXT`);
        db.exec(`ALTER TABLE tracks ADD COLUMN service TEXT`);
        db.exec(`ALTER TABLE tracks ADD COLUMN external_artwork TEXT`);
        console.log("📦 Migrated database: added external track columns (url, service, external_artwork)");
    } catch (e) {
        // Columns already exist
    }

    // Migration: Add lyrics column to tracks
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN lyrics TEXT`);
        console.log("📦 Migrated database: added lyrics column to tracks");
    } catch (e) {
        // Column already exists
    }

    // Migration: Add date index to albums
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_albums_date ON albums(date DESC)`);
        console.log("📦 Migrated database: added date index to albums");
    } catch (e) {
        // Ignore
    }

    // Migration: Fix NOT NULL constraint on tracks.file_path for external tracks
    try {
        const columns = db.pragma("table_info(tracks)") as any[];
        const filePathCol = columns.find(c => c.name === "file_path");
        if (filePathCol && filePathCol.notnull === 1) {
            console.log("📦 Migrating database: making tracks.file_path nullable...");
            db.transaction(() => {
                // 1. Create new table with correct schema
                db.exec(`
                    CREATE TABLE tracks_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        album_id INTEGER REFERENCES albums(id),
                        artist_id INTEGER REFERENCES artists(id),
                        track_num INTEGER,
                        duration REAL,
                        file_path TEXT,
                        format TEXT,
                        bitrate INTEGER,
                        sample_rate INTEGER,
                        price REAL DEFAULT 0,
                        waveform TEXT,
                        url TEXT,
                        service TEXT,
                        external_artwork TEXT,
                        lossless_path TEXT,
                        lyrics TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    );
                `);

                // 2. Copy data
                db.exec(`
                    INSERT INTO tracks_new (
                        id, title, album_id, artist_id, track_num, duration, 
                        file_path, format, bitrate, sample_rate, price, waveform, 
                        url, service, external_artwork, lossless_path, lyrics, created_at
                    )
                    SELECT 
                        id, title, album_id, artist_id, track_num, duration, 
                        file_path, format, bitrate, sample_rate, price, waveform, 
                        url, service, external_artwork, lossless_path, lyrics, created_at 
                    FROM tracks;
                `);

                // 3. Swap tables
                db.exec(`DROP TABLE tracks;`);
                db.exec(`ALTER TABLE tracks_new RENAME TO tracks;`);

                // 4. Re-create indexes
                db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);`);
                db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);`);
                db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_title_lower ON tracks(lower(title));`);
            })();
            console.log("✅ Database migrated: tracks.file_path is now nullable.");
        }
    } catch (e) {
        console.warn("⚠️  Migration warning (tracks.file_path):", e);
    }

    // Migration: Add remote_actors table
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS remote_actors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uri TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL,
                username TEXT,
                name TEXT,
                summary TEXT,
                icon_url TEXT,
                inbox_url TEXT,
                outbox_url TEXT,
                last_seen TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("📦 Migrated database: added remote_actors table");
    } catch (e) {
        console.warn("⚠️  Migration warning (remote_actors):", e);
    }

    // Migration: Add remote_content table
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS remote_content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ap_id TEXT NOT NULL UNIQUE,
                actor_uri TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT,
                content TEXT,
                url TEXT,
                cover_url TEXT,
                stream_url TEXT,
                artist_name TEXT,
                album_name TEXT,
                duration REAL,
                published_at TEXT,
                received_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("📦 Migrated database: added remote_content table");
    } catch (e) {
        console.warn("⚠️  Migration warning (remote_content):", e);
    }

    // Prepared statements for release tracks
    const addReleaseTrackStmt = db.prepare("INSERT OR IGNORE INTO release_tracks (release_id, track_id) VALUES (?, ?)");
    const removeReleaseTrackStmt = db.prepare("DELETE FROM release_tracks WHERE release_id = ? AND track_id = ?");
    const getReleaseTrackIdsStmt = db.prepare("SELECT track_id FROM release_tracks WHERE release_id = ?");

    const updateReleaseTracksTransaction = db.transaction((releaseId: number, addIds: number[], removeIds: number[]) => {
        for (const trackId of addIds) {
            addReleaseTrackStmt.run(releaseId, trackId);
        }
        for (const trackId of removeIds) {
            removeReleaseTrackStmt.run(releaseId, trackId);
        }
    });

    // Optimized: Pre-compile frequent queries
    const getArtistStmt = db.prepare("SELECT * FROM artists WHERE id = ?");
    const getAlbumStmt = db.prepare(`SELECT a.*, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a
           LEFT JOIN artists ar ON a.artist_id = ar.id
           WHERE a.id = ?`);
    const getTrackStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, ar.name as artist_name, ar.wallet_address as walletAddress
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE t.id = ?`);
    const getTracksByAlbumStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, ar.name as artist_name, ar.wallet_address as walletAddress
             FROM tracks t
             LEFT JOIN albums a ON t.album_id = a.id
             LEFT JOIN artists ar ON t.artist_id = ar.id
             WHERE t.album_id = ? ORDER BY t.track_num`);
    const getPublicTracksByAlbumStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, ar.name as artist_name, ar.wallet_address as walletAddress
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            LEFT JOIN artists ar ON t.artist_id = ar.id
            WHERE t.album_id = ? AND a.is_public = 1
            ORDER BY t.track_num`);
    const getAllTracksStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, ar.name as artist_name, ar.wallet_address as walletAddress
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           ORDER BY ar.name, a.title, t.track_num`);
    const getAllPublicTracksStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, ar.name as artist_name, ar.wallet_address as walletAddress
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE a.is_public = 1 OR (t.album_id IS NULL AND ar.id IS NOT NULL)
           ORDER BY ar.name, a.title, t.track_num`);
    const getTracksByArtistStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, ar.name as artist_name, ar.wallet_address as walletAddress
            FROM tracks t
            LEFT JOIN albums a ON t.album_id = a.id
            LEFT JOIN artists ar ON t.artist_id = ar.id
            WHERE t.artist_id = ?
            ORDER BY a.title, t.track_num`);
    const getPublicTracksByArtistStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, ar.name as artist_name, ar.wallet_address as walletAddress
            FROM tracks t
            LEFT JOIN albums a ON t.album_id = a.id
            LEFT JOIN artists ar ON t.artist_id = ar.id
            WHERE t.artist_id = ? AND (a.is_public = 1 OR t.album_id IS NULL)
            ORDER BY a.title, t.track_num`);

    return {
        db,

        // OAuth
        getOAuthClient(instanceUrl: string): OAuthClient | undefined {
            return db.prepare("SELECT * FROM oauth_clients WHERE instance_url = ?").get(instanceUrl) as OAuthClient | undefined;
        },

        saveOAuthClient(client: Omit<OAuthClient, "created_at">): void {
            db.prepare(`
                INSERT INTO oauth_clients (instance_url, client_id, client_secret, redirect_uri)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(instance_url) DO UPDATE SET
                    client_id=excluded.client_id,
                    client_secret=excluded.client_secret,
                    redirect_uri=excluded.redirect_uri
            `).run(client.instance_url, client.client_id, client.client_secret, client.redirect_uri);
        },

        getOAuthLink(provider: string, subject: string): OAuthLink | undefined {
            return db.prepare("SELECT * FROM oauth_links WHERE provider = ? AND subject = ?").get(provider, subject) as OAuthLink | undefined;
        },

        createOAuthLink(provider: string, subject: string, gunPub: string, gunPriv: string): void {
            db.prepare(`
                INSERT INTO oauth_links (provider, subject, gun_pub, gun_priv)
                VALUES (?, ?, ?, ?)
            `).run(provider, subject, gunPub, gunPriv);
        },

        // Artists
        getArtists(): Artist[] {
            return db.prepare("SELECT * FROM artists ORDER BY name").all() as Artist[];
        },

        getArtist(id: number): Artist | undefined {
            return getArtistStmt.get(id) as Artist | undefined;
        },

        getArtistByName(name: string): Artist | undefined {
            return db.prepare("SELECT * FROM artists WHERE name = ?").get(name) as Artist | undefined;
        },

        getArtistBySlug(slug: string): Artist | undefined {
            return db.prepare("SELECT * FROM artists WHERE slug = ?").get(slug) as Artist | undefined;
        },

        createArtist(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string): number {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const linksJson = links ? JSON.stringify(links) : null;
            const postParamsJson = postParams ? JSON.stringify(postParams) : null;

            // Try to insert, if slug exists add a number suffix
            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    const result = db
                        .prepare("INSERT INTO artists (name, slug, bio, photo_path, links, post_params, wallet_address) VALUES (?, ?, ?, ?, ?, ?, ?)")
                        .run(name, finalSlug, bio || null, photoPath || null, linksJson, postParamsJson, walletAddress || null);
                    return result.lastInsertRowid as number;
                } catch (e: any) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    } else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for artist");
        },

        updateArtist(id: number, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string): void {
            const linksJson = links ? JSON.stringify(links) : null;
            const postParamsJson = postParams ? JSON.stringify(postParams) : null;
            db.prepare("UPDATE artists SET bio = ?, photo_path = ?, links = ?, post_params = ?, wallet_address = ? WHERE id = ?")
                .run(bio || null, photoPath || null, linksJson, postParamsJson, walletAddress || null, id);
        },

        updateArtistKeys(id: number, publicKey: string, privateKey: string): void {
            db.prepare("UPDATE artists SET public_key = ?, private_key = ? WHERE id = ?")
                .run(publicKey, privateKey, id);
        },

        deleteArtist(id: number): void {
            // Unlink from albums
            db.prepare("UPDATE albums SET artist_id = NULL WHERE artist_id = ?").run(id);
            // Unlink from tracks
            db.prepare("UPDATE tracks SET artist_id = NULL WHERE artist_id = ?").run(id);
            // Delete followers
            db.prepare("DELETE FROM followers WHERE artist_id = ?").run(id);
            // Delete artist
            db.prepare("DELETE FROM artists WHERE id = ?").run(id);
        },

        // Followers
        addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string): void {
            db.prepare(
                "INSERT OR IGNORE INTO followers (artist_id, actor_uri, inbox_uri, shared_inbox_uri) VALUES (?, ?, ?, ?)"
            ).run(artistId, actorUri, inboxUri, sharedInboxUri || null);
        },

        removeFollower(artistId: number, actorUri: string): void {
            db.prepare("DELETE FROM followers WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
        },

        getFollowers(artistId: number): Follower[] {
            return db.prepare("SELECT * FROM followers WHERE artist_id = ?").all(artistId) as Follower[];
        },

        getFollower(artistId: number, actorUri: string): Follower | undefined {
            return db.prepare("SELECT * FROM followers WHERE artist_id = ? AND actor_uri = ?").get(artistId, actorUri) as Follower | undefined;
        },

        // Albums
        getAlbums(publicOnly = false): Album[] {
            const sql = publicOnly
                ? `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.visibility = 'public' ORDER BY a.date DESC`
                : `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           ORDER BY a.date DESC`;
            return db.prepare(sql).all() as Album[];
        },

        getReleases(publicOnly = false): Album[] {
            const sql = publicOnly
                ? `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 1 AND a.visibility = 'public' ORDER BY a.date DESC`
                : `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 1 ORDER BY a.date DESC`;
            return db.prepare(sql).all() as Album[];
        },

        getLibraryAlbums(): Album[] {
            const rows = db.prepare(
                `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 0 ORDER BY a.title`
            ).all();
            return mapAlbums(rows);
        },


        getAlbum(id: number): Album | undefined {
            const row = getAlbumStmt.get(id);
            return mapAlbum(row);
        },

        getAlbumBySlug(slug: string): Album | undefined {
            const row = db
                .prepare(
                    `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.slug = ?`
                )
                .get(slug);
            return mapAlbum(row);
        },

        getAlbumByTitle(title: string, artistId?: number): Album | undefined {
            if (artistId) {
                const row = db
                    .prepare("SELECT * FROM albums WHERE title = ? AND artist_id = ?")
                    .get(title, artistId);
                return mapAlbum(row);
            }
            const row = db
                .prepare("SELECT * FROM albums WHERE title = ?")
                .get(title);
            return mapAlbum(row);
        },

        getAlbumsByArtist(artistId: number, publicOnly = false): Album[] {
            const sql = publicOnly
                ? "SELECT * FROM albums WHERE artist_id = ? AND visibility = 'public' ORDER BY date DESC"
                : "SELECT * FROM albums WHERE artist_id = ? ORDER BY date DESC";
            const rows = db.prepare(sql).all(artistId);
            return mapAlbums(rows);
        },

        createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number {
            const slug = album.slug || album.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            // Try to insert, if slug exists add a number suffix
            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    const result = db
                        .prepare(
                            `INSERT INTO albums (title, slug, artist_id, date, cover_path, genre, description, type, year, download, price, currency, external_links, is_public, visibility, is_release, published_at, published_to_gundb, published_to_ap)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                        )
                        .run(
                            album.title,
                            finalSlug,
                            album.artist_id,
                            album.date,
                            album.cover_path,
                            album.genre,
                            album.description,
                            album.type || null,
                            album.year || null,
                            album.download,
                            album.price || 0,
                            album.currency || 'ETH',
                            album.external_links,
                            album.visibility === 'public' || album.visibility === 'unlisted' ? 1 : 0,
                            album.visibility || 'private',
                            album.is_release ? 1 : 0,
                            album.published_at,
                            album.published_to_gundb ? 1 : 0,
                            album.published_to_ap ? 1 : 0
                        );
                    return result.lastInsertRowid as number;
                } catch (e: any) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    } else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for album");
        },

        updateAlbumVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void {
            const isPublic = visibility === 'public' || visibility === 'unlisted';
            const publishedAt = isPublic ? new Date().toISOString() : null;
            db.prepare(
                "UPDATE albums SET is_public = ?, visibility = ?, published_at = ? WHERE id = ?"
            ).run(isPublic ? 1 : 0, visibility, publishedAt, id);
        },

        updateAlbumFederationSettings(id: number, publishedToGunDB: boolean, publishedToAP: boolean): void {
            db.prepare(
                "UPDATE albums SET published_to_gundb = ?, published_to_ap = ? WHERE id = ?"
            ).run(publishedToGunDB ? 1 : 0, publishedToAP ? 1 : 0, id);
        },

        updateAlbumArtist(id: number, artistId: number): void {
            db.prepare("UPDATE albums SET artist_id = ? WHERE id = ?").run(artistId, id);
        },

        updateAlbumTitle(id: number, title: string): void {
            // Also update slug to match scanner behavior
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    db.prepare("UPDATE albums SET title = ?, slug = ? WHERE id = ?").run(title, finalSlug, id);
                    return;
                } catch (e: any) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    } else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for album rename");
        },

        updateAlbumCover(id: number, coverPath: string): void {
            db.prepare("UPDATE albums SET cover_path = ? WHERE id = ?").run(coverPath, id);
        },

        updateAlbumGenre(id: number, genre: string | null): void {
            db.prepare("UPDATE albums SET genre = ? WHERE id = ?").run(genre, id);
        },

        updateAlbumDownload(id: number, download: string | null): void {
            db.prepare("UPDATE albums SET download = ? WHERE id = ?").run(download, id);
        },

        updateAlbumPrice(id: number, price: number | null, currency: 'ETH' | 'USD' = 'ETH'): void {
            db.prepare("UPDATE albums SET price = ?, currency = ? WHERE id = ?").run(price || 0, currency, id);
        },

        updateAlbumLinks(id: number, links: string | null): void {
            db.prepare("UPDATE albums SET external_links = ? WHERE id = ?").run(links, id);
        },

        promoteToRelease(id: number): void {
            db.prepare("UPDATE albums SET is_release = 1 WHERE id = ?").run(id);
        },

        deleteAlbum(id: number, keepTracks = false): void {
            // Delete from release_tracks join table
            db.prepare("DELETE FROM release_tracks WHERE release_id = ?").run(id);

            // Delete associated unlock codes - VERY IMPORTANT to avoid FK constraint errors
            db.prepare("DELETE FROM unlock_codes WHERE release_id = ?").run(id);

            // Mark AP notes as deleted if they reference this album
            db.prepare("UPDATE ap_notes SET deleted_at = CURRENT_TIMESTAMP WHERE content_id = ? AND note_type = 'release'").run(id);

            if (keepTracks) {
                // Determine if we should unlink tracks or just nullify album_id
                // For now, nullify album_id (move to loose tracks)
                db.prepare("UPDATE tracks SET album_id = NULL WHERE album_id = ?").run(id);
            } else {
                // First delete associated tracks
                db.prepare("DELETE FROM tracks WHERE album_id = ?").run(id);
            }
            // Then delete the album
            db.prepare("DELETE FROM albums WHERE id = ?").run(id);
        },

        // Tracks
        getTracks(albumId?: number, publicOnly = false): Track[] {
            if (albumId) {
                if (publicOnly) {
                    return getPublicTracksByAlbumStmt.all(albumId) as Track[];
                }
                return getTracksByAlbumStmt.all(albumId) as Track[];
            }
            if (publicOnly) {
                return getAllPublicTracksStmt.all() as Track[];
            }
            return getAllTracksStmt.all() as Track[];
        },

        getTracksByArtist(artistId: number, publicOnly = false): Track[] {
            if (publicOnly) {
                return getPublicTracksByArtistStmt.all(artistId) as Track[];
            }
            return getTracksByArtistStmt.all(artistId) as Track[];
        },

        getTracksByAlbumIds(albumIds: number[]): Track[] {
            if (albumIds.length === 0) return [];

            const CHUNK_SIZE = 900; // Safe limit for SQLite variables
            const allTracks: Track[] = [];

            for (let i = 0; i < albumIds.length; i += CHUNK_SIZE) {
                const chunk = albumIds.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => '?').join(',');
                const tracks = db
                    .prepare(
                        `SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, ar.name as artist_name, ar.wallet_address as walletAddress
             FROM tracks t
             LEFT JOIN albums a ON t.album_id = a.id
             LEFT JOIN artists ar ON t.artist_id = ar.id
             WHERE t.album_id IN (${placeholders})
             ORDER BY t.album_id, t.track_num`
                    )
                    .all(...chunk) as Track[];
                allTracks.push(...tracks);
            }

            return allTracks;
        },

        getTrack(id: number): Track | undefined {
            return getTrackStmt.get(id) as Track | undefined;
        },

        getTrackByPath(filePath: string): Track | undefined {
            return db
                .prepare("SELECT * FROM tracks WHERE file_path = ?")
                .get(filePath) as Track | undefined;
        },

        createTrack(track: Omit<Track, "id" | "created_at" | "album_title" | "artist_name">): number {
            const result = db
                .prepare(
                    `INSERT INTO tracks (title, album_id, artist_id, track_num, duration, file_path, format, bitrate, sample_rate, price, currency, lossless_path, url, service, external_artwork, lyrics)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .run(
                    track.title,
                    track.album_id,
                    track.artist_id,
                    track.track_num,
                    track.duration,
                    track.file_path,
                    track.format,
                    track.bitrate,
                    track.sample_rate,
                    track.price || 0,
                    track.currency || 'ETH',
                    track.lossless_path || null,
                    track.url || null,
                    track.service || null,
                    track.external_artwork || null,
                    track.lyrics || null
                );
            return result.lastInsertRowid as number;
        },

        updateTrackAlbum(id: number, albumId: number | null): void {
            db.prepare("UPDATE tracks SET album_id = ? WHERE id = ?").run(albumId, id);
        },

        updateTrackArtist(id: number, artistId: number | null): void {
            db.prepare("UPDATE tracks SET artist_id = ? WHERE id = ?").run(artistId, id);
        },

        getTrackByMetadata(title: string, artistId: number | null, albumId: number | null): Track | undefined {
            // Case-insensitive title match with artist/album check
            return db.prepare(`
                SELECT * FROM tracks 
                WHERE LOWER(title) = LOWER(?) 
                AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL))
                AND (album_id = ? OR (album_id IS NULL AND ? IS NULL))
            `).get(title, artistId, artistId, albumId, albumId) as Track | undefined;
        },

        updateTrackTitle(id: number, title: string): void {
            db.prepare("UPDATE tracks SET title = ? WHERE id = ?").run(title, id);
        },

        updateTrackPath(id: number, filePath: string, albumId: number | null): void {
            db.prepare("UPDATE tracks SET file_path = ?, album_id = ? WHERE id = ?").run(filePath, albumId, id);
        },

        updateTrackDuration(id: number, duration: number): void {
            db.prepare("UPDATE tracks SET duration = ? WHERE id = ?").run(duration, id);
        },

        updateTrackPrice(id: number, price: number | null, currency: 'ETH' | 'USD' = 'ETH'): void {
            db.prepare("UPDATE tracks SET price = ?, currency = ? WHERE id = ?").run(price || 0, currency, id);
        },

        updateTrackWaveform(id: number, waveform: string): void {
            db.prepare("UPDATE tracks SET waveform = ? WHERE id = ?").run(waveform, id);
        },
        updateTrackLosslessPath(id: number, losslessPath: string | null): void {
            db.prepare("UPDATE tracks SET lossless_path = ? WHERE id = ?").run(losslessPath, id);
        },
        updateTrackLyrics(id: number, lyrics: string | null): void {
            db.prepare("UPDATE tracks SET lyrics = ? WHERE id = ?").run(lyrics, id);
        },
        updateTrackPathsPrefix(oldPrefix: string, newPrefix: string): void {
            // Update file_path
            db.prepare(`
                UPDATE tracks 
                SET file_path = ? || SUBSTR(file_path, LENGTH(?) + 1)
                WHERE file_path = ? OR file_path LIKE ? || '/%'
            `).run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
            
            // Update lossless_path
            db.prepare(`
                UPDATE tracks 
                SET lossless_path = ? || SUBSTR(lossless_path, LENGTH(?) + 1)
                WHERE lossless_path = ? OR lossless_path LIKE ? || '/%'
            `).run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
        },

        deleteTrack(id: number): void {
            db.prepare("DELETE FROM release_tracks WHERE track_id = ?").run(id);
            db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
        },

        addTrackToRelease(releaseId: number, trackId: number): void {
            db.prepare(
                "INSERT OR IGNORE INTO release_tracks (release_id, track_id) VALUES (?, ?)"
            ).run(releaseId, trackId);
        },

        removeTrackFromRelease(releaseId: number, trackId: number): void {
            db.prepare(
                "DELETE FROM release_tracks WHERE release_id = ? AND track_id = ?"
            ).run(releaseId, trackId);
        },

        updateReleaseTracks(releaseId: number, toAdd: number[], toRemove: number[]): void {
            updateReleaseTracksTransaction(releaseId, toAdd, toRemove);
        },

        getReleaseTrackIds(releaseId: number): number[] {
            const rows = getReleaseTrackIdsStmt.all(releaseId) as { track_id: number }[];
            return rows.map(r => r.track_id);
        },

        getTracksByReleaseId(releaseId: number): Track[] {
            return db
                .prepare(
                    `SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, ar.name as artist_name, ar.wallet_address as walletAddress 
            FROM tracks t
           JOIN release_tracks rt ON t.id = rt.track_id
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE rt.release_id = ?`
                )
                .all(releaseId) as Track[];
        },

        // Playlists

        getPlaylists(username?: string, publicOnly = false): Playlist[] {
            if (username) {
                const sql = publicOnly
                    ? "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists WHERE username = ? AND is_public = 1 ORDER BY name"
                    : "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists WHERE username = ? ORDER BY name";
                return db.prepare(sql).all(username) as Playlist[];
            }
            
            const sql = publicOnly
                ? "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists WHERE is_public = 1 ORDER BY name"
                : "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists ORDER BY name";
            return db.prepare(sql).all() as Playlist[];
        },

        getPlaylist(id: number): Playlist | undefined {
            return db.prepare("SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists WHERE id = ?").get(id) as Playlist | undefined;
        },

        createPlaylist(name: string, username: string, description?: string, isPublic = false): number {
            const result = db
                .prepare("INSERT INTO playlists (name, username, description, is_public) VALUES (?, ?, ?, ?)")
                .run(name, username, description || null, isPublic ? 1 : 0);
            return result.lastInsertRowid as number;
        },

        updatePlaylistVisibility(id: number, isPublic: boolean): void {
            db.prepare("UPDATE playlists SET is_public = ? WHERE id = ?").run(isPublic ? 1 : 0, id);
        },

        updatePlaylistCover(id: number, coverPath: string | null): void {
            db.prepare("UPDATE playlists SET cover_path = ? WHERE id = ?").run(coverPath, id);
        },

        deletePlaylist(id: number): void {
            db.prepare("DELETE FROM playlists WHERE id = ?").run(id);
        },

        getPlaylistTracks(playlistId: number): Track[] {
            return db
                .prepare(
                    `SELECT t.*, a.title as album_title, ar.name as artist_name 
           FROM tracks t
           JOIN playlist_tracks pt ON t.id = pt.track_id
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE pt.playlist_id = ?
           ORDER BY pt.position`
                )
                .all(playlistId) as Track[];
        },

        isTrackInPublicPlaylist(trackId: number): boolean {
            const row = db.prepare(`
                SELECT count(*) as count 
                FROM playlist_tracks pt
                JOIN playlists p ON pt.playlist_id = p.id
                WHERE pt.track_id = ? AND p.is_public = 1
            `).get(trackId) as { count: number };
            return row.count > 0;
        },

        addTrackToPlaylist(playlistId: number, trackId: number): void {
            const maxPos = db
                .prepare("SELECT MAX(position) as max FROM playlist_tracks WHERE playlist_id = ?")
                .get(playlistId) as { max: number | null };
            const position = (maxPos?.max || 0) + 1;
            db.prepare(
                "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"
            ).run(playlistId, trackId, position);
        },

        removeTrackFromPlaylist(playlistId: number, trackId: number): void {
            db.prepare(
                "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?"
            ).run(playlistId, trackId);
        },

        // Posts
        getPostsByArtist(artistId: number, publicOnly = false): Post[] {
            const sql = publicOnly
                ? `SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo
                FROM posts p
                JOIN artists a ON p.artist_id = a.id
                WHERE p.artist_id = ? AND p.visibility = 'public'
                ORDER BY p.created_at DESC`
                : `SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo
                FROM posts p
                JOIN artists a ON p.artist_id = a.id
                WHERE p.artist_id = ?
                ORDER BY p.created_at DESC`;
            return db.prepare(sql).all(artistId) as Post[];
        },

        getPost(id: number): Post | undefined {
            return db.prepare(`
                SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo
                FROM posts p
                JOIN artists a ON p.artist_id = a.id
                WHERE p.id = ?
            `).get(id) as Post | undefined;
        },

        getPostBySlug(slug: string): Post | undefined {
            return db.prepare(`
                SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo
                FROM posts p
                JOIN artists a ON p.artist_id = a.id
                WHERE p.slug = ?
            `).get(slug) as Post | undefined;
        },

        createPost(artistId: number, content: string, visibility: 'public' | 'private' | 'unlisted' = 'public'): number {
            // Generate slug from content snippet or random
            const snippet = content.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const random = Math.random().toString(36).substring(2, 8);
            const slug = snippet ? `${snippet}-${random}` : `post-${random}`;

            const publishedAt = visibility === 'public' || visibility === 'unlisted' ? new Date().toISOString() : null;

            const result = db.prepare(
                "INSERT INTO posts (artist_id, content, slug, visibility, published_at) VALUES (?, ?, ?, ?, ?)"
            ).run(artistId, content, slug, visibility, publishedAt);

            return result.lastInsertRowid as number;
        },

        deletePost(id: number): void {
            db.prepare("DELETE FROM posts WHERE id = ?").run(id);
        },

        updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): void {
            if (content !== undefined && visibility !== undefined) {
                const publishedAt = visibility === 'public' || visibility === 'unlisted' ? new Date().toISOString() : null;
                // Only update published_at if becoming public/unlisted, or if it was null? 
                // Simple logic: if setting to public/unlisted, update the timestamp to NOW to ensure unique AP ID.
                // If setting to private, it stays as is (or null? doesn't matter much as it won't be federated).
                // Let's explicitly update it if visibility is provided and matches public/unlisted.
                if (publishedAt) {
                    db.prepare("UPDATE posts SET content = ?, visibility = ?, published_at = ? WHERE id = ?").run(content, visibility, publishedAt, id);
                } else {
                    db.prepare("UPDATE posts SET content = ?, visibility = ? WHERE id = ?").run(content, visibility, id);
                }
            } else if (content !== undefined) {
                db.prepare("UPDATE posts SET content = ? WHERE id = ?").run(content, id);
            } else if (visibility !== undefined) {
                const publishedAt = visibility === 'public' || visibility === 'unlisted' ? new Date().toISOString() : null;
                if (publishedAt) {
                    db.prepare("UPDATE posts SET visibility = ?, published_at = ? WHERE id = ?").run(visibility, publishedAt, id);
                } else {
                    db.prepare("UPDATE posts SET visibility = ? WHERE id = ?").run(visibility, id);
                }
            }
        },

        // Stats
        async getStats(artistId?: number) {
            const artistFilter = artistId ? `WHERE id = ${artistId}` : "";
            const albumFilter = artistId ? `WHERE artist_id = ${artistId}` : "";
            const trackFilter = artistId ? `WHERE artist_id = ${artistId}` : "";
            const publicAlbumFilter = artistId ? `WHERE artist_id = ${artistId} AND is_public = 1` : "WHERE is_public = 1";

            const artists = (db.prepare(`SELECT COUNT(*) as count FROM artists ${artistFilter}`).get() as { count: number }).count;
            const albums = (db.prepare(`SELECT COUNT(*) as count FROM albums ${albumFilter}`).get() as { count: number }).count;
            const tracks = (db.prepare(`SELECT COUNT(*) as count FROM tracks ${trackFilter}`).get() as { count: number }).count;
            const publicAlbums = (db.prepare(`SELECT COUNT(*) as count FROM albums ${publicAlbumFilter}`).get() as { count: number }).count;
            
            // Total users count is only relevant for global admin
            const totalUsers = artistId ? 0 : (db.prepare("SELECT COUNT(*) as count FROM admin").get() as { count: number } | undefined)?.count || 0;

            const storageStats = db.prepare(`SELECT SUM(duration) as total_duration FROM tracks ${trackFilter}`).get() as { total_duration: number };
            const estimatedSize = (storageStats.total_duration || 0) * 40 * 1024; // Very rough estimate

            // Genre count
            const genreQuery = artistId 
                ? `SELECT genre FROM albums WHERE artist_id = ${artistId} AND genre IS NOT NULL AND genre != ''`
                : `SELECT genre FROM albums WHERE genre IS NOT NULL AND genre != ''`;
            const allGenres = db.prepare(genreQuery).all() as { genre: string }[];
            const genreSet = new Set<string>();
            allGenres.forEach(row => {
                row.genre.split(',').forEach(g => {
                    const trimmed = g.trim();
                    if (trimmed) genreSet.add(trimmed.toLowerCase());
                });
            });
            const genresCount = genreSet.size;

            return {
                artists,
                albums,
                tracks,
                totalTracks: tracks,
                publicAlbums,
                totalUsers,
                storageUsed: estimatedSize,
                networkSites: artistId ? 0 : (db.prepare("SELECT COUNT(*) as count FROM remote_actors WHERE type = 'Service'").get() as { count: number }).count,
                genresCount
            };
        },

        getPublicTracksCount(): number {
            const result = db.prepare(`
                SELECT COUNT(t.id) as count
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                WHERE a.visibility = 'public'
            `).get() as { count: number };
            return result.count;
        },

        // Search
        search(query: string, publicOnly = false) {
            const likeQuery = `%${query}%`;

            const artists = db
                .prepare("SELECT * FROM artists WHERE name LIKE ?")
                .all(likeQuery) as Artist[];

            const albumsSql = publicOnly
                ? `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.visibility IN ('public', 'unlisted') AND (a.title LIKE ? OR ar.name LIKE ?)`
                : `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.title LIKE ? OR ar.name LIKE ?`;
            const albums = db.prepare(albumsSql).all(likeQuery, likeQuery) as Album[];

            const tracksSql = publicOnly
                ? `SELECT t.*, a.title as album_title, ar.name as artist_name 
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE a.visibility IN ('public', 'unlisted') AND (t.title LIKE ? OR ar.name LIKE ?)`
                : `SELECT t.*, a.title as album_title, ar.name as artist_name 
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE t.title LIKE ? OR ar.name LIKE ?`;
            const tracks = db.prepare(tracksSql).all(likeQuery, likeQuery) as Track[];

            return { artists, albums, tracks };
        },

        // Settings
        getSetting(key: string): string | undefined {
            const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
            return row?.value;
        },

        setSetting(key: string, value: string): void {
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
        },

        getAllSettings(): { [key: string]: string } {
            const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
            const settings: { [key: string]: string } = {};
            for (const row of rows) {
                settings[row.key] = row.value;
            }
            return settings;
        },

        // Play History
        recordPlay(trackId: number, playedAt?: string): void {
            if (playedAt) {
                db.prepare("INSERT INTO play_history (track_id, played_at) VALUES (?, ?)").run(trackId, playedAt);
            } else {
                db.prepare("INSERT INTO play_history (track_id) VALUES (?)").run(trackId);
            }
        },

        getRecentPlays(limit = 50): PlayHistoryEntry[] {
            return db.prepare(`
                SELECT 
                    ph.id,
                    ph.track_id,
                    t.title as track_title,
                    ar.name as artist_name,
                    al.title as album_title,
                    ph.played_at
                FROM play_history ph
                LEFT JOIN tracks t ON ph.track_id = t.id
                LEFT JOIN artists ar ON t.artist_id = ar.id
                LEFT JOIN albums al ON t.album_id = al.id
                ORDER BY ph.played_at DESC
                LIMIT ?
            `).all(limit) as PlayHistoryEntry[];
        },

        getTopTracks(limit = 20, days = 30): TrackWithPlayCount[] {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - days);
            const dateStr = dateLimit.toISOString();

            // Bolt ⚡: Use CTE to aggregate plays from history table FIRST (filtering by date immediately).
            // This avoids joining the potentially large play_history table with tracks for every single track row.
            return db.prepare(`
                WITH RecentPlays AS (
                    SELECT track_id, COUNT(*) as play_count
                    FROM play_history
                    WHERE played_at >= ?
                    GROUP BY track_id
                )
                SELECT 
                    t.*,
                    al.title as album_title,
                    ar.name as artist_name,
                    rp.play_count
                FROM RecentPlays rp
                JOIN tracks t ON t.id = rp.track_id
                LEFT JOIN albums al ON t.album_id = al.id
                LEFT JOIN artists ar ON t.artist_id = ar.id
                ORDER BY rp.play_count DESC
                LIMIT ?
            `).all(dateStr, limit) as TrackWithPlayCount[];
        },

        getTopArtists(limit = 10, days = 30): ArtistWithPlayCount[] {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - days);
            const dateStr = dateLimit.toISOString();

            // Bolt ⚡: Optimization: Aggregate plays by artist from history table before joining artist details.
            return db.prepare(`
                WITH RecentPlays AS (
                    SELECT t.artist_id, COUNT(*) as play_count
                    FROM play_history ph
                    JOIN tracks t ON ph.track_id = t.id
                    WHERE ph.played_at >= ?
                    GROUP BY t.artist_id
                )
                SELECT 
                    ar.*,
                    rp.play_count
                FROM RecentPlays rp
                JOIN artists ar ON ar.id = rp.artist_id
                ORDER BY rp.play_count DESC
                LIMIT ?
            `).all(dateStr, limit) as ArtistWithPlayCount[];
        },

        getListeningStats(): ListeningStats {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

            // Bolt ⚡: Optimized to avoid full table scan on play_history.
            // Split into separate queries to use specific indexes for each metric.

            // 1. Total Plays (COUNT(*)) - Fast with index
            const totalPlays = (db.prepare("SELECT COUNT(*) as count FROM play_history").get() as { count: number }).count;

            // Bolt ⚡: Optimized to condense index scans.
            // 2, 3, 4. Plays Today/Week/Month (Range Scan Index) - Uses idx_play_history_played_at
            const playsStats = db.prepare(`
                SELECT
                    COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsToday,
                    COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsThisWeek,
                    COUNT(*) as playsThisMonth
                FROM play_history
                WHERE played_at >= ?
            `).get(todayStart, weekStart, monthStart, monthStart) as { playsToday: number, playsThisWeek: number, playsThisMonth: number };

            const { playsToday, playsThisWeek, playsThisMonth } = playsStats;

            // 5. Unique Tracks (Index Scan) - Uses idx_play_history_track_id
            const uniqueTracks = (db.prepare("SELECT COUNT(DISTINCT track_id) as count FROM play_history").get() as { count: number }).count;

            // 6. Total Listening Time (Group By + Join)
            // Group by track_id first to reduce join cardinality from N (history) to M (unique tracks)
            const timeRow = db.prepare(`
                SELECT COALESCE(SUM(ph.cnt * t.duration), 0) as totalListeningTime
                FROM (
                    SELECT track_id, COUNT(*) as cnt
                    FROM play_history
                    GROUP BY track_id
                ) ph
                JOIN tracks t ON ph.track_id = t.id
            `).get() as { totalListeningTime: number };

            return {
                totalPlays,
                totalListeningTime: Math.round(timeRow.totalListeningTime),
                uniqueTracks,
                playsToday,
                playsThisWeek,
                playsThisMonth,
            };
        },

        // Unlock Codes
        createUnlockCode(code: string, releaseId?: number): void {
            db.prepare("INSERT INTO unlock_codes (code, release_id) VALUES (?, ?)").run(code, releaseId || null);
        },

        validateUnlockCode(code: string): { valid: boolean; releaseId?: number; isUsed: boolean } {
            const row = db.prepare("SELECT * FROM unlock_codes WHERE code = ?").get(code) as any;
            if (!row) return { valid: false, isUsed: false };
            return { valid: true, releaseId: row.release_id, isUsed: !!row.is_used };
        },

        redeemUnlockCode(code: string): void {
            db.prepare("UPDATE unlock_codes SET is_used = 1, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?").run(code);
        },

        listUnlockCodes(releaseId?: number): any[] {
            if (releaseId) {
                return db.prepare("SELECT * FROM unlock_codes WHERE release_id = ? ORDER BY created_at DESC").all(releaseId);
            }
            return db.prepare("SELECT * FROM unlock_codes ORDER BY created_at DESC").all();
        },

        // ActivityPub Notes
        createApNote(artistId: number, noteId: string, noteType: 'post' | 'release', contentId: number, contentSlug: string, contentTitle: string): number {
            const result = db.prepare(`
                INSERT OR IGNORE INTO ap_notes (artist_id, note_id, note_type, content_id, content_slug, content_title)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(artistId, noteId, noteType, contentId, contentSlug, contentTitle);
            return Number(result.lastInsertRowid);
        },

        getApNotes(artistId: number, includeDeleted: boolean = false): ApNote[] {
            const query = includeDeleted
                ? "SELECT * FROM ap_notes WHERE artist_id = ? ORDER BY published_at DESC"
                : "SELECT * FROM ap_notes WHERE artist_id = ? AND deleted_at IS NULL ORDER BY published_at DESC";
            return db.prepare(query).all(artistId) as ApNote[];
        },

        getApNote(noteId: string): ApNote | undefined {
            return db.prepare("SELECT * FROM ap_notes WHERE note_id = ?").get(noteId) as ApNote | undefined;
        },

        markApNoteDeleted(noteId: string): void {
            db.prepare("UPDATE ap_notes SET deleted_at = CURRENT_TIMESTAMP WHERE note_id = ?").run(noteId);
        },

        deleteApNote(noteId: string): void {
            db.prepare("DELETE FROM ap_notes WHERE note_id = ?").run(noteId);
        },

        // Gun Users
        syncGunUser(pub: string, epub: string, alias: string, avatar?: string): void {
            db.prepare(
                "INSERT OR REPLACE INTO gun_users (pub, epub, alias, avatar) VALUES (?, ?, ?, ?)"
            ).run(pub, epub, alias, avatar || null);
        },

        getGunUser(pub: string): { pub: string; epub: string; alias: string, avatar?: string } | undefined {
            return db.prepare("SELECT pub, epub, alias, avatar FROM gun_users WHERE pub = ?").get(pub) as any;
        },

        // Remote Federation (ActivityPub)
        upsertRemoteActor(actor: Omit<RemoteActor, "id" | "last_seen">): void {
            db.prepare(`
                INSERT INTO remote_actors (uri, type, username, name, summary, icon_url, inbox_url, outbox_url, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(uri) DO UPDATE SET
                    username=excluded.username,
                    name=excluded.name,
                    summary=excluded.summary,
                    icon_url=excluded.icon_url,
                    inbox_url=excluded.inbox_url,
                    outbox_url=excluded.outbox_url,
                    last_seen=CURRENT_TIMESTAMP
            `).run(actor.uri, actor.type, actor.username, actor.name, actor.summary, actor.icon_url, actor.inbox_url, actor.outbox_url);
        },

        getRemoteActor(uri: string): RemoteActor | undefined {
            return db.prepare("SELECT * FROM remote_actors WHERE uri = ?").get(uri) as RemoteActor | undefined;
        },

        getRemoteActors(): RemoteActor[] {
            return db.prepare("SELECT * FROM remote_actors ORDER BY last_seen DESC").all() as RemoteActor[];
        },

        upsertRemoteContent(content: Omit<RemoteContent, "id" | "received_at">): void {
            db.prepare(`
                INSERT INTO remote_content (ap_id, actor_uri, type, title, content, url, cover_url, stream_url, artist_name, album_name, duration, published_at, received_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(ap_id) DO UPDATE SET
                    title=excluded.title,
                    content=excluded.content,
                    url=excluded.url,
                    cover_url=excluded.cover_url,
                    stream_url=excluded.stream_url,
                    artist_name=excluded.artist_name,
                    album_name=excluded.album_name,
                    duration=excluded.duration,
                    published_at=excluded.published_at,
                    received_at=CURRENT_TIMESTAMP
            `).run(content.ap_id, content.actor_uri, content.type, content.title, content.content, content.url, content.cover_url, content.stream_url, content.artist_name, content.album_name, content.duration, content.published_at);
        },

        getRemoteContent(apId: string): RemoteContent | undefined {
            return db.prepare("SELECT * FROM remote_content WHERE ap_id = ?").get(apId) as RemoteContent | undefined;
        },

        getRemoteTracks(): RemoteContent[] {
            return db.prepare("SELECT * FROM remote_content WHERE type = 'release' ORDER BY published_at DESC, received_at DESC").all() as RemoteContent[];
        },

        getRemotePosts(): RemoteContent[] {
            return db.prepare("SELECT * FROM remote_content WHERE type = 'post' ORDER BY published_at DESC, received_at DESC").all() as RemoteContent[];
        },

        deleteRemoteContent(apId: string): void {
            db.prepare("DELETE FROM remote_content WHERE ap_id = ?").run(apId);
        },

        // Starred Items (Subsonic)
        starItem(username: string, itemType: string, itemId: string): void {
            db.prepare(`
                INSERT OR IGNORE INTO starred_items (username, item_type, item_id)
                VALUES (?, ?, ?)
            `).run(username, itemType, itemId);
        },

        unstarItem(username: string, itemType: string, itemId: string): void {
            db.prepare("DELETE FROM starred_items WHERE username = ? AND item_type = ? AND item_id = ?").run(username, itemType, itemId);
        },

        getStarredItems(username: string, itemType?: string): { item_type: string; item_id: string; created_at: string }[] {
            if (itemType) {
                return db.prepare("SELECT item_type, item_id, created_at FROM starred_items WHERE username = ? AND item_type = ?").all(username, itemType) as any[];
            }
            return db.prepare("SELECT item_type, item_id, created_at FROM starred_items WHERE username = ?").all(username) as any[];
        },

        isStarred(username: string, itemType: string, itemId: string): boolean {
            const row = db.prepare("SELECT 1 FROM starred_items WHERE username = ? AND item_type = ? AND item_id = ?").get(username, itemType, itemId);
            return !!row;
        },

        // Likes
        addLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void {
            db.prepare(`
                INSERT OR IGNORE INTO likes (remote_actor_fid, object_type, object_id)
                VALUES (?, ?, ?)
            `).run(actorUri, objectType, objectId);
        },

        removeLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void {
            db.prepare(`
                DELETE FROM likes WHERE remote_actor_fid = ? AND object_type = ? AND object_id = ?
            `).run(actorUri, objectType, objectId);
        },

        getLikesCount(objectType: 'album' | 'track' | 'post', objectId: number): number {
            const row = db.prepare(`
                SELECT COUNT(*) as count FROM likes WHERE object_type = ? AND object_id = ?
            `).get(objectType, objectId) as { count: number };
            return row ? row.count : 0;
        },

        hasLiked(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): boolean {
            const row = db.prepare(`
                SELECT 1 FROM likes WHERE remote_actor_fid = ? AND object_type = ? AND object_id = ?
            `).get(actorUri, objectType, objectId);
            return !!row;
        },

        // Play Queue (Subsonic)
        savePlayQueue(username: string, trackIds: string[], current: string | null, positionMs: number): void {
            db.transaction(() => {
                db.prepare("INSERT OR REPLACE INTO play_queue_state (username, current_track_id, position_ms, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)")
                  .run(username, current || null, positionMs || 0);
                
                db.prepare("DELETE FROM play_queue_tracks WHERE username = ?").run(username);
                
                const insertTrack = db.prepare("INSERT INTO play_queue_tracks (username, track_id, position) VALUES (?, ?, ?)");
                for (let i = 0; i < trackIds.length; i++) {
                    insertTrack.run(username, trackIds[i], i);
                }
            })();
        },

        getPlayQueue(username: string): { trackIds: string[], current: string | null, positionMs: number } {
            const state = db.prepare("SELECT current_track_id, position_ms FROM play_queue_state WHERE username = ?").get(username) as any;
            if (!state) return { trackIds: [], current: null, positionMs: 0 };

            const tracks = db.prepare("SELECT track_id FROM play_queue_tracks WHERE username = ? ORDER BY position ASC").all(username) as any[];
            
            return {
                trackIds: tracks.map(t => t.track_id),
                current: state.current_track_id,
                positionMs: state.position_ms
            };
        },

        // Ratings & Bookmarks
        setItemRating(username: string, itemType: string, itemId: string, rating: number): void {
            db.prepare(`
                INSERT INTO item_ratings (username, item_type, item_id, rating)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(username, item_type, item_id) DO UPDATE SET rating = excluded.rating
            `).run(username, itemType, itemId, rating);
        },

        getItemRating(username: string, itemType: string, itemId: string): number {
            const row = db.prepare("SELECT rating FROM item_ratings WHERE username = ? AND item_type = ? AND item_id = ?").get(username, itemType, itemId) as { rating: number } | undefined;
            return row?.rating || 0;
        },

        createBookmark(username: string, trackId: string, positionMs: number, comment?: string): void {
            // Subsonic: Only one bookmark per track per user? 
            // Actually, spec says "Retrieves all bookmarks for this user".
            // Some implementations use one per track.
            db.prepare(`
                INSERT INTO bookmarks (username, track_id, position_ms, comment, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(username, trackId, positionMs, comment || null);
        },

        getBookmarks(username: string): any[] {
            return db.prepare("SELECT * FROM bookmarks WHERE username = ? ORDER BY updated_at DESC").all(username);
        },

        deleteBookmark(username: string, trackId: string): void {
            db.prepare("DELETE FROM bookmarks WHERE username = ? AND track_id = ?").run(username, trackId);
        },

        getBookmark(username: string, trackId: string): any | undefined {
            return db.prepare("SELECT * FROM bookmarks WHERE username = ? AND track_id = ?").get(username, trackId);
        }
    };
}

