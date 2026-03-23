export interface Track {
    id: string | number;
    title: string;
    artistId: string | number;
    artistName?: string;
    artist_name?: string;
    albumId: string | number;
    albumName?: string;
    album_title?: string;
    albumDownload?: string;
    albumVisibility?: string;
    albumPrice?: number;
    duration: number;
    path: string;
    file_path?: string;
    filename: string;
    format?: string;
    codec?: string;
    bitrate?: number;
    size?: number;
    losslessPath?: string;
    lossless_path?: string;
    playCount: number;
    liked?: boolean;
    coverImage?: string; // helpers
    waveform?: number[] | string;
    lyrics?: string;
    streamUrl?: string; // For remote/network tracks
    coverUrl?: string; // For remote/network tracks
    walletAddress?: string;
    price?: number;
    currency?: 'ETH' | 'USD';
    track_num?: number;
}

export interface ReleaseTrack {
    id: number;
    release_id: number;
    track_id: number | null;
    title: string;
    artist_name: string | null;
    track_num: number | null;
    duration: number | null;
    file_path: string | null;
    price: number | null;
    currency: 'ETH' | 'USD';
    created_at: string;
}

export interface Release {
    id: string | number;
    title: string;
    slug: string;
    artistId?: string | number;
    artist_id?: string | number;
    artistName?: string;
    artist_name?: string;
    artistSlug?: string;
    artist_slug?: string;
    coverPath?: string;
    cover_path?: string;
    date?: string;
    description?: string;
    genre?: string;
    type?: 'album' | 'single' | 'ep';
    year?: number;
    download?: 'free' | 'paid' | 'codes';
    price?: number;
    currency?: 'ETH' | 'USD';
    external_links?: string;
    visibility: 'public' | 'private' | 'unlisted';
    published_at?: string;
    published_to_gundb?: boolean;
    published_to_ap?: boolean;
    license?: string;
    track_ids?: (string | number)[];
    tracks?: Track[]; // Compat with existing code
    release_tracks?: ReleaseTrack[];
    downloadCount?: number;
    unlockCodeCount?: number;
}

export interface Artist {
    id: string;
    name: string;
    slug?: string;
    description?: string;
    bio?: string;
    coverImage?: string;
    postParams?: any; // ActivityPub actor
    albums?: Album[];
    links?: ArtistLink[];
    donationLinks?: ArtistLink[];
    walletAddress?: string;
}

export interface ArtistLink {
    platform: string;
    url: string;
    type: 'social' | 'support' | 'music';
}

export interface Album {
    id: string;
    title: string;
    artistId: string;
    artistName?: string;
    artistSlug?: string; // camelCase (if mapped)
    artist_slug?: string; // snake_case (from DB)
    artist_name?: string; // snake_case (from DB)
    coverImage?: string;
    year?: number;
    tracks?: Track[];
    track_ids?: number[];
    type: 'album' | 'single' | 'ep';
    slug?: string;
    description?: string;
    license?: string;
    is_release?: boolean;
    download?: 'free' | 'paid' | 'codes';
    external_links?: string; // JSON string
    price?: number;
    walletAddress?: string;
}

export interface Playlist {
    id: string;
    name: string;
    description?: string;
    userId: string;
    isPublic: boolean;
    coverPath?: string;
    tracks?: Track[];
    trackCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface User {
    id: string;
    username: string;
    isAdmin: boolean;
    isRootAdmin?: boolean;
    artistId?: string;
    mustChangePassword?: boolean;
}

export interface AuthStatus {
    authenticated: boolean;
    username?: string;
    user?: User;
    role?: string;
    artistId?: string | number;
    firstRun?: boolean;
    mustChangePassword?: boolean;
    pair?: any; // Added GunDB identity pair
}

export interface SiteSettings {
    siteName: string;
    siteDescription?: string;
    coverImage?: string;
    publicUrl?: string;
    allowPublicRegistration?: boolean;
    backgroundImage?: string;
    donationLinks?: ArtistLink[];
    gunPeers?: string;
    web3_checkout_address?: string;
    web3_nft_address?: string;
}

export interface Post {
    id: string;
    slug: string;
    content: string; // HTML/Markdown
    artistId: string;
    artistName?: string;
    artistAvatar?: string;
    createdAt: string;
    publishedAt?: string;
    updatedAt: string;
    isPublic: boolean;
    visibility?: 'public' | 'private' | 'unlisted';
}

export interface UnlockCode {
    code: string;
    releaseId: string;
    isRedeemed: boolean;
    isUsed?: boolean;      // Alias for isRedeemed
    is_used?: number;      // DB field alias
    redeemedAt?: string;
    createdAt: string;
}

export interface NetworkSite {
    url: string;
    name: string;
    description: string;
    version: string;
    lastSeen: string;
    coverImage?: string;
    federation?: 'gundb' | 'activitypub';
}

export interface NetworkTrack {
    track: Track;
    siteName: string;
    siteUrl: string;
    federation?: 'gundb' | 'activitypub';
    // For ActivityPub tracks (flattened structure)
    audioUrl?: string;
    title?: string;
    artistName?: string;
    slug?: string;
    duration?: number;
    coverUrl?: string;
    releaseTitle?: string;
}

export interface AdminStats {
    totalUsers: number;
    totalArtists?: number; // Optional as backend uses 'artists'
    artists?: number;
    totalAlbums?: number; // Optional as backend uses 'albums'
    albums?: number;
    totalTracks: number;
    tracks?: number;
    publicAlbums?: number;
    storageUsed: number;
    networkSites: number;
    genresCount?: number;
}

export interface GunProfile {
    pub: string;
    alias: string;
    epub: string;
    profile?: {
        avatar?: string;
        bio?: string;
    };
}

export interface UserPlaylistTrack {
    id: string;
    title: string;
    artistName: string;
    source: 'tunecamp' | 'network';
    siteUrl?: string;      // For network tracks
    siteName?: string;     // For network tracks
    streamUrl?: string;    // Direct stream URL
    coverUrl?: string;
    albumName?: string;
    albumId?: string;
    duration?: number;
    addedAt: number;
    // Original TuneCamp track ID (for reference, if from tunecamp)
    tunecampTrackId?: string;
}

export interface UserPlaylist {
    id: string;
    name: string;
    description?: string;
    coverUrl?: string;
    ownerPub: string;
    ownerAlias: string;
    isPublic?: boolean;
    createdAt: number;
    updatedAt: number;
    tracks: UserPlaylistTrack[];
    trackCount: number;
}

export interface NetworkStatus {
    gundb?: {
        connected: boolean;
        peers: number;
    };
    activitypub?: {
        enabled: boolean;
    };
}
