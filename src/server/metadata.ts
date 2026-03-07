import fetch from "node-fetch";

const USER_AGENT = "TuneCamp/1.0.0 ( contact@tunecamp.app )";

interface MusicBrainzRelease {
    id: string;
    title: string;
    "artist-credit"?: { name: string }[];
    date?: string;
    score?: number;
}

interface MusicBrainzRecording {
    id: string;
    title: string;
    "artist-credit"?: { name: string }[];
    length?: number;
    releases?: { id: string, title: string, "artist-credit"?: { name: string }[] }[];
}

export interface MetadataMatch {
    id: string; // MBID
    title: string;
    artist: string;
    date: string;
    coverUrl?: string;
    albumTitle?: string;
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

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                console.error(`MusicBrainz API error: ${response.status}`);
                return [];
            }

            const data = await response.json() as any;
            const recordings = (data.recordings || []) as MusicBrainzRecording[];

            return recordings.map(r => {
                const release = r.releases?.[0];
                return {
                    id: r.id,
                    title: r.title,
                    artist: r["artist-credit"]?.[0]?.name || "Unknown",
                    date: "", // Recording doesn't have a single date usually
                    coverUrl: release ? `https://coverartarchive.org/release/${release.id}/front-250` : undefined,
                    albumTitle: release?.title
                };
            });
        } catch (error) {
            console.error("Error searching MusicBrainz recordings:", error);
            return [];
        }
    }

    async getCoverUrl(mbid: string): Promise<string | null> {
        // optimistically return the URL, client will fail if not exists
        return `https://coverartarchive.org/release/${mbid}/front`;
    }
}

export const metadataService = new MetadataService();
