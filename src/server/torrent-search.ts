import TorrentSearchApi from "torrent-search-api";

export interface TorrentSearchResult {
    title: string;
    magnet: string;
    seeders: number;
    leechers: number;
    size: string;
    verified: boolean;
    provider?: string;
}

export class TorrentSearchService {
    constructor() {
        // Enable basic public providers
        try {
            TorrentSearchApi.enablePublicProviders();
            console.log("✅ Torrent Search API: Public providers enabled");
            
            // Optionally enable specific ones if they are more reliable
            // TorrentSearchApi.enableProvider('ThePirateBay');
            // TorrentSearchApi.enableProvider('1337x');
        } catch (error) {
            console.error("❌ Error enabling torrent providers:", error);
        }
    }

    async searchMusic(query: string): Promise<TorrentSearchResult[]> {
        console.log(`📡 Searching for torrents: ${query}`);
        try {
            // Search in Audio category
            const results = await TorrentSearchApi.search(query, "Audio", 20);

            if (!results || results.length === 0) {
                console.log("⚠️ No torrent results found.");
                return [];
            }

            console.log(`✅ Found ${results.length} torrent results`);

            // Map results to our interface
            const mappedResults: TorrentSearchResult[] = results.map((r: any) => ({
                title: r.title,
                magnet: r.magnet || "",
                seeders: r.seeds || 0,
                leechers: r.peers || 0,
                size: r.size || "Unknown",
                verified: !!r.vip || !!r.trusted,
                provider: r.provider
            }));

            // Filter out those without magnet links and sort by seeders
            return mappedResults
                .filter(r => r.magnet && r.magnet.startsWith("magnet:"))
                .sort((a, b) => b.seeders - a.seeders);

        } catch (error) {
            console.error("❌ Torrent Search Error:", error);
            return [];
        }
    }
}
