import WebTorrent from "webtorrent";
import type { Instance, Torrent, TorrentFile } from "webtorrent";
import path from "path";
import fs from "fs-extra";
import type { DatabaseService, TorrentStatus } from "./database.js";
import type { ScannerService } from "./scanner.js";

export class TorrentService {
    private client: Instance;
    private musicDir: string;
    private downloadDir: string;

    constructor(
        private database: DatabaseService,
        private scanner: ScannerService,
        musicDir: string,
        downloadDir?: string,
        torrentPort: number = 6881
    ) {
        this.client = new WebTorrent({
            maxConns: 30, // Reduced from 50 to save resources in Docker
            utp: false,   // Disable utp to avoid native UDP issues in some environments
            torrentPort: torrentPort
            // Removed dht: { port: torrentPort } to prevent unhandled UDP bind exceptions
        } as any);
        this.musicDir = musicDir;
        this.downloadDir = downloadDir || path.join(musicDir, "downloads");

        // Global error handler for WebTorrent client
        // Prevents unhandled exceptions from crashing the process
        this.client.on("error", (err: string | Error) => {
            const message = typeof err === "string" ? err : err.message;
            console.error("🌊 WebTorrent client global error:", message);
        });

        // Ensure download directory exists with robust error handling
        try {
            console.log(`📂 Ensuring download directory exists: ${this.downloadDir}`);
            fs.ensureDirSync(this.downloadDir);
            
            // Test writability
            const testFile = path.join(this.downloadDir, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.removeSync(testFile);
        } catch (err: any) {
            console.error(`❌ FATAL: Download directory ${this.downloadDir} is NOT WRITABLE:`, err.message);
            console.warn(`⚠️  Torrent service will be partially disabled. Fix permissions or change TUNECAMP_DOWNLOAD_DIR.`);
            // We don't throw here to allow the rest of the server to start (avoiding 502)
        }

        // Resume torrents from database
        this.resumeTorrents();
        
        console.log(`📡 Torrent Service initialized. Ports: ${torrentPort}. Downloads: ${this.downloadDir}`);
    }

    private async resumeTorrents() {
        try {
            const torrents = this.database.getTorrents();
            console.log(`📡 Resuming ${torrents.length} torrents from database...`);
            for (const t of torrents) {
                try {
                    // Use a slightly different flow for resume to avoid flooding
                    await this.addTorrent(t.magnet_uri, false);
                } catch (err) {
                    console.error(`❌ Failed to resume torrent ${t.info_hash}:`, err);
                }
            }
        } catch (err) {
            console.error("❌ Critical error in resumeTorrents:", err);
        }
    }

    public async addTorrent(magnetUri: string, saveToDb: boolean = true): Promise<string> {
        console.log(`🧲 Attempting to add torrent: ${magnetUri.substring(0, 60)}...`);
        
        // Check if torrent already exists in the client
        try {
            const existing = await this.client.get(magnetUri) as any;
            if (existing) {
                console.log(`🧲 Torrent already active in engine: ${existing.name || existing.infoHash}`);
                return existing.infoHash;
            }
        } catch (getErr) {
            console.warn(`⚠️ client.get failed for ${magnetUri.substring(0, 30)}:`, getErr instanceof Error ? getErr.message : String(getErr));
        }

        return new Promise((resolve, reject) => {
            let timeoutId: NodeJS.Timeout | null = null;
            let deadTorrentTimeoutId: NodeJS.Timeout | null = null;
            let isSettled = false;

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };

            try {
                console.log(`📡 Calling client.add for ${magnetUri.substring(0, 40)}...`);
                const torrent = this.client.add(magnetUri, { path: this.downloadDir }, (t: Torrent) => {
                    console.log(`✅ Torrent metadata retrieved: ${t.name} (${t.infoHash})`);
                    
                    // Clear the dead torrent timeout since we found metadata
                    if (deadTorrentTimeoutId) {
                        clearTimeout(deadTorrentTimeoutId);
                        deadTorrentTimeoutId = null;
                    }

                    if (saveToDb) {
                        try {
                            this.database.createTorrent({
                                info_hash: t.infoHash,
                                name: t.name || 'Unknown Torrent',
                                magnet_uri: magnetUri
                            });
                        } catch (dbErr) {
                            console.error(`❌ Database error saving torrent ${t.infoHash}:`, dbErr);
                        }
                    }

                    // Setup events
                    t.on("done", () => {
                        console.log(`✅ Torrent finished: ${t.name}`);
                        this.handleTorrentDone(t);
                    });
                });

                // Auto-destroy dead torrents that never download metadata after 10 minutes
                // Moved OUTSIDE the metadata callback so it actually works
                deadTorrentTimeoutId = setTimeout(() => {
                    try {
                        if (!(torrent as any).metadata) {
                            console.warn(`🗑️ Auto-destroying dead torrent (no metadata after 10m): ${torrent.infoHash || 'unknown'}`);
                            torrent.destroy();
                            if (torrent.infoHash) this.database.deleteTorrent(torrent.infoHash);
                        }
                    } catch (e) { 
                        console.error("Error in dead torrent cleanup:", e);
                    }
                }, 10 * 60 * 1000);

                torrent.on("error", (err: any) => {
                    console.error(`❌ Torrent error handler (${magnetUri.substring(0, 30)}):`, err.message || err);
                    cleanup();
                    if (!isSettled) {
                        isSettled = true;
                        reject(err);
                    }
                });

                // Immediately resolve with infoHash if available (typical for magnet links)
                if (torrent.infoHash) {
                    console.log(`🧲 WebTorrent identified infoHash: ${torrent.infoHash}`);
                    isSettled = true;
                    resolve(torrent.infoHash);
                    // We don't cleanup() yet because we might want the infoHash event below for logging
                } else {
                    // Fallback to wait for infoHash event
                    torrent.once('infoHash', () => {
                        if (isSettled) return;
                        console.log(`📡 infoHash event for ${magnetUri.substring(0, 30)}: ${torrent.infoHash}`);
                        cleanup();
                        isSettled = true;
                        resolve(torrent.infoHash);
                    });
                    
                    // If webtorrent takes too long to even get an infoHash, timeout
                    timeoutId = setTimeout(() => {
                        if (isSettled) return;
                        console.warn(`⏱️ Timeout waiting for torrent infoHash (30s): ${magnetUri.substring(0, 40)}`);
                        try { 
                            if (!(torrent as any).metadata) {
                                torrent.destroy(); 
                            }
                        } catch (e) { /* ignore */ }
                        isSettled = true;
                        reject(new Error("Timeout waiting for torrent infoHash (metadata fetching slow)"));
                    }, 30000); // 30 seconds
                }
            } catch (err) {
                console.error("❌ Synchronous error in client.add:", err);
                cleanup();
                reject(err);
            }
        });
    }

