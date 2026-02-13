import path from "path";
import fs from "fs-extra";
import chokidar, { type FSWatcher } from "chokidar";
import { parseFile } from "music-metadata";
import { parse } from "yaml";

import type { DatabaseService, Artist, Album, Track } from "./database.js";
import { WaveformService } from "./waveform.js";
import { slugify, getStandardCoverFilename } from "../utils/audioUtils.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath && ffprobePath.path) {
    ffmpeg.setFfprobePath(ffprobePath.path);
}

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

function getDurationFromFfmpeg(filePath: string): Promise<number | null> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.warn(`    [Scanner] ffprobe failed for ${path.basename(filePath)}: ${err.message}`);
                resolve(null);
            } else {
                const duration = metadata.format.duration;
                resolve(duration ? parseFloat(duration as any) : null);
            }
        });
    });
}

/**
 * Convert a WAV file to MP3 using ffmpeg
 * Returns the path to the new MP3 file
 */
function convertWavToMp3(wavPath: string, bitrate: string = '320k'): Promise<string> {
    return new Promise((resolve, reject) => {
        const mp3Path = wavPath.replace(/\.wav$/i, '.mp3');

        const startTime = Date.now();
        const startSize = fs.existsSync(wavPath) ? fs.statSync(wavPath).size : 0;
        console.log(`    [Scanner] Converting WAV to MP3: ${path.basename(wavPath)} (${(startSize / 1024 / 1024).toFixed(2)} MB)`);

        ffmpeg(wavPath)
            .audioBitrate(bitrate)
            .audioCodec('libmp3lame')
            .format('mp3')
            .on('end', () => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`    [Scanner] Converted to: ${path.basename(mp3Path)} in ${duration}s`);
                resolve(mp3Path);
            })
            .on('error', (err) => {
                console.error(`    [Scanner] Conversion failed: ${err.message}`);
                reject(err);
            })
            .save(mp3Path);
    });
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
    processAudioFile(filePath: string, musicDir: string): Promise<{ originalPath: string, success: boolean, message: string, convertedPath?: string, trackId?: number } | null>;
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

            // Check for existing album by SLUG to avoid duplicates (race condition between watcher/scanner)
            const slug = slugify(config.title);
            const existingAlbum = this.database.getAlbumBySlug(slug);
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

                // Update artist if we have one and existing doesn't
                if (artistId && !existingAlbum.artist_id) {
                    this.database.updateAlbumArtist(albumId, artistId);
                    console.log(`  Updated album artist: ${config.title} -> ID ${artistId}`);
                }

                // Update download setting
                this.database.updateAlbumDownload(albumId, config.download || null);

                // Update external links
                this.database.updateAlbumLinks(albumId, linksJson);

                // Update cover if needed
                if (coverPath) {
                    this.database.updateAlbumCover(albumId, coverPath);
                }

                // Mark existing album as a release if it wasn't already
                if (!existingAlbum.is_release) {
                    this.database.promoteToRelease(albumId);
                }
                console.log(`  Found existing album: ${config.title}`);
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

            // Map this folder and its subfolders (like 'tracks', 'audio') to this album
            this.folderToAlbumMap.set(dir, albumId);
            this.folderToAlbumMap.set(path.join(dir, "tracks"), albumId);
            this.folderToAlbumMap.set(path.join(dir, "audio"), albumId);
        } catch (e) {
            console.error(`Error processing release config ${filePath}:`, e);
        }
    }

    public async processAudioFile(filePath: string, musicDir: string): Promise<{ originalPath: string, success: boolean, message: string, convertedPath?: string, trackId?: number } | null> {
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

        // If track is in the "library" folder and map has no info, protect the existing link
        if (albumId === null && existing && existing.album_id && normalizedPath.startsWith('library')) {
            albumId = existing.album_id;
        }

        // 1. Try to find existing record by path or metadata for pairing
        if (!existing) {
            try {
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
                    console.log(`    [Scanner] Pairing: found existing record for '${title}' (Target: ${ext.toUpperCase()})`);
                }
            } catch (e) {
                console.error(`    [Scanner] Error parsing metadata for pairing lookup: ${e instanceof Error ? e.message : String(e)}`);
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
            // If we found an existing track and this is the MP3 version (primary path)
            else if (ext === '.mp3' && (existing.file_path !== normalizedPath)) {
                // If the existing record has a non-MP3 file_path (e.g. was created from WAV)
                // we want to move the current WAV to lossless_path and use MP3 for streaming
                const oldExt = path.extname(existing.file_path).toLowerCase();
                if (LOSSLESS_EXTENSIONS.includes(oldExt)) {
                    console.log(`    [Scanner] Swapping primary path to MP3 and moving ${oldExt.toUpperCase()} to lossless_path`);
                    this.database.updateTrackLosslessPath(existing.id, existing.file_path);
                    this.database.updateTrackPath(existing.id, normalizedPath, albumId);
                } else {
                    // Just update the path if it's different and not a swap
                    this.database.updateTrackPath(existing.id, normalizedPath, albumId);
                }
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
                format: format.codec || ext.substring(1),
                bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
                sample_rate: format.sampleRate || null,
                lossless_path: isLossless ? this.normalizePath(currentFilePath, musicDir) : null,
                waveform: null
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
            if (filePath.toLowerCase().endsWith(".wav") && currentFilePath === filePath) {
                this.processQueue.add(() => convertWavToMp3(filePath).catch(err => {
                    console.error(`    [Scanner] Background WAV conversion failed:`, err);
                }));
            }

            return { originalPath: filePath, success: true, message: "Track processed successfully.", convertedPath: currentFilePath !== filePath ? currentFilePath : undefined, trackId: trackId };

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

    private async doScan(dir: string): Promise<ScanResult> {
        console.log("Scanning directory: " + dir);

        if (!(await fs.pathExists(dir))) {
            console.warn("Directory does not exist: " + dir);
            return { successful: [], failed: [] };
        }

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
            }
        }

        // Clean up duplicates
        await this.deduplicateTracks();

        // Clean up stale records
        await this.cleanupStaleTracks(dir);

        return { successful, failed };
    }

    private async deduplicateTracks() {
        console.log("[Scanner] Checking for duplicate tracks to merge...");
        const allTracks = this.database.getTracks();
        const groups = new Map<string, any[]>();

        for (const track of allTracks) {
            const key = `${track.album_id || 0}|${track.artist_id || 0}|${track.title.toLowerCase().trim()}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(track);
        }

        let merged = 0;
        for (const [key, tracks] of groups.entries()) {
            if (tracks.length > 1) {
                // Find primary (MP3) and lossless among duplicates
                const primary = tracks.find(t => path.extname(t.file_path).toLowerCase() === '.mp3') || tracks[0];
                const others = tracks.filter(t => t.id !== primary.id);

                for (const other of others) {
                    console.log(`  [Dedupe] Merging duplicate track: ${other.title} (ID ${other.id}) into ID ${primary.id}`);

                    // If other has a lossless path and primary doesn't, migrate it
                    if (other.lossless_path && !primary.lossless_path) {
                        this.database.updateTrackLosslessPath(primary.id, other.lossless_path);
                    } else if (!primary.lossless_path) {
                        const otherExt = path.extname(other.file_path).toLowerCase();
                        if (['.wav', '.flac'].includes(otherExt)) {
                            this.database.updateTrackLosslessPath(primary.id, other.file_path);
                        }
                    }

                    // Delete the duplicate
                    this.database.deleteTrack(other.id);
                    merged++;
                }
            }
        }

        if (merged > 0) {
            console.log(`[Scanner] Merged ${merged} duplicate track(s).`);
        }
    }

    private async cleanupStaleTracks(musicDir: string) {
        console.log("[Scanner] Cleaning up stale database records...");
        const allTracks = this.database.getTracks();
        let removed = 0;
        for (const track of allTracks) {
            const resolved = path.join(musicDir, track.file_path);
            if (!await fs.pathExists(resolved)) {
                console.log(`  [Cleanup] Removing stale track: ${track.title} (${track.file_path})`);
                this.database.deleteTrack(track.id);
                removed++;
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

        this.watcher.on("unlink", (filePath: string) => {
            // Note: normalizing path here because DB stores relative
            const relativePath = this.normalizePath(filePath, dir);
            const track = this.database.getTrackByPath(relativePath);
            if (track) {
                this.database.deleteTrack(track.id);
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
