// @ts-ignore
import slsk from "slsk-client";
import path from "path";
import fs from "fs-extra";

export interface SoulseekResult {
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

    constructor(musicDir: string, downloadDir: string) {
        this.musicDir = musicDir;
        this.downloadDir = downloadDir;
    }

    async connect(user?: string, pass?: string): Promise<boolean> {
        const username = user || process.env.SLSK_USER;
        const password = pass || process.env.SLSK_PASS;

        if (!username || !password) {
            console.warn("⚠️ Soulseek credentials missing. Service will be inactive.");
            return false;
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
                    resolve(res.map((r: any) => ({
                        user: r.user,
                        file: r.file,
                        size: r.size,
                        slots: r.slots,
                        bitrate: r.bitrate,
                        speed: r.speed
                    })));
                }
            });
        });
    }

    async download(result: SoulseekResult): Promise<string> {
        if (!this.client) throw new Error("Soulseek client not connected");

        const fileName = path.basename(result.file);
        const dest = path.join(this.downloadDir, fileName);

        return new Promise((resolve, reject) => {
            this.client.download({
                file: result,
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
