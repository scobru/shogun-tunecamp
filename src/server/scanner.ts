import path from "path";
import fs from "fs-extra";
import chokidar, { type FSWatcher } from "chokidar";
import { parseFile } from "music-metadata";
import { parse } from "yaml";
import os from "os";

import type { DatabaseService, Artist, Album, Track } from "./database.js";
import { WaveformService } from "./waveform.js";
import { slugify, getStandardCoverFilename } from "../utils/audioUtils.js";
import { convertWavToMp3, getDurationFromFfmpeg } from "./ffmpeg.js";
import { getFileHash, getFastFileHash } from "../utils/fileUtils.js";

/**
 * Simple sequential processing queue to avoid over-parallelizing heavy tasks (ffmpeg, conversion)
 */
class ProcessingQueue {
    private queue: (() => Promise<any>)[] = [];
    private processing = false;
    private MAX_QUEUE_SIZE = 500;

    async add<T>(task: () => Promise<T>): Promise<T> {
        if (this.queue.length >= this.MAX_QUEUE_SIZE) {
            console.warn(`[Queue] Maximum queue size (${this.MAX_QUEUE_SIZE}) reached. Throttling...`);
            // Instead of dropping, we'll wait for space if called with await, 
            // but since most add() calls are fire-and-forget in scanner, we'll just wait a bit
            await new Promise(r => setTimeout(r, 1000));
        }

        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
            this.process();
        });
    }

    private async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                try {
                    await task();
                } catch (e) {
                    // Task handles its own rejection, but we catch to ensure loop continues
                }
            }
        }

        this.processing = false;
    }

    public get size(): number {
        return this.queue.length;
    }
}

/**
 * Robust wrapper for music-metadata parseFile with retry mechanism.
 * Helps avoid RangeError and FileHandle issues with freshly converted/moved files.
 */
async function parseFileWithRetry(filePath: string, retries = 3, delay = 500): Promise<any> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await parseFile(filePath, { skipCovers: true });
        } catch (err) {
            lastError = err;
            // Only retry on potential race condition errors
            const isRangeError = err instanceof RangeError || (err as any)?.code === 'ERR_OUT_OF_RANGE';
            if (isRangeError || (err as any)?.code === 'EBUSY' || (err as any)?.code === 'ENOENT') {
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
                    continue;
                }
            }
            throw err;
        }
    }
    throw lastError;
}

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
// Note: WAV files will be auto-converted to MP3 on import for better streaming support

interface ArtistConfig {
    name: string;
    bio?: string;
    image?: string;  // Legacy field
    avatar?: string; // New avatar field
    links?: any[];   // Array of link objects
}

interface ReleaseConfig {
    title: string;
    date?: string;
    description?: string;
    cover?: string;
    genres?: string[];
    artist?: string; // Override artist
    type?: 'album' | 'single' | 'ep'; // Added
    year?: number; // Added
    download?: string; // 'free' | 'paid'
    links?: { label: string; url: string }[] | { [key: string]: string }; // Array or Object
    metadata?: {
        tracks?: any[];
    };
}

interface ExternalLink {
    label: string;
    url: string;
}

export interface ScanResult {
    successful: Array<{ originalPath: string; message: string; convertedPath?: string }>;
    failed: Array<{ originalPath: string; message: string }>;
}

export interface ScannerService {
    scanDirectory(dir: string): Promise<ScanResult>;
    startWatching(dir: string): void;
    stopWatching(): void;
    processAudioFile(filePath: string, musicDir: string, overrideArtistId?: number, ownerId?: number, overrideAlbumId?: number, suggestedCoverPath?: string): Promise<{ originalPath: string, success: boolean, message: string, convertedPath?: string, trackId?: number, queuedConversion?: boolean } | null>;
    getOrCreateLibraryAlbum(dir: string, musicDir: string, forcedCoverPath?: string): Promise<number | null>;
    consolidateFiles(musicDir: string): Promise<{ success: number, failed: number, skipped: number }>;
    clearCaches(): void;
}

export class Scanner implements ScannerService {
    private watcher: FSWatcher | null = null;
    private isScanning = false;
    private pendingScan: Promise<ScanResult> | null = null;
    private processQueue = new ProcessingQueue();

    // Map directory paths to album IDs to efficiently link tracks
    private folderToAlbumMap = new Map<string, number>();
    // Map directory paths to artist IDs
    private folderToArtistMap = new Map<string, number>();
    // Map directory paths to EXISTING album IDs (from DB scan)
    private folderToExistingAlbumMap = new Map<string, number>();
    private lastGcTime = Date.now();

    /**
     * Clears all session-based caches to free up memory
     */
    public clearCaches(): void {
        this.folderToAlbumMap.clear();
        this.folderToArtistMap.clear();
        this.folderToExistingAlbumMap.clear();
        
        // Check memory usage to be more aggressive if needed
        const mem = process.memoryUsage();
        const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
        const shouldForceGc = heapUsedMB > 1500; // Force GC if heap usage is above 1.5GB
        
        // Suggest a GC if we haven't done one in a while (and if exposed)
        if (typeof global.gc === 'function' && (shouldForceGc || Date.now() - this.lastGcTime > 60000)) {
            try {
                if (shouldForceGc) console.log(`[Memory] High heap usage (${heapUsedMB}MB), explicitly requesting GC...`);
                global.gc();
                this.lastGcTime = Date.now();
            } catch (e) {}
        }
    }

    // Keep track of the monitored music directory
    private musicDirectory: string | null = null;

    private hashingSemaphore = 0;
    private readonly MAX_CONCURRENT_HASHING = 2; // Keep it low to avoid OOM
    private isConsolidating = false;

    private scannerStartTime = Date.now();
    private readonly WATCHER_STARTUP_DELAY = 60000; // Ignore unlinks for 60s

    constructor(private database: DatabaseService) { }

