import type { DatabaseService, Album, Post, Track } from "./database.js";
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

        // If artistName is provided (e.g. from an album), use it, otherwise use site artist name or fallback
        const effectiveArtistName = artistName || this.db.getSetting("artistName") || "";

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
     * Note: This also registers the site if needed.
     */
    async publishReleaseToGunDB(album: Album): Promise<void> {
        const siteInfo = this.getSiteInfo(album.artist_name);
        if (!siteInfo) {
            console.warn("⚠️ Cannot publish to GunDB: No public URL configured.");
            return;
        }

        console.log(`🚀 Publishing release "${album.title}" to GunDB...`);

        // Ensure site is registered first
        await this.gundb.registerSite(siteInfo);

        // Register tracks
        const tracks = this.db.getTracksByReleaseId(album.id);
        await this.gundb.registerTracks(siteInfo, album, tracks);
    }

    /**
     * Removes a release from GunDB.
     */
    async unpublishReleaseFromGunDB(album: Album): Promise<void> {
        const siteInfo = this.getSiteInfo(album.artist_name);
        if (!siteInfo) return; // Can't unpublish if we don't know where we are, but usually safe to ignore

        console.log(`🗑️ Unpublishing release "${album.title}" from GunDB...`);
        await this.gundb.unregisterTracks(siteInfo, album);
    }

    /**
     * Broadcasts a release via ActivityPub.
     */
    async publishReleaseToAP(album: Album): Promise<void> {
        if (!this.getSiteInfo()) {
            console.warn("⚠️ Cannot publish to ActivityPub: No public URL configured.");
            return;
        }

        console.log(`📢 Broadcasting release "${album.title}" via ActivityPub...`);
        try {
            await this.ap.broadcastRelease(album);

            // Also announce to relay for global discovery (mirroring GunDB registry)
            if (album.artist_id) {
                const artist = this.db.getArtist(album.artist_id);
                if (artist) {
                    const tracks = this.db.getTracksByReleaseId(album.id);
                    const note = this.ap.generateNote(album, artist, tracks);
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
    async unpublishReleaseFromAP(album: Album): Promise<void> {
        console.log(`🗑️ Broadcasting deletion of release "${album.title}" via ActivityPub...`);
        try {
            await this.ap.broadcastDelete(album);
        } catch (e) {
            console.error("❌ Failed to broadcast release deletion via ActivityPub:", e);
        }
    }

    /**
     * Synchronizes a release's published state based on its visibility and federation flags.
     * This is the main entry point for updates.
     */
    async syncRelease(albumId: number): Promise<void> {
        const album = this.db.getAlbum(albumId);
        if (!album) return;

        const isPublic = album.visibility === 'public' || album.visibility === 'unlisted';

        // GunDB Logic
        if (isPublic && album.published_to_gundb) {
            await this.publishReleaseToGunDB(album);
        } else {
            // If it's private OR published_to_gundb is false, ensure it's removed
            await this.unpublishReleaseFromGunDB(album);
        }

        // ActivityPub Logic
        if (isPublic && album.published_to_ap) {
            await this.publishReleaseToAP(album);
        } else {
            // If it's private OR published_to_ap is false, ensure deletion is broadcast
            // Note: If it was never published, this might send an unnecessary delete,
            // but AP service handles "no followers" or "no note found" gracefully.
            await this.unpublishReleaseFromAP(album);
        }

        // Trigger network sync to clean up any orphaned data in GunDB
        this.gundb.syncNetwork().catch(e => console.error("Network sync failed:", e));
    }

    // --- Posts ---

    /**
     * Broadcasts a post via ActivityPub.
     * Note: Posts are currently only federated via ActivityPub, not GunDB.
     */
    async publishPostToAP(post: Post): Promise<void> {
        if (post.visibility !== 'public') return;

        console.log(`📢 Broadcasting post "${post.slug}" via ActivityPub...`);
        try {
            await this.ap.broadcastPost(post);
        } catch (e) {
            console.error("❌ Failed to broadcast post via ActivityPub:", e);
        }
    }

    /**
     * Broadcasts a deletion of a post via ActivityPub.
     */
    async unpublishPostFromAP(post: Post): Promise<void> {
        console.log(`🗑️ Broadcasting deletion of post "${post.slug}" via ActivityPub...`);
        try {
            await this.ap.broadcastPostDelete(post);
        } catch (e) {
            console.error("❌ Failed to broadcast post deletion via ActivityPub:", e);
        }
    }

    /**
     * Synchronizes a post's published state.
     */
    async syncPost(postId: number): Promise<void> {
        const post = this.db.getPost(postId);
        if (!post) return;

        if (post.visibility === 'public') {
            await this.publishPostToAP(post);
        } else {
            await this.unpublishPostFromAP(post);
        }
    }

    /**
     * Automatically discovers other Tunecamp instances via GunDB 
     * and follows their Site Actor via ActivityPub to create a decentralized mesh.
     */
    async syncCommunityFollows(): Promise<{ discovered: number, followed: number }> {
        console.log("🌐 Starting decentralized community discovery via GunDB...");
        
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        if (!publicUrl) {
            console.warn("⚠️ Skipping community sync: No public URL configured.");
            return { discovered: 0, followed: 0 };
        }

        try {
            // 1. Get all sites registered in the GunDB community
            const sites = await this.gundb.getCommunitySites();
            const myUrl = publicUrl.replace(/\/$/, ""); // Normalize
            
            let followedCount = 0;
            const remoteActors = this.db.getRemoteActors();
            const existingUris = new Set(remoteActors.map(a => a.uri.replace(/\/$/, "")));

            for (const site of sites) {
                if (!site.url) continue;
                
                const siteUrl = site.url.replace(/\/$/, "");
                
                // Skip self
                if (siteUrl === myUrl || siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1")) {
                    continue;
                }

                // The Site Actor URI for a Tunecamp instance is always /users/site
                const siteActorUri = `${siteUrl}/users/site`;
                
                // If we haven't interacted with this actor yet, follow it
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

            console.log(`✅ Community sync complete. Discovered ${sites.length} sites, followed ${followedCount} new instances.`);
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
