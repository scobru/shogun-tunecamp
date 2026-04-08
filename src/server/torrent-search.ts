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
            // 1. Try "Music" category first (Standard)
            console.log(`🔍 Querying 'Music' category...`);
            let results = await TorrentSearchApi.search(query, "Music", 30);
            console.log(`📊 'Music' results found: ${results?.length || 0}`);

            // 2. Fallback to "All" if no results found in Music
            if (!results || results.length === 0) {
                console.log("⚠️ No results in 'Music' category, trying 'All'...");
                results = await TorrentSearchApi.search(query, "All", 30);
                console.log(`📊 'All' results found: ${results?.length || 0}`);
            }

            if (!results || results.length === 0) {
                console.log("⚠️ No torrent results found even in 'All' category.");
                // One last try: if query is short, maybe it's too specific? 
                // No, nirvana is fine. 
                return [];
            }

            console.log(`✅ Found ${results.length} raw results. Resolving magnet links...`);

            // 3. Resolve magnet links for results that don't have them
            // We limit to top 15 results to avoid too many requests / timeouts
            const topResults = results.slice(0, 15);
            const resolvedResults = await Promise.all(topResults.map(async (r: any) => {
                try {
                    // If magnet is missing or looks like a placeholder, fetch it
                    if (!r.magnet || !r.magnet.startsWith("magnet:")) {
                        const magnet = await TorrentSearchApi.getMagnet(r);
                        if (magnet) r.magnet = magnet;
                    }
                    return r;
                } catch (e) {
                    return r;
                }
            }));

            // 4. Map and filter
            const mappedResults: TorrentSearchResult[] = resolvedResults
                .filter(r => r.magnet && r.magnet.startsWith("magnet:")) // Only keep results with a valid magnet
                .map((r: any) => ({
                    title: r.title,
                    magnet: r.magnet,
                    seeders: parseInt(r.seeds) || parseInt(r.seeders) || 0,
                    leechers: parseInt(r.peers) || parseInt(r.leechers) || 0,
                    size: r.size || "Unknown",
                    verified: !!r.vip || !!r.trusted,
                    provider: r.provider
                }));

            console.log(`✨ Successfully resolved ${mappedResults.length} torrents with valid magnets.`);

            // Sort by seeders
            return mappedResults.sort((a, b) => b.seeders - a.seeders);

        } catch (error) {
            console.error("❌ Torrent Search Error:", error);
            return [];
        }
    }
}
