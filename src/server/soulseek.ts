// @ts-ignore
import slsk from "slsk-client";
import path from "path";
import fs from "fs-extra";

export interface SoulseekResult {
    id: string;
    user: string;
    file: string;
    size: number;
    slots: boolean;
    bitrate?: number;
    speed?: number;
}

export class SoulseekService {
    private client: any;
    private musicDir: string;
    private downloadDir: string;
    private currentUsername: string | null = null;
    private searchCache: Map<string, any> = new Map();

    constructor(musicDir: string, downloadDir: string) {
        this.musicDir = musicDir;
        this.downloadDir = downloadDir;

        // Cleanup cache every 10 minutes
        setInterval(() => {
            if (this.searchCache.size > 1000) {
                this.searchCache.clear();
            }
        }, 10 * 60 * 1000);
    }

    async connect(user?: string, pass?: string): Promise<boolean> {
        const username = user || process.env.SLSK_USER;
        const password = pass || process.env.SLSK_PASS;

        if (!username || !password) {
            console.warn("⚠️ Soulseek credentials missing. Service will be inactive.");
            return false;
        }

        if (this.client && this.client.connected && this.currentUsername === username) {
            return true;
        }

        return new Promise((resolve) => {
            slsk.connect({
                user: username,
                pass: password,
                shared: [this.musicDir]
            }, (err: any, client: any) => {
                if (err) {
                    console.error("❌ Soulseek Connection Error:", err);
                    resolve(false);
                } else {
                    console.log("✅ Soulseek Connected as", username);
                    this.client = client;
                    this.currentUsername = username;
                    // Clear cache on new connection as peers list is reset
                    this.searchCache.clear();
                    resolve(true);
                }
            });
        });
    }

    async search(query: string): Promise<SoulseekResult[]> {
        if (!this.client) return [];

        return new Promise((resolve) => {
            this.client.search({
                req: query,
                timeout: 5000
            }, (err: any, res: any) => {
                if (err) {
                    console.error("❌ Soulseek Search Error:", err);
                    resolve([]);
                } else {
                    const mapped = res.map((r: any) => {
                        const id = Math.random().toString(36).substring(2, 11);
                        this.searchCache.set(id, r);
                        return {
                            id,
                            user: r.user,
                            file: r.file,
                            size: r.size,
                            slots: r.slots,
                            bitrate: r.bitrate,
                            speed: r.speed
                        };
                    });
                    resolve(mapped);
                }
            });
        });
    }

    async download(result: SoulseekResult): Promise<string> {
        if (!this.client || !this.client.connected) {
            throw new Error("Soulseek client not connected");
        }

        const originalResult = this.searchCache.get(result.id);
        if (!originalResult) {
            throw new Error("Search result context expired. Please search again.");
        }

        const fileName = path.basename(result.file);
        const dest = path.join(this.downloadDir, fileName);

        return new Promise((resolve, reject) => {
            this.client.download({
                file: originalResult,
                path: dest
            }, (err: any, data: any) => {
                if (err) {
                    console.error("❌ Soulseek Download Error:", err);
                    reject(err);
                } else {
                    console.log(`✅ Soulseek Download Finished: ${fileName}`);
                    resolve(dest);
                }
            });
        });
    }
}
