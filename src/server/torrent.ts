import WebTorrent from "webtorrent-hybrid";
import path from "path";
import fs from "fs-extra";
import type { DatabaseService, TorrentStatus } from "./database.js";
import type { ScannerService } from "./scanner.js";

export class TorrentService {
    private client: WebTorrent.Instance;
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

        // Ensure download directory exists
        fs.ensureDirSync(this.downloadDir);

        // Resume torrents from database
        this.resumeTorrents();
        
        console.log(`📡 Torrent Service initialized. Downloads: ${this.downloadDir}`);
    }

    private async resumeTorrents() {
        const torrents = this.database.getTorrents();
        for (const t of torrents) {
            this.addTorrent(t.magnet_uri, false);
        }
    }

    public addTorrent(magnetUri: string, saveToDb: boolean = true): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                const torrent = this.client.add(magnetUri, { path: this.downloadDir }, (t) => {
                    console.log(`🧲 Torrent added: ${t.name} (${t.infoHash})`);
                    
                    if (saveToDb) {
                        this.database.createTorrent({
                            info_hash: t.infoHash,
                            name: t.name,
                            magnet_uri: magnetUri
                        });
                    }

                    // Setup events
                    t.on("done", () => {
                        console.log(`✅ Torrent finished: ${t.name}`);
                        this.handleTorrentDone(t);
                    });

                    resolve(t.infoHash);
                });

                torrent.on("error", (err) => {
                    console.error(`❌ Torrent error (${magnetUri}):`, err);
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    private async handleTorrentDone(torrent: WebTorrent.Torrent) {
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
                } catch (err) {
                    console.error(`❌ Failed to index file ${file.name}:`, err);
                }
            }
        }
    }

    public getTorrentsStatus(): TorrentStatus[] {
        return this.client.torrents.map(t => ({
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
            files: t.files.map(f => ({
                name: f.name,
                path: f.path,
                progress: f.progress,
                length: f.length,
                downloaded: f.downloaded
            }))
        }));
    }

    public removeTorrent(infoHash: string, deleteFiles: boolean = false): void {
        const torrent = this.client.get(infoHash);
        if (torrent) {
            torrent.destroy(() => {
                console.log(`🗑️ Torrent removed: ${infoHash}`);
                this.database.deleteTorrent(infoHash);
                
                if (deleteFiles) {
                    const torrentPath = path.join(this.downloadDir, torrent.name);
                    fs.remove(torrentPath).catch(err => {
                        console.error(`❌ Failed to delete files for ${infoHash}:`, err);
                    });
                }
            });
        }
    }

    public destroy() {
        this.client.destroy();
    }
}
