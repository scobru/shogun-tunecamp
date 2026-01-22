import fetch from "node-fetch";

const USER_AGENT = "TuneCamp/1.0.0 ( contact@tunecamp.app )";

interface MusicBrainzRelease {
    id: string;
    title: string;
    "artist-credit"?: { name: string }[];
    date?: string;
    score?: number;
}

export interface MetadataMatch {
    id: string; // MBID
    title: string;
    artist: string;
    date: string;
    coverUrl?: string;
}

export class MetadataService {

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                console.error(`MusicBrainz API error: ${response.status}`);
                return [];
            }

            const data = await response.json() as any;
            const releases = (data.releases || []) as MusicBrainzRelease[];

            return releases.map(r => ({
                id: r.id,
                title: r.title,
                artist: r["artist-credit"]?.[0]?.name || "Unknown",
                date: r.date || "",
                // Cover Art is fetched separately usually, but we can guess the URL
                coverUrl: `https://coverartarchive.org/release/${r.id}/front-250`
            }));
        } catch (error) {
            console.error("Error searching MusicBrainz:", error);
            return [];
        }
    }

    async getCoverUrl(mbid: string): Promise<string | null> {
        // optimistically return the URL, client will fail if not exists
        return `https://coverartarchive.org/release/${mbid}/front`;
    }
}

export const metadataService = new MetadataService();
