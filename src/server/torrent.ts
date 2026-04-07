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
        musicDir: string
    ) {
        this.client = new WebTorrent();
        this.musicDir = musicDir;
        this.downloadDir = path.join(musicDir, "downloads");

        // Global error handler for WebTorrent client
        // Prevents unhandled exceptions from crashing the process
        this.client.on("error", (err: Error) => {
            console.error("🌊 WebTorrent client global error:", err.message || err);
        });

        // Ensure download directory exists
        fs.ensureDirSync(this.downloadDir);

        // Resume torrents from database
        this.resumeTorrents();
        
        console.log(`📡 Torrent Service initialized. Downloads: ${this.downloadDir}`);
    }

    private async resumeTorrents() {
        const torrents = this.database.getTorrents();
        for (const t of torrents) {
            try {
                this.addTorrent(t.magnet_uri, false);
            } catch (err) {
                console.error(`❌ Failed to resume torrent ${t.info_hash}:`, err);
            }
        }
    }

    public addTorrent(magnetUri: string, saveToDb: boolean = true): Promise<string> {
        return new Promise((resolve, reject) => {
            // Check if torrent already exists in the client
            const existing = this.client.get(magnetUri);
            if (existing) {
                console.log(`🧲 Torrent already active: ${existing.name || existing.infoHash}`);
                return resolve(existing.infoHash);
            }

            try {
                // Set a timeout to avoid hanging the promise if metadata retrieval takes too long
                // This won't stop the torrent from being added, just prevents the HTTP request from hanging
                const timeout = setTimeout(() => {
                    // We don't necessarily reject here, as it's still being added in the background
                    // But we might want to return a status that it's "pending"
                    console.warn(`⏳ Torrent metadata timeout for: ${magnetUri}`);
                    // Depending on preference, we could resolve with "pending" info or reject
                }, 30000); // 30 seconds

                const torrent = this.client.add(magnetUri, { path: this.downloadDir }, (t: Torrent) => {
                    clearTimeout(timeout);
                    console.log(`🧲 Torrent added: ${t.name} (${t.infoHash})`);
                    
                    if (saveToDb) {
                        try {
                            this.database.createTorrent({
                                info_hash: t.infoHash,
                                name: t.name,
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

                    resolve(t.infoHash);
                });

                torrent.on("error", (err: any) => {
                    clearTimeout(timeout);
                    console.error(`❌ Torrent error (${magnetUri}):`, err.message || err);
                    
                    // Specific handling for common errors like "duplicate info hash"
                    if (err.message && err.message.includes("duplicate info hash")) {
                        const existing = this.client.get(magnetUri);
                        if (existing) return resolve(existing.infoHash);
                    }
                    
                    reject(err);
                });
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
        return this.client.torrents.map((t: Torrent) => ({
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
            files: t.files.map((f: TorrentFile) => ({
                name: f.name,
                path: f.path,
                progress: f.progress,
                length: f.length,
                downloaded: f.downloaded
            }))
        }));
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
