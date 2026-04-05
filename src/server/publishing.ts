import type { DatabaseService, Album, Post, Track, Release } from "./database.js";
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

        // If artistName is provided (e.g. from an album), use it, 
        // otherwise use site artist name setting or fallback
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
     * Publishes a release to GunDB.
     */
    async publishReleaseToGunDB(release: Release): Promise<void> {
        const siteInfo = this.getSiteInfo(release.artist_name);
        if (!siteInfo) {
            console.warn("⚠️ Cannot publish to GunDB: No public URL configured.");
            return;
        }

        console.log(`🚀 Publishing release "${release.title}" to GunDB...`);

        // Ensure site is registered first
        await this.gundb.registerSite(siteInfo);

        // Register tracks (this uses the decoupled metadata)
        const tracks = this.db.getTracksByReleaseId(release.id);
        await this.gundb.registerTracks(siteInfo, release as any, tracks);
    }

    /**
     * Removes a release from GunDB.
     */
    async unpublishReleaseFromGunDB(release: Release): Promise<void> {
        const siteInfo = this.getSiteInfo(release.artist_name);
        if (!siteInfo) return;

        console.log(`🗑️ Unpublishing release "${release.title}" from GunDB...`);
        await this.gundb.unregisterTracks(siteInfo, release as any);
    }

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
                    const note = this.ap.generateNote(release as any, artist, tracks);
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
     * Synchronizes an album's published state (legacy library albums).
     */
    async syncAlbum(albumId: number): Promise<void> {
        const album = this.db.getAlbum(albumId);
        if (!album) return;

        const isPublic = album.visibility === 'public' || album.visibility === 'unlisted';
        const siteInfo = this.getSiteInfo(album.artist_name);

        if (isPublic && siteInfo) {
            console.log(`🚀 Updating library album "${album.title}" on GunDB...`);
            await this.gundb.registerSite(siteInfo);
            const tracks = this.db.getTracks(album.id);
            await this.gundb.registerTracks(siteInfo, album, tracks);
        }
    }

    /**
     * Synchronizes a release's published state based on its visibility and federation flags.
     */
    async syncRelease(releaseId: number): Promise<void> {
        try {
            const release = this.db.getRelease(releaseId);
            if (!release) {
                // Check if it's a legacy album
                const album = this.db.getAlbum(releaseId);
                if (album) {
                    await this.syncAlbum(releaseId);
                }
                return;
            }

            const isPublic = release.visibility === 'public' || release.visibility === 'unlisted';

            // GunDB Logic
            try {
                if (isPublic && release.published_to_gundb) {
                    await this.publishReleaseToGunDB(release);
                } else {
                    await this.unpublishReleaseFromGunDB(release);
                }
            } catch (e) {
                console.error(`❌ GunDB sync failed for release ${releaseId}:`, e);
            }

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

            // Trigger network sync to clean up any orphaned data in GunDB
            this.gundb.syncNetwork().catch(e => console.error("Network sync failed:", e));
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