    /**
     * Get or create an implicit 'Library' album for a directory that doesn't have a release.yaml
     */
    public async getOrCreateLibraryAlbum(dir: string, musicDir: string, forcedCoverPath?: string): Promise<number | null> {
        // Normalize dir relative to musicDir
        const relativeDir = this.normalizePath(dir, musicDir);
        if (relativeDir === "." || relativeDir === "") return null;

        // Check if we already mapped this in this session
        if (this.folderToAlbumMap.has(dir)) return this.folderToAlbumMap.get(dir)!;

        // Check if an album already exists with this slug (relative path based)
        const folderName = path.basename(dir);
        const slug = slugify("lib-" + relativeDir); 
        let album = this.database.getAlbumBySlug(slug);

        if (album) {
            // Update/Refresh cover art if missing OR if a forced cover path is provided
            if (!album.cover_path || forcedCoverPath) {
                let coverPath = forcedCoverPath ? this.normalizePath(forcedCoverPath, musicDir) : null;
                
                if (!coverPath) {
                    const coverNames = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png", "artwork.jpg", "artwork.png"];
                    for (const name of coverNames) {
                        const p = path.resolve(dir, name);
                        if (await fs.pathExists(p)) {
                            coverPath = this.normalizePath(p, musicDir);
                            break;
                        }
                    }
                }

                if (coverPath && coverPath !== album.cover_path) {
                    this.database.updateAlbumCover(album.id, coverPath);
                }
            }

            this.folderToAlbumMap.set(dir, album.id);
            return album.id;
        }

        // Resolve cover art - Scan for common filenames in the directory
        let coverPath: string | null = forcedCoverPath ? this.normalizePath(forcedCoverPath, musicDir) : null;
        
        if (!coverPath) {
            const coverNames = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png", "artwork.jpg", "artwork.png"];
            for (const name of coverNames) {
                const p = path.resolve(dir, name);
                if (await fs.pathExists(p)) {
                    coverPath = this.normalizePath(p, musicDir);
                    break;
                }
            }
        }

        // Create new library album
        const albumId = this.database.createAlbum({
            title: folderName,
            slug: slug,
            artist_id: null, // Will be fixed by fixOrphanAlbums later
            owner_id: null,
            date: null,
            cover_path: coverPath,
            genre: "Library",
            description: `Auto-generated album for folder ${folderName}`,
            type: 'album',
            year: null,
            download: null,
            price: 0,
            price_usdc: 0,
            currency: 'ETH',
            external_links: null,
            is_public: false,
            visibility: 'private',
            is_release: false, // Explicitly NOT a release
            published_at: null,
            published_to_gundb: false,
            published_to_ap: false,
            license: null,
        });

        console.log(`  [Scanner] Created implicit library album: ${folderName} (ID ${albumId})`);
        this.folderToAlbumMap.set(dir, albumId);
        return albumId;
    }

    /**
     * Normalize path to be relative to musicDir and use forward slashes (POSIX style)
     */
    private normalizePath(filePath: string, musicDir: string): string {
        try {
            const absoluteMusicDir = path.resolve(musicDir);
            const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(musicDir, filePath);
            
            let relative = path.relative(absoluteMusicDir, absoluteFilePath).replace(/\\/g, "/");
            
            // Security: ensure we never return a path starting with ../ (stay inside music root)
            while (relative.startsWith("../")) {
                relative = relative.substring(3);
            }
            if (relative === "..") return ".";
            
            return relative;
        } catch (e) {
            console.error(`[Scanner] Error normalizing path: ${filePath}`, e);
            return filePath.replace(/\\/g, "/");
        }
    }

    private async processGlobalConfigs(rootDir: string, musicDir: string): Promise<void> {
        // Check for artist.yaml in root
        const artistPath = path.join(rootDir, "artist.yaml");
        if (await fs.pathExists(artistPath)) {
            try {
                const content = await fs.readFile(artistPath, "utf-8");
                const config = parse(content) as ArtistConfig;
                if (config.name) {
                    const existingArtist = this.database.getArtistByName(config.name);
                    let artistId: number;
                    // Use avatar field, fallback to image for legacy support
                    const avatarPath = config.avatar
                        ? this.normalizePath(path.resolve(rootDir, config.avatar), musicDir)
                        : (config.image ? this.normalizePath(path.resolve(rootDir, config.image), musicDir) : undefined);

                    if (existingArtist) {
                        artistId = existingArtist.id;
                        // Update artist with bio/photo/links if they're in the config
                        this.database.updateArtist(artistId, config.name, config.bio, avatarPath, config.links);
                        console.log(`  Found existing artist: ${config.name}`);
                    } else {
                        artistId = this.database.createArtist(config.name, config.bio, avatarPath, config.links);
                        console.log(`  Created artist from config: ${config.name}`);
                    }
                    this.folderToArtistMap.set(rootDir, artistId);
                }
            } catch (e) {
                console.error("Error parsing artist.yaml:", e);
            }
        }

        // Check for catalog.yaml (could contain artist info in some versions)
        const catalogPath = path.join(rootDir, "catalog.yaml");
        if (await fs.pathExists(catalogPath)) {
            try {
                const content = await fs.readFile(catalogPath, "utf-8");
                const config = parse(content);

                // Save site settings
                if (config.title) this.database.setSetting("siteName", config.title);
                if (config.description) this.database.setSetting("siteDescription", config.description);
                if (config.url) this.database.setSetting("siteUrl", config.url);

                // Save donation links
                if (config.donationLinks) {
                    this.database.setSetting("donationLinks", JSON.stringify(config.donationLinks));
                    console.log(`  Loaded donation links from catalog.yaml`);
                }

            } catch (e) {
                console.error("Error parsing catalog.yaml:", e);
            }
        }
    }

