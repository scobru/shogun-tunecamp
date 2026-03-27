import play from "play-dl";
import fetch from "node-fetch";

export interface ExternalMetadata {
    title: string;
    artist: string;
    duration: number;
    thumbnail: string;
    url: string;
    service: string;
}

export async function fetchExternalMetadata(url: string): Promise<ExternalMetadata> {
    // 1. YouTube & SoundCloud (via play-dl)
    if (url.includes("youtube.com") || url.includes("youtu.be") || url.includes("soundcloud.com")) {
        try {
            const info = await play.video_info(url);
            const video = info.video_details;
            return {
                title: video.title || "External Track",
                artist: video.channel?.name || "Unknown Artist",
                duration: video.durationInSec || 0,
                thumbnail: video.thumbnails[video.thumbnails.length - 1]?.url || "",
                url: url,
                service: url.includes("soundcloud.com") ? "soundcloud" : "youtube"
            };
        } catch (e) {
            // If play.video_info fails for SoundCloud, try play.soundcloud
            if (url.includes("soundcloud.com")) {
                const info = await play.soundcloud(url);
                if (info.type === 'track') {
                    return {
                        title: (info as any).name || "SoundCloud Track",
                        artist: (info as any).user?.name || "Unknown Artist",
                        duration: Math.floor(((info as any).duration || 0) / 1000),
                        thumbnail: (info as any).thumbnail || "",
                        url: url,
                        service: "soundcloud"
                    };
                }
            }
            throw e;
        }
    }

    // 2. Bandcamp
    if (url.includes("bandcamp.com") || url.includes("bcbits.com")) {
        try {
            const response = await fetch(url.split('?')[0]);
            const html = await response.text();

            let tralbumData = null;
            const match = html.match(/data-tralbum="([^"]+)"/);
            if (match && match[1]) {
                const decoded = match[1].replace(/&quot;/g, '"');
                tralbumData = JSON.parse(decoded);
            }

            if (!tralbumData) {
                // Fallback to script tag
                const scriptMatch = html.match(/var\s+TralbumData\s*=\s*({.*?});/s);
                if (scriptMatch && scriptMatch[1]) {
                    // This is risky for JSON.parse but usually Bandcamp's structure is clean
                    // We might need a tighter regex or a partial parse
                }
            }

            if (tralbumData) {
                const track = tralbumData.trackinfo?.[0];
                const artistMatch = html.match(/<meta property="og:site_name" content="([^"]+)"/);
                const artist = tralbumData.artist || (artistMatch ? artistMatch[1] : "Unknown Artist");
                
                // Bandcamp stream URL (preview)
                const streamUrl = track?.file?.["mp3-128"];

                return {
                    title: track?.title || tralbumData.current?.title || "Bandcamp Track",
                    artist: artist,
                    duration: Math.floor(track?.duration || 0),
                    thumbnail: tralbumData.art_id ? `https://f4.bcbits.com/img/a${tralbumData.art_id}_10.jpg` : "",
                    url: streamUrl || url, // Store stream URL if found
                    service: "bandcamp"
                };
            }
        } catch (e) {
            console.error("Bandcamp metadata error:", e);
        }
    }

    throw new Error("Unsupported service or unable to fetch metadata");
}
