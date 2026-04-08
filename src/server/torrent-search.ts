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
        try {
            // Explicitly enable reliable providers
            // Using a wider set of providers as some might be blocked or down
            const providers = [
                '1337x', 
                'ThePirateBay', 
                'Limetorrents', 
                'KickassTorrents', 
                'TorrentProject',
                'Zooqle',
                'Torrentz2',
                'Yts',
                'Torrent9',
                'Rarbg'
            ];
            
            for (const provider of providers) {
                try {
                    TorrentSearchApi.enableProvider(provider);
                } catch (e) {
                    // Provider might not exist in this version or be named differently
                }
            }
            
            // Also enable remaining public providers as backup
            TorrentSearchApi.enablePublicProviders();
            
            const active = TorrentSearchApi.getActiveProviders().map(p => p.name);
            console.log("✅ Torrent Search API: Active providers:", active.join(", "));
            
            if (active.length === 0) {
                console.warn("⚠️ WARNING: No torrent providers are active! Search will not work.");
            }
        } catch (error) {
            console.error("❌ Error enabling torrent providers:", error);
        }
    }

    async searchMusic(query: string): Promise<TorrentSearchResult[]> {
        console.log(`📡 Searching for torrents: ${query}`);
        try {
            // Set a timeout for the search to avoid hanging the request
            const searchPromise = (async () => {
                // 1. Try "Music" category first (Standard)
                console.log(`🔍 Querying 'Music' category...`);
                let results = await TorrentSearchApi.search(query, "Music", 30);
                
                // 2. Fallback to "All" if no results found in Music
                if (!results || results.length === 0) {
                    console.log("⚠️ No results in 'Music' category, trying 'All'...");
                    results = await TorrentSearchApi.search(query, "All", 30);
                }
                return results;
            })();

            // 15 second timeout for scraping - sites in 2026 can be slow or blocked
            const timeout = new Promise<any[]>((_, reject) => 
                setTimeout(() => reject(new Error("Search timed out")), 15000)
            );

            const results = await Promise.race([searchPromise, timeout]);

            if (!results || results.length === 0) {
                console.log("⚠️ No torrent results found.");
                return [];
            }

            console.log(`✅ Found ${results.length} raw results. Resolving top magnets...`);

            // 3. Resolve magnet links for top results
            const topResults = results.slice(0, 10);
            const resolvedResults = await Promise.all(topResults.map(async (r: any) => {
                try {
                    if (!r.magnet || !r.magnet.startsWith("magnet:")) {
                        // Small timeout for individual magnet resolution
                        const magnetPromise = TorrentSearchApi.getMagnet(r);
                        const mTimeout = new Promise<string>((_, reject) => 
                            setTimeout(() => reject(new Error("Magnet resolution timeout")), 5000)
                        );
                        r.magnet = await Promise.race([magnetPromise, mTimeout]);
                    }
                    return r;
                } catch (e) {
                    return r;
                }
            }));

            // 4. Map and filter
            const mappedResults: TorrentSearchResult[] = resolvedResults
                .filter(r => r.magnet && r.magnet.startsWith("magnet:"))
                .map((r: any) => ({
                    title: r.title || r.name || "Unknown Torrent",
                    magnet: r.magnet,
                    seeders: parseInt(r.seeds) || parseInt(r.seeders) || 0,
                    leechers: parseInt(r.peers) || parseInt(r.leechers) || 0,
                    size: r.size || "Unknown",
                    verified: !!r.vip || !!r.trusted,
                    provider: r.provider
                }));

            return mappedResults.sort((a, b) => b.seeders - a.seeders);

        } catch (error: any) {
            console.error("❌ Torrent Search Error:", error.message);
            return [];
        }
    }

    /**
     * Minimal magnet parser for UI feedback
     */
    static decodeMagnet(magnet: string): { title: string; infoHash?: string } {
        const result = { title: "New Torrent" };
        try {
            const params = new URLSearchParams(magnet.replace("magnet:?", ""));
            const dn = params.get("dn");
            if (dn) result.title = decodeURIComponent(dn).replace(/\+/g, " ");
            
            const xt = params.get("xt");
            if (xt && xt.startsWith("urn:btih:")) {
                (result as any).infoHash = xt.split(":")[2];
            }
        } catch (e) {
            // Fallback to default
        }
        return result;
    }
}
