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
            maxConns: 50, // Limit connections to prevent EMFILE caps
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
        const torrents = this.database.getTorrents();
        for (const t of torrents) {
            try {
                await this.addTorrent(t.magnet_uri, false);
            } catch (err) {
                console.error(`❌ Failed to resume torrent ${t.info_hash}:`, err);
            }
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
            // client.get might throw if input is totally invalid
            console.warn(`⚠️ client.get failed for ${magnetUri.substring(0, 30)}:`, getErr instanceof Error ? getErr.message : String(getErr));
        }

        return new Promise((resolve, reject) => {
            try {
                console.log(`📡 Calling client.add for ${magnetUri.substring(0, 40)}...`);
                // WebTorrent's client.add returns the torrent instance synchronously
                const torrent = this.client.add(magnetUri, { path: this.downloadDir }, (t: Torrent) => {
                    console.log(`✅ Torrent metadata retrieved: ${t.name} (${t.infoHash})`);
                    
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

                    // Auto-destroy dead torrents that never download metadata after 10 minutes
                    setTimeout(() => {
                        try {
                            if (!(t as any).metadata) {
                                console.log(`🗑️ Auto-destroying dead torrent (no metadata after 10m): ${t.infoHash}`);
                                t.destroy();
                                this.database.deleteTorrent(t.infoHash);
                            }
                        } catch (e) { }
                    }, 10 * 60 * 1000);

                    // Setup events
                    t.on("done", () => {
                        console.log(`✅ Torrent finished: ${t.name}`);
                        this.handleTorrentDone(t);
                    });
                });

                torrent.on("error", (err: any) => {
                    console.error(`❌ Torrent error (${magnetUri}):`, err.message || err);
                    reject(err);
                });

                // Track the timeout so we can clear it upon resolving
                let timeoutId: NodeJS.Timeout | null = null;
                let isSettled = false;

                const cleanup = () => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                };

                // Immediately resolve with infoHash if available (typical for magnet links)
                if (torrent.infoHash) {
                    console.log(`🧲 WebTorrent identified infoHash: ${torrent.infoHash}`);
                    isSettled = true;
                    resolve(torrent.infoHash);
                } else {
                    // Fallback to wait for infoHash event
                    torrent.once('infoHash', () => {
                        if (isSettled) return;
                        console.log(`📡 infoHash event for ${magnetUri.substring(0, 30)}: ${torrent.infoHash}`);
                        cleanup();
                        isSettled = true;
                        resolve(torrent.infoHash);
                    });
                    
                    // If webtorrent takes too long to even get an infoHash (e.g. invalid DHT magnet), timeout
                    timeoutId = setTimeout(() => {
                        if (isSettled) return;
                        console.warn(`⏱️ Timeout waiting for torrent infoHash (30s): ${magnetUri.substring(0, 40)}`);
                        try { 
                            // Only destroy if it hasn't succeeded in some way
                            if (!(torrent as any).metadata) {
                                torrent.destroy(); 
                            }
                        } catch (e) { /* ignore */ }
                        isSettled = true;
                        reject(new Error("Timeout waiting for torrent infoHash (metadata fetching slow)"));
                    }, 30000); // 30 seconds
                }
            } catch (err) {
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
