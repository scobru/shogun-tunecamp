import TPB from "thepiratebay";

export interface TorrentSearchResult {
    title: string;
    magnet: string;
    seeders: number;
    leechers: number;
    size: string;
    verified: boolean;
}

export class TorrentSearchService {
    async searchMusic(query: string): Promise<TorrentSearchResult[]> {
        console.log(`📡 Searching TPB for: ${query}`);
        try {
            // Category 100 is Audio
            // see https://github.com/t3chnoboy/thepiratebay/blob/master/README.md
            const results = await TPB.search(query, {
                category: "100", // Audio
                sortBy: "seeds",
                orderBy: "desc"
            });

            return results.map((r: any) => ({
                title: r.name,
                magnet: r.magnetLink,
                seeders: parseInt(r.seeders) || 0,
                leechers: parseInt(r.leechers) || 0,
                size: r.size,
                verified: r.verified === "1"
            }));
        } catch (error) {
            console.error("❌ TPB Search Error:", error);
            // Some TPB proxies might be down, or puppeteer failed
            return [];
        }
    }
}