    private async handleTorrentDone(torrent: Torrent) {
        console.log(`📂 Processing finished torrent files for: ${torrent.name}`);
        
        for (const file of torrent.files) {
            const ext = path.extname(file.name).toLowerCase();
            const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
            
            if (AUDIO_EXTENSIONS.includes(ext)) {
                const absolutePath = path.join(this.downloadDir, file.path);
                console.log(`🎵 Indexing downloaded track: ${file.name}`);
                
                try {
                    // Trigger scanner for this file
                    // We don't provide an ownerId for now, or we could pass the admin ID
                    await this.scanner.processAudioFile(absolutePath, this.musicDir);
                } catch (err: any) {
                    console.error(`❌ Failed to index file ${file.name}:`, err);
                }
            }
        }
    }

    public getTorrentsStatus(): TorrentStatus[] {
        if (!this.client || !this.client.torrents) return [];
        
        return this.client.torrents.map((t: Torrent) => {
            let filesStatus: any[] = [];
            try {
                if (t.files && Array.isArray(t.files)) {
                    filesStatus = t.files.map((f: TorrentFile) => ({
                        name: f.name,
                        path: f.path,
                        progress: f.progress,
                        length: f.length,
                        downloaded: f.downloaded
                    }));
                }
            } catch (err) {
                console.error("Error mapping torrent files for status:", err);
            }
            
            return {
                infoHash: t.infoHash,
                name: t.name,
                progress: t.progress,
                downloadSpeed: t.downloadSpeed,
                uploadSpeed: t.uploadSpeed,
                numPeers: t.numPeers,
                received: t.received,
                uploaded: t.uploaded,
                size: t.length,
                path: t.path,
                timeRemaining: t.timeRemaining,
                done: t.done,
                files: filesStatus
            };
        });
    }

    public async removeTorrent(infoHash: string, deleteFiles: boolean = false): Promise<void> {
        const t = await this.client.get(infoHash);
        if (t) {
            await this.client.remove(infoHash, { destroyStore: deleteFiles });
            console.log(`🗑️ Torrent removed: ${infoHash}`);
            this.database.deleteTorrent(infoHash);
        }
    }

    public destroy() {
        this.client.destroy();
    }
}
