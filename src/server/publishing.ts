import type { DatabaseService, Post, Release } from "./database.js";
import type { GunDBService, SiteInfo } from "./gundb.js";
import type { ActivityPubService } from "./activitypub.js";
import type { ServerConfig } from "./config.js";

export class PublishingService {
    constructor(
        private db: DatabaseService,
        private gundb: GunDBService,
        private ap: ActivityPubService,
        private config: ServerConfig
    ) {}

    private getSiteInfo(artistName?: string): SiteInfo | null {
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        if (!publicUrl) return null;

        const siteName = this.db.getSetting("siteName") || this.config.siteName || "TuneCamp Server";
        const siteDescription = this.db.getSetting("siteDescription") || "";
        const coverImage = this.db.getSetting("coverImage") || "";

        const siteArtistName = this.db.getSetting("artistName");
        const effectiveArtistName = artistName || siteArtistName || "Unknown Artist";

        return {
            url: publicUrl,
            title: siteName,
            description: siteDescription,
            artistName: effectiveArtistName,
            coverImage: coverImage
        };
    }

    // --- Releases ---

    /**
     * Broadcasts a release via ActivityPub.
     */
    async publishReleaseToAP(release: Release): Promise<void> {
        if (!this.getSiteInfo()) {
            console.warn("⚠️ Cannot publish to ActivityPub: No public URL configured.");
            return;
        }

        console.log(`📢 Broadcasting release "${release.title}" via ActivityPub...`);
        try {
            await this.ap.broadcastRelease(release as any);

            // Also announce to relay for global discovery
            if (release.artist_id) {
                const artist = this.db.getArtist(release.artist_id);
                if (artist) {
                    const tracks = this.db.getTracksByReleaseId(release.id);
                    const note = this.ap.generateNote({ ...release, is_release: true } as any, artist, tracks);
                    await this.ap.announceToRelay(note);
                }
            }
        } catch (e) {
            console.error("❌ Failed to broadcast release via ActivityPub:", e);
        }
    }

    /**
     * Broadcasts a deletion of a release via ActivityPub.
     */
    async unpublishReleaseFromAP(release: Release): Promise<void> {
        console.log(`🗑️ Broadcasting deletion of release "${release.title}" via ActivityPub...`);
        try {
            await this.ap.broadcastDelete(release as any);
        } catch (e) {
            console.error("❌ Failed to broadcast release deletion via ActivityPub:", e);
        }
    }

    /**
     * Ensures the instance is registered in the GunDB community directory.
     * Called during release sync to keep our instance visible.
     */
    private async ensureSiteRegistered(artistName?: string): Promise<void> {
        const siteInfo = this.getSiteInfo(artistName);
        if (siteInfo) {
            await this.gundb.registerSite(siteInfo);
        }
    }

    /**
     * Synchronizes a release's published state based on its visibility and federation flags.
     */
    async syncRelease(releaseId: number): Promise<void> {
        try {
            const release = this.db.getRelease(releaseId);
            if (!release) return;

            const isPublic = release.visibility === 'public' || release.visibility === 'unlisted';

            // Ensure our instance is registered in GunDB for discovery
            await this.ensureSiteRegistered(release.artist_name);

            // ActivityPub Logic
            try {
                if (isPublic && release.published_to_ap) {
                    await this.publishReleaseToAP(release);
                } else {
                    await this.unpublishReleaseFromAP(release);
                }
            } catch (e) {
                console.error(`❌ ActivityPub sync failed for release ${releaseId}:`, e);
            }

            // Zen (GunDB) Logic
            try {
                if (isPublic && release.published_to_gundb) {
                    await this.gundb.publishRelease(releaseId);
                } else {
                    await this.gundb.unpublishRelease(releaseId);
                }
            } catch (e) {
                console.error(`❌ Zen sync failed for release ${releaseId}:`, e);
            }
        } catch (error) {
            console.error(`🔥 Critical error in syncRelease for ${releaseId}:`, error);
        }
    }

    // --- Posts ---

    async publishPostToAP(post: Post): Promise<void> {
        if (post.visibility !== 'public') return;
        console.log(`📢 Broadcasting post "${post.slug}" via ActivityPub...`);
        try {
            await this.ap.broadcastPost(post);
        } catch (e) {
            console.error("❌ Failed to broadcast post via ActivityPub:", e);
        }
    }

    async unpublishPostFromAP(post: Post): Promise<void> {
        console.log(`🗑️ Broadcasting deletion of post "${post.slug}" via ActivityPub...`);
        try {
            await this.ap.broadcastPostDelete(post);
        } catch (e) {
            console.error("❌ Failed to broadcast post deletion via ActivityPub:", e);
        }
    }

    async syncPost(postId: number): Promise<void> {
        const post = this.db.getPost(postId);
        if (!post) return;

        if (post.visibility === 'public') {
            await this.publishPostToAP(post);
        } else {
            await this.unpublishPostFromAP(post);
        }
    }

    async syncCommunityFollows(): Promise<{ discovered: number, followed: number }> {
        console.log("🌐 Starting decentralized community discovery via GunDB...");
        
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        if (!publicUrl) {
            console.warn("⚠️ Skipping community sync: No public URL configured.");
            return { discovered: 0, followed: 0 };
        }

        try {
            const sites = await this.gundb.getCommunitySites();
            const myUrl = publicUrl.replace(/\/$/, "");
            
            let followedCount = 0;
            const remoteActors = this.db.getRemoteActors();
            const existingUris = new Set(remoteActors.map(a => a.uri.replace(/\/$/, "")));

            for (const site of sites) {
                if (!site.url) continue;
                const siteUrl = site.url.replace(/\/$/, "");
                if (siteUrl === myUrl || siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1")) continue;
                const siteActorUri = `${siteUrl}/users/site`;
                if (!existingUris.has(siteActorUri)) {
                    console.log(`📡 Discovered new instance: ${site.title} (${siteUrl}). Sending follow request...`);
                    try {
                        await this.ap.followRemoteActor(siteActorUri, "site");
                        followedCount++;
                    } catch (e) {
                        console.error(`❌ Failed to follow discovered instance ${siteUrl}:`, e);
                    }
                }
            }
            return { discovered: sites.length, followed: followedCount };
        } catch (error) {
            console.error("❌ Error during community follow sync:", error);
            return { discovered: 0, followed: 0 };
        }
    }
}

export function createPublishingService(
    db: DatabaseService,
    gundb: GunDBService,
    ap: ActivityPubService,
    config: ServerConfig
): PublishingService {
    return new PublishingService(db, gundb, ap, config);
}