    private async processReleaseConfig(filePath: string, musicDir: string): Promise<void> {
        try {
            const dir = path.dirname(filePath);
            const content = await fs.readFile(filePath, "utf-8");
            const config = parse(content) as ReleaseConfig;

            if (!config.title) return;

            console.log(`  Found release config: ${config.title}`);

            // Determine artist
            let artistId: number | null = null;
            if (config.artist) {
                const existingArtist = this.database.getArtistByName(config.artist);
                artistId = existingArtist ? existingArtist.id : this.database.createArtist(config.artist);
            } else {
                let current = dir;
                while (current.length >= path.dirname(current).length) {
                    if (this.folderToArtistMap.has(current)) {
                        artistId = this.folderToArtistMap.get(current)!;
                        break;
                    }
                    const parent = path.dirname(current);
                    if (parent === current) break;
                    current = parent;
                }
            }

            // Resolve cover path
            let coverPath: string | null = null;
            if (config.cover) {
                const absoluteCoverPath = path.resolve(dir, config.cover);
                if (await fs.pathExists(absoluteCoverPath)) {
                    coverPath = this.normalizePath(absoluteCoverPath, musicDir);
                }
            } else {
                const coverNames = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png"];
                for (const name of coverNames) {
                    const p = path.resolve(dir, name);
                    if (await fs.pathExists(p)) {
                        coverPath = this.normalizePath(p, musicDir);
                        break;
                    }
                }
            }

            // Check for existing release by SLUG
            const slug = slugify(config.title);
            let existingRelease = this.database.getReleaseBySlug(slug);

            let releaseId: number;

            // Prepare external links
            let linksJson: string | null = null;
            if (config.links) {
                const links: ExternalLink[] = [];
                if (Array.isArray(config.links)) {
                    links.push(...config.links);
                } else {
                    for (const [label, url] of Object.entries(config.links)) {
                        links.push({ label, url: url as string });
                    }
                }
                linksJson = JSON.stringify(links);
            }

            if (existingRelease) {
                releaseId = existingRelease.id;
                this.database.updateRelease(releaseId, {
                    artist_id: artistId || existingRelease.artist_id,
                    cover_path: coverPath || existingRelease.cover_path,
                    genre: config.genres?.join(", ") || existingRelease.genre,
                    description: config.description || existingRelease.description,
                    download: config.download || existingRelease.download,
                    external_links: linksJson || existingRelease.external_links,
                    type: config.type || existingRelease.type,
                    year: config.year || existingRelease.year
                });
                console.log(`  Updated existing release config: ${existingRelease.title}`);
            } else {
                releaseId = this.database.createRelease({
                    title: config.title,
                    slug: slug,
                    artist_id: artistId,
                    owner_id: null,
                    date: config.date || null,
                    cover_path: coverPath,
                    genre: config.genres?.join(", ") || null,
                    description: config.description || null,
                    type: config.type || 'album',
                    year: config.year || (config.date ? new Date(config.date).getFullYear() : null),
                    download: config.download || null,
                    price: 0,
                    price_usdc: 0,
                    currency: 'ETH',                    external_links: linksJson,
                    visibility: 'private',
                    published_at: null,
                    published_to_gundb: false,
                    published_to_ap: false,
                    license: null,
                });
                console.log(`  Created release from config: ${config.title}`);
            }

            this.folderToAlbumMap.set(dir, releaseId);

            // Process external tracks
            if (config.metadata?.tracks) {
                for (const tc of config.metadata.tracks) {
                    if (tc.url) {
                        const trackTitle = tc.title || "External Track";
                        this.database.addTrackToRelease(releaseId, 0, {
                            title: trackTitle,
                            artist_name: config.artist || null,
                            track_num: tc.trackNum || tc.track || null,
                            duration: tc.duration || null,
                            file_path: tc.url,
                            price: 0,
                            price_usdc: 0,
                            currency: 'ETH'
                        });
                    }
                }
            }
        } catch (e) {
            console.error(`Error processing release config ${filePath}:`, e);
        }
    }

