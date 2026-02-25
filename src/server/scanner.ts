import path from "path";
import fs from "fs-extra";
import chokidar, { type FSWatcher } from "chokidar";
import { parseFile } from "music-metadata";
import { parse } from "yaml";

import type { DatabaseService, Artist, Album, Track } from "./database.js";
import { WaveformService } from "./waveform.js";
import { slugify, getStandardCoverFilename, detectService, getExternalArtworkUrl } from "../utils/audioUtils.js";
import { convertWavToMp3, getDurationFromFfmpeg } from "./ffmpeg.js";

/**
 * Simple sequential processing queue to avoid over-parallelizing heavy tasks (ffmpeg, conversion)
 */
class ProcessingQueue {
    private queue: (() => Promise<any>)[] = [];
    private processing = false;

    async add<T>(task: () => Promise<T>): Promise<T> {
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
}

/**
 * Robust wrapper for music-metadata parseFile with retry mechanism.
 * Helps avoid RangeError and FileHandle issues with freshly converted/moved files.
 */
async function parseFileWithRetry(filePath: string, retries = 3, delay = 500): Promise<any> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await parseFile(filePath);
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
    processAudioFile(filePath: string, musicDir: string): Promise<{ originalPath: string, success: boolean, message: string, convertedPath?: string, trackId?: number, queuedConversion?: boolean } | null>;
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

    // Keep track of the monitored music directory
    private musicDirectory: string | null = null;

    constructor(private database: DatabaseService) { }

