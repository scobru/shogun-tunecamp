/**
 * Podcast RSS Feed Generator for Tunecamp
 * Creates podcast-specific RSS feeds for episodic content
 */

import path from "path";
import { Catalog, Release, Track } from "../types/index.js";
import { normalizeUrl } from "../utils/audioUtils.js";

export interface PodcastOptions {
    siteUrl: string;
    basePath: string;
    podcastTitle?: string;
    podcastDescription?: string;
    podcastAuthor?: string;
    podcastEmail?: string;
    podcastCategory?: string;
    podcastImage?: string;
    explicit?: boolean;
}

/**
 * Generates podcast-specific RSS 2.0 feeds
 */
export class PodcastFeedGenerator {
    private catalog: Catalog;
    private options: PodcastOptions;

    constructor(catalog: Catalog, options: PodcastOptions) {
        this.catalog = catalog;
        this.options = options;
    }

    /**
     * Get the full URL for a path
     */
    private getUrl(relativePath: string): string {
        const base = normalizeUrl(this.options.siteUrl);
        const basePath = this.options.basePath || "";
        return `${base}${basePath}/${relativePath}`.replace(/([^:]\/)\/+/g, "$1");
    }

    /**
     * Format date for RSS (RFC 822)
     */
    private formatRssDate(dateStr: string): string {
        const date = new Date(dateStr);
        return date.toUTCString();
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    /**
     * Format duration in HH:MM:SS format for iTunes
     */
    private formatItunesDuration(seconds?: number): string {
        if (!seconds) return "00:00:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Get MIME type for audio file
     */
    private getAudioMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.aac': 'audio/aac',
            '.ogg': 'audio/ogg',
            '.opus': 'audio/opus',
            '.flac': 'audio/flac',
            '.wav': 'audio/wav',
        };
        return mimeTypes[ext] || 'audio/mpeg';
    }

    /**
     * Generate Podcast RSS feed
     * Each track becomes an episode
     */
    generatePodcastFeed(): string {
        const title = this.escapeXml(this.options.podcastTitle || this.catalog.config.title);
        const description = this.escapeXml(this.options.podcastDescription || this.catalog.config.description || "Music podcast");
        const link = this.getUrl("");
        const feedUrl = this.getUrl("podcast.xml");
        const author = this.escapeXml(this.options.podcastAuthor || this.catalog.artist?.name || "Unknown");
        const email = this.options.podcastEmail || "";
        const category = this.options.podcastCategory || "Music";
        const explicit = this.options.explicit ? "true" : "false";
        const now = new Date().toUTCString();

        // Get image URL
        let imageUrl = this.getUrl("logo.svg");
        if (this.options.podcastImage) {
            imageUrl = this.getUrl(this.options.podcastImage);
        } else if (this.catalog.artist?.photo) {
            imageUrl = this.getUrl(this.catalog.artist.photo);
        }

        // Collect all episodes (tracks from all releases)
        const episodes: Array<{
            track: Track;
            release: Release;
            pubDate: string;
        }> = [];

        for (const release of this.catalog.releases) {
            if (release.config.unlisted) continue;

            for (const track of release.tracks) {
                episodes.push({
                    track,
                    release,
                    pubDate: release.config.date,
                });
            }
        }

        // Sort episodes by date (newest first)
        episodes.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

        const items = episodes.map((ep, index) => this.generateEpisodeItem(ep.track, ep.release, episodes.length - index)).join("\n");

        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:podcast="https://podcastindex.org/namespace/1.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${title}</title>
    <link>${link}</link>
    <description>${description}</description>
    <language>${this.catalog.config.language || "en"}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>Tunecamp Podcast Generator</generator>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    
    <!-- iTunes Podcast Tags -->
    <itunes:author>${author}</itunes:author>
    <itunes:summary>${description}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:explicit>${explicit}</itunes:explicit>
    <itunes:category text="${this.escapeXml(category)}"/>
    <itunes:image href="${imageUrl}"/>
    ${email ? `<itunes:owner><itunes:name>${author}</itunes:name><itunes:email>${email}</itunes:email></itunes:owner>` : ''}
    
    <!-- Podcast 2.0 Tags -->
    <podcast:locked>no</podcast:locked>

${items}
  </channel>
</rss>`;
    }

    /**
     * Generate a single episode item
     */
    private generateEpisodeItem(track: Track, release: Release, episodeNumber: number): string {
        const title = this.escapeXml(`${track.title} (from ${release.config.title})`);
        const description = this.escapeXml(track.description || release.config.description || `Episode ${episodeNumber}`);
        const audioUrl = this.getUrl(`releases/${release.slug}/${path.basename(track.file)}`);
        const pageUrl = this.getUrl(`releases/${release.slug}/index.html`);
        const pubDate = this.formatRssDate(release.config.date);
        const duration = this.formatItunesDuration(track.duration);
        const mimeType = this.getAudioMimeType(track.file);
        const guid = `${release.slug}-${path.basename(track.file, path.extname(track.file))}`;
        const artist = this.catalog.artist?.name || "Unknown Artist";

        // Get cover image
        let imageUrl = "";
        if (release.coverPath) {
            imageUrl = this.getUrl(`releases/${release.slug}/${path.basename(release.coverPath)}`);
        }

        return `    <item>
      <title>${title}</title>
      <link>${pageUrl}</link>
      <description><![CDATA[${description}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <enclosure url="${audioUrl}" type="${mimeType}" length="0"/>
      
      <itunes:title>${this.escapeXml(track.title)}</itunes:title>
      <itunes:author>${this.escapeXml(artist)}</itunes:author>
      <itunes:duration>${duration}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:episode>${episodeNumber}</itunes:episode>
      ${imageUrl ? `<itunes:image href="${imageUrl}"/>` : ''}
    </item>`;
    }
}