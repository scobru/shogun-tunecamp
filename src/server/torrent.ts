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
        this.client.on("error", (err: string | Error) => {
            const message = typeof err === "string" ? err : err.message;
            console.error("🌊 WebTorrent client global error:", message);
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
            const existing = await this.client.get(magnetUri);
            if (existing) {
                console.log(`🧲 Torrent already active in engine: ${existing.name || existing.infoHash}`);
                return existing.infoHash;
            }
        } catch (getErr) {
            // client.get might throw if input is totally invalid and not caught by frontend
            console.warn(`⚠️ client.get failed for ${magnetUri.substring(0, 30)}:`, getErr);
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
                });

                torrent.on("error", (err: any) => {
                    console.error(`❌ Torrent error (${magnetUri}):`, err.message || err);
                });

                // Immediately resolve with infoHash to prevent hanging the HTTP response
                if (torrent.infoHash) {
                    resolve(torrent.infoHash);
                } else {
                    // Fallback to wait for infoHash event
                    torrent.on('infoHash', () => {
                        resolve(torrent.infoHash);
                    });
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