    /**
     * Normalize path to be relative to musicDir and use forward slashes (POSIX style)
     */
    private normalizePath(filePath: string, musicDir: string): string {
        return path.relative(musicDir, filePath).replace(/\\/g, "/");
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
                        this.database.updateArtist(artistId, config.bio, avatarPath, config.links);
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
                // Check if artist already exists before creating
                const existingArtist = this.database.getArtistByName(config.artist);
                if (existingArtist) {
                    artistId = existingArtist.id;
                } else {
                    artistId = this.database.createArtist(config.artist);
                }
            } else {
                // Look up parent folders for artist config
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

            // Resolve cover path to be relative to the music root
            let coverPath: string | null = null;
            if (config.cover) {
                const absoluteCoverPath = path.resolve(dir, config.cover);
                if (await fs.pathExists(absoluteCoverPath)) {
                    coverPath = this.normalizePath(absoluteCoverPath, musicDir);
                }
            } else {
                // Try common cover names
                const standardCoverJpg = getStandardCoverFilename("jpg");
                const standardCoverPng = getStandardCoverFilename("png");
                const coverNames = [standardCoverJpg, standardCoverPng, "cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png"];
                for (const name of coverNames) {
                    const p = path.resolve(dir, name);
                    if (await fs.pathExists(p)) {
                        coverPath = this.normalizePath(p, musicDir);
                        break;
                    }
                }
            }

            // Check for existing album by SLUG
            const slug = slugify(config.title);
            let existingAlbum = this.database.getAlbumBySlug(slug);

            // If not found by slug, check by FOLDER mapping (handling renamed albums)
            if (!existingAlbum) {
                // Normalize dir relative to musicDir for lookup
                const relativeDir = this.normalizePath(dir, musicDir);
                const mappedAlbumId = this.folderToExistingAlbumMap.get(relativeDir);
                if (mappedAlbumId) {
                    const mappedAlbum = this.database.getAlbum(mappedAlbumId);
                    if (mappedAlbum) {
                        existingAlbum = mappedAlbum;
                        console.log(`  [Scanner] Matched folder '${relativeDir}' to existing album '${existingAlbum.title}' (ID ${existingAlbum.id}), ignoring title/slug mismatch.`);
                    }
                }
            }

            let albumId: number;

            // Prepare external links
            let linksJson: string | null = null;
            if (config.links) {
                const links: ExternalLink[] = [];
                if (Array.isArray(config.links)) {
                    links.push(...config.links);
                } else {
                    // Handle object format { 'Bandcamp': 'url' }
                    for (const [label, url] of Object.entries(config.links)) {
                        links.push({ label, url: url as string });
                    }
                }
                linksJson = JSON.stringify(links);
            }

            if (existingAlbum) {
                albumId = existingAlbum.id;

                // Update artist only if missing (don't overwrite user selection)
                if (artistId && !existingAlbum.artist_id) {
                    this.database.updateAlbumArtist(albumId, artistId);
                }

                // Update download setting
                this.database.updateAlbumDownload(albumId, config.download || null);

                // Update external links
                this.database.updateAlbumLinks(albumId, linksJson);

                // Update cover if needed
                if (coverPath) {
                    this.database.updateAlbumCover(albumId, coverPath);
                }

                // Do NOT force promoteToRelease if the album exists.
                if (!existingAlbum.is_release) {
                    console.log(`  [Scanner] Album '${existingAlbum.title}' has release.yaml but is_release=false in DB. Respecting DB state.`);
                }
                console.log(`  Updated existing album config: ${existingAlbum.title}`);
            } else {
                albumId = this.database.createAlbum({
                    title: config.title,
                    slug: slug,
                    artist_id: artistId,
                    date: config.date || null,
                    cover_path: coverPath,
                    genre: config.genres?.join(", ") || null,
                    description: config.description || null,
                    type: config.type || 'album',
                    year: config.year || (config.date ? new Date(config.date).getFullYear() : null),
                    download: config.download || null,
                    external_links: linksJson,
                    is_public: false, // Default to private
                    visibility: 'private',
                    is_release: true, // Albums from release.yaml are releases
                    published_at: null,
                    published_to_gundb: false,
                    published_to_ap: false,
                });
                console.log(`  Created release from config: ${config.title}`);
            }

            this.folderToAlbumMap.set(dir, albumId);
            this.folderToAlbumMap.set(path.join(dir, "tracks"), albumId);
            this.folderToAlbumMap.set(path.join(dir, "audio"), albumId);

            // Process external tracks defined in config
            if (config.metadata?.tracks) {
                for (const tc of config.metadata.tracks) {
                    if (tc.url) {
                        const trimmedUrl = String(tc.url).trim();
                        const trackTitle = tc.title || "External Track";
                        const existingTrack = this.database.getTrackByMetadata(trackTitle, artistId, albumId);

                        if (!existingTrack) {
                            this.database.createTrack({
                                title: trackTitle,
                                album_id: albumId,
                                artist_id: artistId,
                                track_num: tc.trackNum || tc.track || null,
                                duration: tc.duration || null,
                                file_path: null,
                                format: tc.service || 'external',
                                bitrate: null,
                                sample_rate: null,
                                lossless_path: null,
                                waveform: null,
                                url: trimmedUrl,
                                service: tc.service || detectService(trimmedUrl),
                                external_artwork: tc.artwork || getExternalArtworkUrl(trimmedUrl) || null
                            });
                            console.log(`  Added external track to DB: ${trackTitle}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Error processing release config ${filePath}:`, e);
        }
    }

    public async processAudioFile(filePath: string, musicDir: string): Promise<{ originalPath: string, success: boolean, message: string, convertedPath?: string, trackId?: number, queuedConversion?: boolean } | null> {
        let currentFilePath = filePath;
        const ext = path.extname(currentFilePath).toLowerCase();

        if (!AUDIO_EXTENSIONS.includes(ext)) {
            return null;
        }

        const LOSSLESS_EXTENSIONS = ['.wav', '.flac'];
        const normalizedPath = this.normalizePath(currentFilePath, musicDir);
        let existing = this.database.getTrackByPath(normalizedPath);

        // Determine album ID from folder map
        const dir = path.dirname(currentFilePath);
        let albumId = this.folderToAlbumMap.get(dir) || null;

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
                const dir = path.dirname(currentFilePath);
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
                    const metadata = await parseFileWithRetry(currentFilePath);
                    const title = metadata.common.title || path.basename(currentFilePath, path.extname(currentFilePath));
                    const artistName = metadata.common.artist;

                    let artistId: number | null = null;
                    if (artistName) {
                        const existingArtist = this.database.getArtistByName(artistName);
                        artistId = existingArtist ? existingArtist.id : null;
                    }

                    // Look for existing track by metadata in the same album
                    existing = this.database.getTrackByMetadata(title, artistId, albumId);
                    if (existing) {
                        console.log(`    [Scanner] Pairing: found existing record by metadata for '${title}' (Target: ${ext.toUpperCase()})`);
                    }
                }
            } catch (e) {
                console.error(`    [Scanner] Error finding match for pairing lookup: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // 2. Handle pairing if record exists
        if (existing) {
            const isLossless = LOSSLESS_EXTENSIONS.includes(ext);

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
                    this.database.updateTrackPath(existing.id, normalizedPath, albumId);
                } else {
                    // Just update the path if it's different and not a swap
                    this.database.updateTrackPath(existing.id, normalizedPath, albumId);
                }
            } else {
                // Update path if it was null (e.g. from external to local, though unlikely)
                this.database.updateTrackPath(existing.id, normalizedPath, albumId);
            }

            // Ensure linked to album
            if (existing.album_id !== albumId) {
                this.database.updateTrackAlbum(existing.id, albumId);
            }

            // Process waveform if missing
            if (!existing.waveform) {
                this.processQueue.add(() => WaveformService.generateWaveform(currentFilePath))
                    .then((peaks: number[]) => {
                        this.database.updateTrackWaveform(existing!.id, JSON.stringify(peaks));
                    }).catch(() => { });
            }

            return { originalPath: filePath, success: true, message: "Track paired/updated.", trackId: existing.id };
        }

        try {
            console.log("  Processing track: " + path.basename(currentFilePath));
            const metadata = await parseFileWithRetry(currentFilePath);
            const common = metadata.common;
            const format = metadata.format;

            let artistId: number | null = null;
            if (common.artist) {
                const existingArtist = this.database.getArtistByName(common.artist);
                artistId = existingArtist ? existingArtist.id : this.database.createArtist(common.artist);
            } else {
                const unknownArtist = this.database.getArtistByName("Unknown Artist");
                artistId = unknownArtist ? unknownArtist.id : this.database.createArtist("Unknown Artist");
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
                external_artwork: null
            });

            this.processQueue.add(() => WaveformService.generateWaveform(currentFilePath))
                .then((peaks: number[]) => {
                    const json = JSON.stringify(peaks);
                    this.database.updateTrackWaveform(trackId, json);
                    console.log(`    Generated waveform for: ${path.basename(currentFilePath)}`);
                })
                .catch((err: Error) => {
                    console.error(`    Failed to generate waveform for ${path.basename(currentFilePath)}:`, err.message);
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
        const allTracks = this.database.getTracks();
        const counts = new Map<string, Map<number, number>>();

        for (const track of allTracks) {
            if (!track.album_id || !track.file_path) continue;

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
            for (const entry of entries) {
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
            }
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
        for (const configPath of releaseConfigs) {
            await this.processReleaseConfig(configPath, dir);
        }

        const successful: Array<{ originalPath: string; message: string; convertedPath?: string }> = [];
        const failed: Array<{ originalPath: string; message: string }> = [];

        // 4. Process Audio Files
        for (const file of audioFiles) {
            const result = await this.processAudioFile(file, dir);
            if (result) {
                if (result.success) {
                    successful.push(result);
                } else {
                    failed.push(result);
                }

                // If a conversion was queued, add the expected MP3 path to knownFiles
                // so cleanupStaleTracks doesn't think it's missing
                if (result.queuedConversion) {
                    const ext = path.extname(file).toLowerCase();
                    if (['.wav', '.flac'].includes(ext)) {
                        const mp3Path = this.normalizePath(file.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3'), dir);
                        knownFiles.add(isCaseInsensitive ? mp3Path.toLowerCase() : mp3Path);
                    }
                }
            }
        }

        // Clean up duplicates
        let allTracks = this.database.getTracks();
        allTracks = await this.deduplicateTracks(allTracks);

        // Clean up stale records
        await this.cleanupStaleTracks(dir, knownFiles, allTracks);

        // Fix orphan albums
        await this.fixOrphanAlbums();

        return { successful, failed };
    }

    private async fixOrphanAlbums() {
        console.log("[Scanner] Checking for orphan albums to fix...");
        // Get all orphan releases/albums (using raw query as DatabaseService doesn't expose a specific method)
        // Accessing the raw 'db' property from DatabaseService interface
        try {
            const orphans = this.database.db.prepare("SELECT * FROM albums WHERE artist_id IS NULL").all() as Album[];

            for (const orphan of orphans) {
                const tracks = orphan.is_release
                    ? this.database.getTracksByReleaseId(orphan.id)
                    : this.database.getTracks(orphan.id);

                if (tracks.length === 0) continue;

                // Collect unique artist IDs from tracks
                const artistIds = [...new Set(tracks.map(t => t.artist_id).filter(id => id !== null))];

                if (artistIds.length === 1) {
                    const artistId = artistIds[0];
                    if (artistId !== null) { // Type check, though filter ensures it
                        console.log(`  [Scanner] Fixing orphan album "${orphan.title}" (ID ${orphan.id}) -> Setting artist to ID ${artistId}`);
                        this.database.updateAlbumArtist(orphan.id, artistId);
                    }
                } else if (artistIds.length > 1) {
                    console.warn(`  [Scanner] Orphan album "${orphan.title}" has tracks from multiple artists. Skipping auto-assignment.`);
                }
            }
        } catch (e) {
            console.error("  [Scanner] Error fixing orphan albums:", e);
        }
    }

    private async deduplicateTracks(tracks: Track[]): Promise<Track[]> {
        console.log("[Scanner] Checking for duplicate tracks to merge...");
        const groups = new Map<string, Track[]>();

        for (const track of tracks) {
            const key = `${track.album_id || 0}|${track.artist_id || 0}|${track.title.toLowerCase().trim()}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(track);
        }

        const tracksToRemove = new Set<number>();
        let merged = 0;

        for (const [key, groupTracks] of groups.entries()) {
            if (groupTracks.length > 1) {
                // Find primary (MP3) and lossless among duplicates
                const primary = groupTracks.find(t => path.extname(t.file_path || '').toLowerCase() === '.mp3') || groupTracks[0];
                const others = groupTracks.filter(t => t.id !== primary.id);

                for (const other of others) {
                    console.log(`  [Dedupe] Merging duplicate track: ${other.title} (ID ${other.id}) into ID ${primary.id}`);

                    // If other has a lossless path and primary doesn't, migrate it
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

                    // Delete the duplicate
                    this.database.deleteTrack(other.id);
                    tracksToRemove.add(other.id);
                    merged++;
                }
            }
        }

        if (merged > 0) {
            console.log(`[Scanner] Merged ${merged} duplicate track(s).`);
        }

        return tracks.filter(t => !tracksToRemove.has(t.id));
    }

    private async cleanupStaleTracks(musicDir: string, knownFiles: Set<string>, allTracks: Track[]) {
        console.log("[Scanner] Cleaning up stale database records...");
        const isCaseInsensitive = process.platform === 'win32' || process.platform === 'darwin';

        let removed = 0;
        for (const track of allTracks) {
            if (!track.file_path) continue; // Skip external tracks for file existence check

            // Check if primary file exists using knownFiles Set (O(1))
            const primaryKey = isCaseInsensitive ? track.file_path.toLowerCase() : track.file_path;
            const primaryExists = knownFiles.has(primaryKey);

            // Check if lossless file exists
            const losslessKey = track.lossless_path ? (isCaseInsensitive ? track.lossless_path.toLowerCase() : track.lossless_path) : null;
            const losslessExists = losslessKey ? knownFiles.has(losslessKey) : false;

            if (!primaryExists && !losslessExists) {
                console.log(`  [Cleanup] Removing stale track: ${track.title} (Both MP3 and Lossless missing)`);
                this.database.deleteTrack(track.id);
                removed++;
            } else if (!primaryExists && losslessExists) {
                console.warn(`  [Cleanup] Track ${track.title} missing MP3 (${track.file_path}) but has Lossless. Keeping record.`);

                // Re-queue regeneration if needed
                // Note: If conversion was already queued in this scan, primaryExists would be true (via knownFiles update).
                // So reaching here means it was NOT queued, so we must queue it.
                if (track.lossless_path) {
                    const resolvedLossless = path.join(musicDir, track.lossless_path);
                    this.processQueue.add(() => convertWavToMp3(resolvedLossless).catch(console.error));
                }
            } else if (primaryExists && track.lossless_path && !losslessExists) {
                console.log(`  [Cleanup] Track ${track.title} missing lossless file (${track.lossless_path}). Updating record.`);
                this.database.updateTrackLosslessPath(track.id, null);
            }
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
            const ext = path.extname(filePath).toLowerCase();
            if (AUDIO_EXTENSIONS.includes(ext)) {
                await this.processAudioFile(filePath, dir);
            }
        });

        this.watcher.on("unlink", async (filePath: string) => {
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

                console.log(`[Watcher] Primary file ${relativePath} deleted. Removing track.`);
                this.database.deleteTrack(track.id);
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
}