    public async processAudioFile(filePath: string, musicDir: string, overrideArtistId?: number, ownerId?: number, overrideAlbumId?: number, suggestedCoverPath?: string): Promise<{ originalPath: string, success: boolean, message: string, convertedPath?: string, trackId?: number, queuedConversion?: boolean } | null> {
        // Path sanitization: remove weird prefixes like '@@hnttf' or '@@krzst' and normalize slashes
        let currentFilePath = filePath
            .replace(/^@@[a-z0-9]+\\?/, "") // Remove generic junk prefix like @@tag\
            .replace(/\\/g, "/")           // Convert all backslashes to forward slashes
            .replace(/\/+/g, "/");         // Remove double slashes

        // If the path was absolute but with the junk prefix, it might now be relative or still have issues
        // We'll try to resolve it relative to the musicDir if it doesn't exist as an absolute path
        if (!path.isAbsolute(currentFilePath) && !await fs.pathExists(currentFilePath)) {
            const resolved = path.join(musicDir, currentFilePath);
            if (await fs.pathExists(resolved)) {
                currentFilePath = resolved;
            }
        }

        const ext = path.extname(currentFilePath).toLowerCase();
        const dir = path.dirname(currentFilePath);

        if (!AUDIO_EXTENSIONS.includes(ext)) {
            return null;
        }

        // 0. Calculate hash for deduplication
        // Concurrency control to avoid OOM
        while (this.hashingSemaphore >= this.MAX_CONCURRENT_HASHING) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        this.hashingSemaphore++;
        let hash: string | null = null;
        let metadata: any = null;
        const LOSSLESS_EXTENSIONS = ['.wav', '.flac'];
        const normalizedPath = this.normalizePath(currentFilePath, musicDir);
        let existing: any = this.database.getTrackByPath(normalizedPath);
        let albumId: number | null = overrideAlbumId || this.folderToAlbumMap.get(dir) || null;

        try {
            try {
                // Use fast hash first to check for duplicates quickly
                hash = await getFastFileHash(currentFilePath);
                const existingByHash = this.database.getTrackByHash(hash);

                if (existingByHash && ownerId) {
                    console.log(`    [Scanner] Deduplication: file hash matched existing track '${existingByHash.title}' (ID ${existingByHash.id})`);
                    
                    // Add ownership link
                    this.database.addTrackOwner(existingByHash.id, ownerId);
                    
                    // Update track.owner_id column if it's null (for simpler views)
                    if (existingByHash.owner_id === null) {
                        this.database.db.prepare("UPDATE tracks SET owner_id = ? WHERE id = ?").run(ownerId, existingByHash.id);
                    }
                    
                    // Also link the owner to the album if it exists
                    if (existingByHash.album_id) {
                        this.database.addAlbumOwner(existingByHash.album_id, ownerId);
                        
                        // Update album.owner_id column if it's null
                        const album = this.database.getAlbum(existingByHash.album_id);
                        if (album && album.owner_id === null) {
                            this.database.db.prepare("UPDATE albums SET owner_id = ? WHERE id = ?").run(ownerId, existingByHash.album_id);
                        }
                    }

                    // If the uploaded file is a temp file (from upload), we can safely remove it now
                    if (currentFilePath.includes(path.sep + 'tmp' + path.sep) || currentFilePath.includes('/tmp/')) {
                        await fs.remove(currentFilePath);
                    }

                    return { originalPath: filePath, success: true, message: "Duplicate content matched and linked to your library.", trackId: existingByHash.id };
                }
            } catch (e) {
                console.warn(`    [Scanner] Failed to calculate hash for ${currentFilePath}:`, e);
            }

            // If no album ID found and we're inside the music library, try to get or create an implicit library album
            if (albumId === null && dir.startsWith(musicDir)) {
                albumId = await this.getOrCreateLibraryAlbum(dir, musicDir, suggestedCoverPath);
            }

            // If track is in the "library" or "tracks" folder and map has no info, protect the existing link
            // This prevents the scanner from unlinking tracks that were manually uploaded/linked via API
            if (albumId === null && existing && existing.album_id &&
                (normalizedPath.startsWith('library') || normalizedPath.startsWith('tracks'))) {
                // console.log(`[Scanner] Protecting existing album link for ${normalizedPath}`);
                albumId = existing.album_id;
            }

            // 1. Try to find existing record by path or metadata for pairing
            if (!existing) {
                try {
                    // First try: Find by filename (basename) match in the same directory
                    // This handles cases where metadata is missing (e.g. fresh conversion) but filenames match (song.mp3 vs song.wav)
                    const baseName = path.basename(currentFilePath, ext);
                    const siblingExts = ['.wav', '.flac', '.mp3', '.m4a', '.ogg']; // Check common extensions

                    for (const sExt of siblingExts) {
                        if (sExt === ext) continue;
                        // Check against DB paths (relative)
                        const siblingPath = this.normalizePath(path.join(dir, baseName + sExt), musicDir);
                        const sibling = this.database.getTrackByPath(siblingPath);
                        if (sibling) {
                            existing = sibling;
                            console.log(`    [Scanner] Pairing: found existing record by filename match '${baseName}${sExt}' (Target: ${ext.toUpperCase()})`);
                            break;
                        }
                    }

                    // Second try: Find by metadata
                    if (!existing) {
                        try {
                            metadata = await parseFileWithRetry(currentFilePath);
                        } catch (e) {
                            console.warn(`    [Scanner] Failed to parse metadata (Try 2) for ${currentFilePath}:`, e);
                        }

                        if (metadata) {
                            const title = metadata.common.title || path.basename(currentFilePath, path.extname(currentFilePath));
                            const artistName = metadata.common.artist;

                            let artistId: number | null = overrideArtistId || null;
                            if (!artistId && artistName) {
                                const existingArtist = this.database.getArtistByName(artistName);
                                artistId = existingArtist ? existingArtist.id : null;
                            }

                            // Look for existing track by metadata in the same album
                            existing = this.database.getTrackByMetadata(title, artistId, albumId);
                            
                            if (existing) {
                                console.log(`    [Scanner] Pairing: found existing record by metadata match '${title}' (ID ${existing.id})`);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`    [Scanner] Error finding match for pairing lookup: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        
        // 2. Handle pairing if record exists
        if (existing) {
            // Update hash if missing
            if (hash && !existing.hash) {
                this.database.db.prepare("UPDATE tracks SET hash = ? WHERE id = ?").run(hash, existing.id);
            }

            // Ensure current user is an owner
            if (ownerId) {
                this.database.addTrackOwner(existing.id, ownerId);
                
                // Update track.owner_id column if it's null
                if (existing.owner_id === null) {
                    this.database.db.prepare("UPDATE tracks SET owner_id = ? WHERE id = ?").run(ownerId, existing.id);
                }

                if (existing.album_id) {
                    this.database.addAlbumOwner(existing.album_id, ownerId);
                    
                    // Update album.owner_id column if it's null
                    if (albumId) {
                        const album = this.database.getAlbum(existing.album_id);
                        if (album && album.owner_id === null) {
                            this.database.db.prepare("UPDATE albums SET owner_id = ? WHERE id = ?").run(ownerId, existing.album_id);
                        }
                    }
                }
            }

            const isLossless = LOSSLESS_EXTENSIONS.includes(ext);
            const mp3Path = isLossless ? normalizedPath.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3') : normalizedPath;

            // If we found an existing track and this is a lossless version of it
            if (isLossless && !existing.lossless_path) {
                console.log(`    [Scanner] Adding LOSSLESS path to existing track: ${existing.title}`);
                this.database.updateTrackLosslessPath(existing.id, normalizedPath);
            }
            if (existing.file_path) {
                const oldExt = path.extname(existing.file_path).toLowerCase();
                if (LOSSLESS_EXTENSIONS.includes(oldExt)) {
                    console.log(`    [Scanner] Swapping primary path to MP3 and moving ${oldExt.toUpperCase()} to lossless_path`);
                    this.database.updateTrackLosslessPath(existing.id, existing.file_path);
                    this.database.updateTrackPath(existing.id, mp3Path, albumId);
                } else {
                    // Just update the path if it's different and not a swap
                    this.database.updateTrackPath(existing.id, mp3Path, albumId);
                }
            } else {
                // Update path if it was null
                this.database.updateTrackPath(existing.id, mp3Path, albumId);
            }

            // Ensure linked to album
            if (existing.album_id !== albumId) {
                this.database.updateTrackAlbum(existing.id, albumId);
            }

            // Process waveform if missing
            if (!existing.waveform) {
                const duration = existing.duration || undefined;
                const trackId = existing.id;
                this.processQueue.add(() => WaveformService.generateWaveform(currentFilePath, 100, duration))
                    .then((peaks: number[]) => {
                        this.database.updateTrackWaveform(trackId, JSON.stringify(peaks));
                    }).catch(() => { });
            }

            // Cleanup local references before returning
            const finalExistingId = existing.id;
            existing = null;
            return { originalPath: filePath, success: true, message: "Track paired/updated.", trackId: finalExistingId };
        }

        try {
            // Log memory usage occasionally to monitor health during heavy processing
            if (Math.random() < 0.1) {
                const mem = process.memoryUsage();
                console.log(`[Scanner] Memory state: Heap used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / Total: ${Math.round(mem.heapTotal / 1024 / 1024)}MB / RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
            }

            console.log("  Processing track: " + path.basename(currentFilePath));
            if (!metadata) {
                metadata = await parseFileWithRetry(currentFilePath);
            }
            const common = metadata.common;
            const format = metadata.format;

            let artistId: number | null = overrideArtistId || null;
            if (!artistId) {
                if (common.artist) {
                    const existingArtist = this.database.getArtistByName(common.artist);
                    artistId = existingArtist ? existingArtist.id : this.database.createArtist(common.artist);
                } else {
                    const unknownArtist = this.database.getArtistByName("Unknown Artist");
                    artistId = unknownArtist ? unknownArtist.id : this.database.createArtist("Unknown Artist");
                }
            }

            let duration: number | null = await getDurationFromFfmpeg(currentFilePath);
            if (duration == null || !Number.isFinite(duration) || duration <= 0) {
                const metaDuration = format.duration;
                const parsed = metaDuration != null ? parseFloat(String(metaDuration)) : NaN;
                duration = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
                if (duration != null) {
                    console.log(`    [Scanner] Using metadata duration: ${duration}s`);
                }
            }

            const isLossless = LOSSLESS_EXTENSIONS.includes(ext);
            const trackId = this.database.createTrack({
                title: common.title || path.basename(currentFilePath, ext),
                album_id: albumId, // Linked to album from release.yaml
                artist_id: artistId,
                owner_id: ownerId || null, // Updated to use User ID only
                track_num: common.track?.no || null,
                duration: duration || null,
                file_path: isLossless ? this.normalizePath(currentFilePath.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3'), musicDir) : this.normalizePath(currentFilePath, musicDir),
                format: isLossless ? 'mp3' : (format.codec || ext.substring(1)),
                bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
                sample_rate: format.sampleRate || null,
                lossless_path: isLossless ? this.normalizePath(currentFilePath, musicDir) : null,
                waveform: null,
                url: null,
                service: null,
                external_artwork: null,
                price: 0,
                price_usdc: 0,
                currency: 'ETH',
                hash: hash // Store the hash
            });

            // Throttle queue if it's getting too big
            if (this.processQueue.size > 200) {
                console.log(`[Queue] Throttling track indexing while queue clears (${this.processQueue.size} tasks pending)...`);
                await new Promise(r => setTimeout(r, 2000));
            }

            this.processQueue.add(() => WaveformService.generateWaveform(currentFilePath, 100, duration || undefined))
                .then((peaks: number[]) => {
                    const json = JSON.stringify(peaks);
                    this.database.updateTrackWaveform(trackId, json);
                    console.log(`    Generated waveform for: ${path.basename(currentFilePath)}`);
                })
                .catch(err => {
                    console.error(`    Waveform generation failed for ${path.basename(currentFilePath)}:`, err.message);
                });

            // Queue background conversion for WAVs
            let queuedConversion = false;
            if (filePath.toLowerCase().endsWith(".wav") && currentFilePath === filePath) {
                queuedConversion = true;
                console.log(`    [Scanner] Awaiting WAV to MP3 conversion for: ${path.basename(filePath)}`);
                try {
                    await this.processQueue.add(() => convertWavToMp3(filePath));
                } catch (err) {
                    console.error(`    [Scanner] WAV conversion failed:`, err);
                    // We still have the WAV, so we could technically fall back, 
                    // but the user wants MP3 for streaming.
                }
            }

            return { originalPath: filePath, success: true, message: "Track processed successfully.", convertedPath: currentFilePath !== filePath ? currentFilePath : undefined, trackId: trackId, queuedConversion };

        } catch (error) {
            console.error("  Error processing " + currentFilePath + ":", error);
            return { originalPath: filePath, success: false, message: `Error processing audio file: ${error instanceof Error ? error.message : String(error)}` };
        } finally {
            metadata = null; // Explicit nulling to help GC
        }
    } catch (error) {
        console.error("  Unexpected error in Scanner.processAudioFile:", error);
        return { originalPath: filePath, success: false, message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` };
    } finally {
        this.hashingSemaphore--;
    }
}

    public async scanDirectory(dir: string): Promise<ScanResult> {
        if (this.isScanning) {
            console.log("  [Scanner] Scan already in progress, waiting for it to complete...");
            return this.pendingScan || Promise.resolve({ successful: [], failed: [] });
        }

        this.musicDirectory = dir; // Remember for watcher

        this.isScanning = true;
        this.pendingScan = (async () => {
            try {
                return await this.doScan(dir);
            } finally {
                this.isScanning = false;
                this.pendingScan = null;
            }
        })();

        return this.pendingScan;
    }

    private async mapFoldersToExistingAlbums(): Promise<void> {
        this.folderToExistingAlbumMap.clear();
        this.folderToAlbumMap.clear(); // Important: clear session maps
        this.folderToArtistMap.clear();

        // Use iterative prepared statement to avoid loading all tracks into memory
        const stmt = this.database.db.prepare("SELECT album_id, file_path FROM tracks WHERE album_id IS NOT NULL AND file_path IS NOT NULL");
        const counts = new Map<string, Map<number, number>>();

        for (const track of stmt.iterate() as Iterable<any>) {
            // track.file_path is relative to musicDir, stored with forward slashes
            const dir = path.dirname(track.file_path).replace(/\\/g, "/");

            if (!counts.has(dir)) {
                counts.set(dir, new Map());
            }
            const albumCounts = counts.get(dir)!;
            albumCounts.set(track.album_id, (albumCounts.get(track.album_id) || 0) + 1);
        }

        // Determine winner for each folder
        for (const [dir, albumCounts] of counts.entries()) {
            let maxCount = 0;
            let bestAlbumId = -1;

            for (const [albumId, count] of albumCounts.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    bestAlbumId = albumId;
                }
            }

            if (bestAlbumId !== -1) {
                this.folderToExistingAlbumMap.set(dir, bestAlbumId);
            }
        }
        console.log(`[Scanner] Mapped ${this.folderToExistingAlbumMap.size} folders to existing DB albums.`);
    }

    private async doScan(dir: string): Promise<ScanResult> {
        console.log("Scanning directory: " + dir);

        if (!(await fs.pathExists(dir))) {
            console.warn("Directory does not exist: " + dir);
            return { successful: [], failed: [] };
        }

        // Pre-scan DB to identify renamed albums
        await this.mapFoldersToExistingAlbums();

        // Reset maps
        this.folderToAlbumMap.clear();
        this.folderToArtistMap.clear();

        const audioFiles: string[] = [];
        const yamlFiles: string[] = [];

        // 1. Discover all files
        const walkDir = async (currentDir: string): Promise<void> => {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    await walkDir(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (AUDIO_EXTENSIONS.includes(ext)) {
                        audioFiles.push(fullPath);
                    } else if (ext === ".yaml" || ext === ".yml") {
                        yamlFiles.push(fullPath);
                    }
                }
            }));
        }

        await walkDir(dir);
        console.log(`Found ${audioFiles.length} audio file(s) and ${yamlFiles.length} YAML config(s)`);

        // Build knownFiles Set for optimized cleanup
        const knownFiles = new Set<string>();
        const isCaseInsensitive = process.platform === 'win32' || process.platform === 'darwin';

        for (const f of audioFiles) {
            const normalized = this.normalizePath(f, dir);
            knownFiles.add(isCaseInsensitive ? normalized.toLowerCase() : normalized);
        }

        // 2. Process Global and Artist configs first
        const globalConfigs = yamlFiles.filter(f => f.endsWith("artist.yaml") || f.endsWith("catalog.yaml"));
        for (const configPath of globalConfigs) {
            await this.processGlobalConfigs(path.dirname(configPath), dir);
        }

        // 3. Process Release configs
        const releaseConfigs = yamlFiles.filter(f => f.endsWith("release.yaml"));
        const releaseDirs = new Set(releaseConfigs.map(f => path.dirname(f)));

        for (const configPath of releaseConfigs) {
            await this.processReleaseConfig(configPath, dir);
        }

        // 3b. Create implicit albums for directories with audio but NO release.yaml
        const audioDirs = new Set(audioFiles.map(f => path.dirname(f)));
        for (const audioDir of audioDirs) {
            if (!releaseDirs.has(audioDir)) {
                await this.getOrCreateLibraryAlbum(audioDir, dir);
            }
        }

        const successful: Array<{ originalPath: string; message: string; convertedPath?: string }> = [];
        const failed: Array<{ originalPath: string; message: string }> = [];

        // 4. Process Audio Files in batches to manage memory and load
        const BATCH_SIZE = 50;
        for (let i = 0; i < audioFiles.length; i += BATCH_SIZE) {
            const batch = audioFiles.slice(i, i + BATCH_SIZE);
            
            // Periodically request GC during large scans
            if (i > 0 && i % 100 === 0 && (global as any).gc) {
                console.log("[Scanner] Requesting manual Garbage Collection...");
                (global as any).gc();
            }

            console.log(`[Scanner] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(audioFiles.length / BATCH_SIZE)} (${batch.length} files)`);
            
            for (const file of batch) {
                const result = await this.processAudioFile(file, dir);
                if (result) {
                    if (result.success) {
                        successful.push(result);
                    } else {
                        failed.push(result);
                    }

                    // If a conversion was queued, add the expected MP3 path to knownFiles
                    if (result.queuedConversion) {
                        const ext = path.extname(file).toLowerCase();
                        if (['.wav', '.flac'].includes(ext)) {
                            const mp3Path = this.normalizePath(file.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3'), dir);
                            knownFiles.add(isCaseInsensitive ? mp3Path.toLowerCase() : mp3Path);
                        }
                    }
                }
            }
            
            // Allow event loop to breathe after each batch
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Clean up duplicates
        let allTracks = this.database.getTracks();
        allTracks = await this.deduplicateTracks(allTracks);

        // Clean up stale records
        await this.cleanupStaleTracks(dir, knownFiles, allTracks);

        // Fix orphan albums
        await this.fixOrphanAlbums();

        this.clearCaches(); // Final cleanup after full scan
        return { successful, failed };
    }

    private async fixOrphanAlbums() {
        console.log("[Scanner] Checking for orphan albums/releases to fix...");
        try {
            // 1. Fix library albums
            const orphanAlbums = this.database.db.prepare("SELECT * FROM albums WHERE artist_id IS NULL").all() as Album[];
            for (const orphan of orphanAlbums) {
                const tracks = this.database.getTracks(orphan.id);
                if (tracks.length === 0) {
                    console.log(`  [Scanner] Deleting empty library album "${orphan.title}" (ID ${orphan.id})`);
                    this.database.deleteAlbum(orphan.id);
                    continue;
                }
                const artistIds = [...new Set(tracks.map(t => t.artist_id).filter(id => id !== null))];
                if (artistIds.length === 1) {
                    const artistId = artistIds[0];
                    console.log(`  [Scanner] Fixing orphan library album "${orphan.title}" (ID ${orphan.id}) -> Artist ID ${artistId}`);
                    this.database.updateAlbumArtist(orphan.id, artistId!);
                }
            }

            // 2. Fix releases
            const orphanReleases = this.database.db.prepare("SELECT * FROM releases WHERE artist_id IS NULL").all() as any[];
            for (const orphan of orphanReleases) {
                const tracks = this.database.getTracksByReleaseId(orphan.id);
                if (tracks.length === 0) continue;
                const artistIds = [...new Set(tracks.map(t => t.artist_id).filter(id => id !== null))];
                if (artistIds.length === 1) {
                    const artistId = artistIds[0];
                    console.log(`  [Scanner] Fixing orphan release "${orphan.title}" (ID ${orphan.id}) -> Artist ID ${artistId}`);
                    this.database.updateRelease(orphan.id, { artist_id: artistId! });
                }
            }
        } catch (e) {
            console.error("  [Scanner] Error fixing orphan albums:", e);
        }
    }

    private groupTracksForDeduplication(tracks: Track[]): Map<string, Track[]> {
        const groups = new Map<string, Track[]>();
        for (const track of tracks) {
            const key = `${track.album_id || 0}|${track.artist_id || 0}|${track.title.toLowerCase().trim()}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(track);
        }
        return groups;
    }

    private migrateLosslessPath(primary: Track, other: Track): void {
        if (other.lossless_path && !primary.lossless_path) {
            this.database.updateTrackLosslessPath(primary.id, other.lossless_path);
            primary.lossless_path = other.lossless_path;
        } else if (!primary.lossless_path) {
            const otherExt = path.extname(other.file_path || '').toLowerCase();
            if (['.wav', '.flac'].includes(otherExt)) {
                this.database.updateTrackLosslessPath(primary.id, other.file_path!);
                primary.lossless_path = other.file_path;
            }
        }
    }

    private mergeDuplicateGroup(groupTracks: Track[], tracksToRemove: Set<number>): number {
        let mergedInGroup = 0;
        // Find primary (MP3) and lossless among duplicates
        const primary = groupTracks.find(t => path.extname(t.file_path || '').toLowerCase() === '.mp3') || groupTracks[0];
        const others = groupTracks.filter(t => t.id !== primary.id);

        for (const other of others) {
            console.log(`  [Dedupe] Merging duplicate track: ${other.title} (ID ${other.id}) into ID ${primary.id}`);

            this.migrateLosslessPath(primary, other);

            // Delete the duplicate
            this.database.deleteTrack(other.id);
            tracksToRemove.add(other.id);
            mergedInGroup++;
        }
        return mergedInGroup;
    }

    private async deduplicateTracks(tracks: Track[]): Promise<Track[]> {
        console.log("[Scanner] Checking for duplicate tracks to merge...");

        const groups = this.groupTracksForDeduplication(tracks);
        const tracksToRemove = new Set<number>();
        let merged = 0;

        for (const groupTracks of groups.values()) {
            if (groupTracks.length > 1) {
                merged += this.mergeDuplicateGroup(groupTracks, tracksToRemove);
            }
        }

        if (merged > 0) {
            console.log(`[Scanner] Merged ${merged} duplicate track(s).`);
            // Explicitly clear groups Map to free memory early
            groups.clear();
        }

        return tracks.filter(t => !tracksToRemove.has(t.id));
    }


    private async cleanupStaleTracks(musicDir: string, knownFiles: Set<string>, allTracks: Track[]) {
        console.log("[Scanner] Cleaning up stale database records...");
        const isCaseInsensitive = process.platform === 'win32' || process.platform === 'darwin';

        let removed = 0;
        // Process in smaller batches of track objects
        const TRACK_BATCH = 100;
        for (let i = 0; i < allTracks.length; i += TRACK_BATCH) {
            const batch = allTracks.slice(i, i + TRACK_BATCH);
            
            for (const track of batch) {
                if (!track.file_path) continue; // Skip external tracks for file existence check

                // Check if primary file exists using knownFiles Set (O(1))
                const primaryKey = isCaseInsensitive ? track.file_path.toLowerCase() : track.file_path;
                const primaryExists = knownFiles.has(primaryKey);

                // Check if lossless file exists
                const losslessKey = track.lossless_path ? (isCaseInsensitive ? track.lossless_path.toLowerCase() : track.lossless_path) : null;
                const losslessExists = losslessKey ? knownFiles.has(losslessKey) : false;

                if (!primaryExists && !losslessExists) {
                    console.warn(`  [Cleanup] Track removed (file missing): ${track.title}`);
                    this.database.deleteTrack(track.id);
                    removed++;
                } else if (!primaryExists && losslessExists) {
                    console.warn(`  [Cleanup] Track ${track.title} missing MP3 (${track.file_path}) but has Lossless. Keeping record.`);

                    // Re-queue regeneration if needed
                    if (track.lossless_path) {
                        const resolvedLossless = path.join(musicDir, track.lossless_path);
                        this.processQueue.add(() => convertWavToMp3(resolvedLossless).catch(console.error));
                    }
                } else if (primaryExists && track.lossless_path && !losslessExists) {
                    console.log(`  [Cleanup] Track ${track.title} missing lossless file (${track.lossless_path}). Updating record.`);
                    this.database.updateTrackLosslessPath(track.id, null);
                }
            }
            
            // Safety: yield to GC
            if (i % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }

        if (removed > 0) {
            console.log(`[Scanner] Removed ${removed} stale track(s).`);
        }
    }

    public startWatching(dir: string): void {
        this.musicDirectory = dir; // Ensure set

        if (this.watcher) {
            this.watcher.close();
        }

        console.log("Watching for changes in: " + dir);

        this.watcher = chokidar.watch(dir, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            }
        });

        this.watcher.on("add", async (filePath: string) => {
            if (this.isConsolidating) return;
            const ext = path.extname(filePath).toLowerCase();
            if (AUDIO_EXTENSIONS.includes(ext)) {
                await this.processAudioFile(filePath, dir);
            }
        });

        this.watcher.on("unlink", async (filePath: string) => {
            if (this.isConsolidating) return;
            // Note: normalizing path here because DB stores relative
            const relativePath = this.normalizePath(filePath, dir);
            const track = this.database.getTrackByPath(relativePath);

            if (track) {
                // If checking the primary file
                const losslessPath = track.lossless_path ? path.join(dir, track.lossless_path) : null;
                if (losslessPath && await fs.pathExists(losslessPath)) {
                    console.log(`[Watcher] Primary file ${relativePath} deleted, but lossless backup exists. Queuing regeneration.`);
                    this.processQueue.add(() => convertWavToMp3(losslessPath!).catch(console.error));
                    return;
                }

                const timeSinceStart = Date.now() - this.scannerStartTime;
                if (timeSinceStart < this.WATCHER_STARTUP_DELAY) {
                    console.log(`[Watcher] Ignoring unlink during startup period: ${relativePath}`);
                    return;
                }

                console.log(`[Watcher] Primary file ${relativePath} deleted. DELETION DISABLED.`);
                // this.database.deleteTrack(track.id);
            } else {
                // It might be the lossless file.
                // Since we don't have an easy lookup, we'll let the next scan/cleanup handle updating the DB.
            }
        });
    }

    public stopWatching(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }

    public async consolidateFiles(musicDir: string): Promise<{ success: number, failed: number, skipped: number }> {
        if (this.isConsolidating) {
            console.log("[Scanner] Consolidation already in progress, skipping.");
            return { success: 0, failed: 0, skipped: 0 };
        }

        console.log("[Scanner] Starting file consolidation (Memory-Efficient Mode)...");
        this.isConsolidating = true;
        
        try {
            let success = 0;
            let failed = 0;
            let skipped = 0;
            let processedCount = 0;

            const artistCache = new Map<number, any>();
            const BATCH_SIZE = 20;

            const trackIterator = this.database.iterateTracks("file_path IS NOT NULL");
            
            for (const track of trackIterator) {
                try {
                    let artist = null;
                    if (track.artist_id) {
                        if (artistCache.has(track.artist_id)) {
                            artist = artistCache.get(track.artist_id);
                        } else {
                            artist = this.database.getArtist(track.artist_id);
                            artistCache.set(track.artist_id, artist);
                            if (artistCache.size > 100) artistCache.clear();
                        }
                    }

                    const artistName = artist?.name || "Unknown Artist";
                    const cleanTitle = (track.title || "Untitled").trim();
                    const cleanArtist = artistName.trim();
                    
                    const safeName = (name: string) => name.replace(/[^a-zA-Z0-9\s._-]/g, "_").trim();
                    const newBaseName = `${safeName(cleanArtist)} - ${safeName(cleanTitle)}`;
                    
                    const oldPath = track.file_path;
                    const ext = path.extname(oldPath).toLowerCase();
                    const newPath = path.join(path.dirname(oldPath), `${newBaseName}${ext}`).replace(/\\/g, "/");

                    const oldLossless = track.lossless_path;
                    let newLossless = null;
                    if (oldLossless) {
                        const lExt = path.extname(oldLossless).toLowerCase();
                        newLossless = path.join(path.dirname(oldLossless), `${newBaseName}${lExt}`).replace(/\\/g, "/");
                    }

                    if (oldPath === newPath && (!oldLossless || oldLossless === newLossless)) {
                        skipped++;
                        processedCount++;
                        continue;
                    }

                    let movedAny = false;
                    let finalDBPath = newPath;

                    // Move primary
                    const fullOldPath = path.join(musicDir, oldPath);
                    const fullNewPath = path.join(musicDir, newPath);

                    if (fullOldPath !== fullNewPath && await fs.pathExists(fullOldPath)) {
                        let finalNewPath = fullNewPath;
                        const isSameFile = fullOldPath.toLowerCase() === fullNewPath.toLowerCase();

                        if (await fs.pathExists(fullNewPath) && !isSameFile) {
                            const uniqueSuffix = `_${track.id}`;
                            finalNewPath = path.join(path.dirname(fullNewPath), `${newBaseName}${uniqueSuffix}${ext}`);
                            finalDBPath = path.join(path.dirname(newPath), `${newBaseName}${uniqueSuffix}${ext}`).replace(/\\/g, "/");
                        }

                        if (oldPath !== finalDBPath) {
                            await fs.move(fullOldPath, finalNewPath, { overwrite: true });
                            this.database.updateTrackPath(track.id, finalDBPath, track.album_id);
                            movedAny = true;
                        }
                    }

                    // Move lossless
                    if (oldLossless && newLossless && oldLossless !== newLossless) {
                        const fullOldLossless = path.join(musicDir, oldLossless);
                        const fullNewLossless = path.join(musicDir, newLossless);
                        if (await fs.pathExists(fullOldLossless)) {
                            let finalNewLossless = fullNewLossless;
                            let finalDBLossless = newLossless;
                            const lExt = path.extname(oldLossless).toLowerCase();
                            const isSameLossless = fullOldLossless.toLowerCase() === fullNewLossless.toLowerCase();

                            if (await fs.pathExists(fullNewLossless) && !isSameLossless) {
                                const uniqueSuffix = `_${track.id}`;
                                finalNewLossless = path.join(path.dirname(fullNewLossless), `${newBaseName}${uniqueSuffix}${lExt}`);
                                finalDBLossless = path.join(path.dirname(newLossless), `${newBaseName}${uniqueSuffix}${lExt}`).replace(/\\/g, "/");
                            }

                            if (oldLossless !== finalDBLossless) {
                                await fs.move(fullOldLossless, finalNewLossless, { overwrite: true });
                                this.database.updateTrackLosslessPath(track.id, finalDBLossless);
                                movedAny = true;
                            }
                        }
                    }

                    if (movedAny) success++;
                    else skipped++;

                } catch (e) {
                    console.error(`[Consolidate] Error processing track ID ${track.id}:`, e);
                    failed++;
                }

                processedCount++;
                if (processedCount % BATCH_SIZE === 0) {
                    const memory = process.memoryUsage();
                    console.log(`[Consolidate] Progress: ${processedCount} tracks. Heap: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`);
                    
                    if (processedCount % (BATCH_SIZE * 5) === 0) {
                        artistCache.clear();
                        if ((global as any).gc) {
                            (global as any).gc();
                        }
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }

            console.log(`[Scanner] Consolidation complete. Success: ${success}, Failed: ${failed}, Skipped: ${skipped}`);
            return { success, failed, skipped };
        } finally {
            this.isConsolidating = false;
            if ((global as any).gc) (global as any).gc();
        }
    }
}
