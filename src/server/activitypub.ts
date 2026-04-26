import crypto from "crypto";
import { promisify } from "util";
import fetch from "node-fetch";
import { drainResponse, fetchJsonSafe } from "./utils.js";
import type { Federation } from "@fedify/fedify";
import { Follow, Announce } from "@fedify/fedify";
import type { DatabaseService, Artist, Album, Track, Post } from "./database.js";
import type { ServerConfig } from "./config.js";

export class ActivityPubService {
    constructor(
        private db: DatabaseService,
        private config: ServerConfig,
        private federation: Federation<void>
    ) { }

    public getDomain(): string {
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        if (!publicUrl) return "localhost";
        return new URL(publicUrl).hostname;
    }

    public getBaseUrl(): string {
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        let url = publicUrl || `http://localhost:${this.config.port}`;
        if (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        return url;
    }

    // Key Management
    public async ensureArtistKeys(artistId: number): Promise<void> {
        const artist = this.db.getArtist(artistId);
        if (!artist) return;

        if (!artist.public_key || !artist.private_key) {
            console.log(`🔑 Generating ActivityPub keys for artist: ${artist.name}`);
            const { publicKey, privateKey } = await this.generateKeyPair();
            this.db.updateArtistKeys(artistId, publicKey, privateKey);
        }
    }

    public async generateKeysForAllArtists(): Promise<void> {
        const artists = this.db.getArtists();

        // Generate keys for all artists concurrently
        await Promise.all(artists.map(artist => this.ensureArtistKeys(artist.id)));

        // Generate keys for the Site Actor if they don't exist
        if (!this.db.getSetting("site_public_key")) {
            console.log(`📡 Generating keys for Site Actor...`);
            const { publicKey, privateKey } = await this.generateKeyPair();
            this.db.setSetting("site_public_key", publicKey);
            this.db.setSetting("site_private_key", privateKey);
        }
    }

    /**
     * Follow a remote ActivityPub Actor (Site or Person)
     */
    public async followRemoteActor(actorUri: string, followerHandle: string = "site") {
        try {
            console.log(`📡 Attempting to follow remote actor: ${actorUri} as ${followerHandle}`);
            const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
            if (!publicUrl) {
                console.warn("⚠️ No public URL configured, cannot follow remote actors");
                return;
            }

            const baseUrl = this.getBaseUrl();

            // Normalize URI
            let resolvedActorUri = actorUri.trim();
            if (!resolvedActorUri.startsWith("http")) {
                resolvedActorUri = `https://${resolvedActorUri}`;
            }

            // Remove trailing slashes for consistency
            if (resolvedActorUri.endsWith("/")) {
                resolvedActorUri = resolvedActorUri.slice(0, -1);
            }

            // Funkwhale profile URL normalization: https://domain/@user -> try to resolve to actor URI
            if (resolvedActorUri.includes("/@")) {
                console.log(`👤 Detected profile URL, attempting to resolve actor: ${resolvedActorUri}`);
                try {
                    const url = new URL(resolvedActorUri);
                    const domain = url.hostname;
                    const username = url.pathname.split("/@")[1];
                    const actorId = await this.getActorIdFromWebFinger(domain, username);
                    if (actorId) {
                        resolvedActorUri = actorId;
                        console.log(`✨ Resolved via WebFinger to: ${resolvedActorUri}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to resolve profile URL via WebFinger: ${resolvedActorUri}`);
                }
            }

            // Check for self-follow
            if (resolvedActorUri === baseUrl || resolvedActorUri === `${baseUrl}/` || resolvedActorUri === `${baseUrl}/users/site`) {
                console.warn(`🛑 Self-following is disabled: ${resolvedActorUri}`);
                return;
            }

            // Robust Resolution Phase
            console.log(`🔍 Resolving actor: ${resolvedActorUri}`);
            let finalActorUri = resolvedActorUri;
            
            // If the URL is just a domain root, try to discover the site actor
            try {
                const url = new URL(resolvedActorUri);
                if (url.pathname === "/" || url.pathname === "") {
                    const discoveredUri = await this.discoverSiteActor(url.origin);
                    if (discoveredUri) {
                        finalActorUri = discoveredUri;
                        console.log(`✨ Discovered site actor: ${finalActorUri}`);
                    }
                }
            } catch (urlErr) {
                console.warn(`⚠️ Invalid actor URL during resolution: ${resolvedActorUri}`);
            }

            const followerId = new URL(`/users/${followerHandle}`, baseUrl);

            // Resolve inbox from final actor URI
            console.log(`🔍 Resolving inbox for actor: ${finalActorUri}`);
            const inboxUri = await this.getInboxFromActor(finalActorUri);
            if (!inboxUri) {
                console.error(`❌ Could not resolve inbox for actor: ${finalActorUri}`);
                // Proceed to fetch remote outbox directly (for instances like Funkwhale libraries that don't have an inbox)
                this.fetchRemoteOutbox(finalActorUri).catch(e => console.error(`⚠️ Failed to pre-fetch outbox for ${finalActorUri}:`, e));
                return;
            }

            const follow = new Follow({
                actor: followerId,
                object: new URL(finalActorUri),
            });

            // Send Follow activity using the shared helper
            if (followerHandle === "site") {
                await this.sendActivity({ id: -1, slug: "site" } as any, inboxUri, follow);
            } else {
                const artist = this.db.getArtistBySlug(followerHandle);
                if (artist) {
                    await this.sendActivity(artist, inboxUri, follow);
                }
            }
            console.log(`📤 Sent Follow request to: ${inboxUri}`);

            // Immediately fetch remote outbox to populate the feed with existing content
            // We await it now to prevent parallel memory spikes during mass discovery
            try {
                await this.fetchRemoteOutbox(finalActorUri);
            } catch (e) {
                console.error(`⚠️ Failed to pre-fetch outbox for ${finalActorUri}:`, e);
            }

            // Record in DB as followed
            try {
                const res = await this.fetchWithSignature(finalActorUri);
                if (res.ok) {
                    const actorData = await res.json() as any;
                    this.db.upsertRemoteActor({
                        uri: finalActorUri,
                        type: typeof actorData.type === 'string' ? actorData.type : (Array.isArray(actorData.type) ? actorData.type[0] : 'Person'),
                        username: this.getString(actorData.preferredUsername),
                        name: this.getString(actorData.name),
                        summary: this.getString(actorData.summary),
                        icon_url: this.getString(actorData.icon),
                        inbox_url: this.getString(actorData.inbox),
                        outbox_url: this.getString(actorData.outbox),
                        is_followed: true
                    } as any);
                } else {
                    this.db.upsertRemoteActor({
                        uri: finalActorUri,
                        type: 'Person',
                        is_followed: true
                    } as any);
                }
            } catch (dbErr) {
                console.warn(`⚠️ Could not update following status in DB for ${finalActorUri}`, dbErr);
            }

        } catch (e) {
            console.error(`❌ Failed to follow actor ${actorUri}:`, e);
            throw e;
        }
    }

    /**
     * Unfollow a remote ActivityPub Actor
     */
    public async unfollowRemoteActor(actorUri: string, followerHandle: string = "site") {
        try {
            console.log(`📡 Attempting to unfollow remote actor: ${actorUri} as ${followerHandle}`);
            const baseUrl = this.getBaseUrl();
            const followerId = new URL(`/users/${followerHandle}`, baseUrl);

            // Resolve inbox 
            const inboxUri = await this.getInboxFromActor(actorUri);
            if (!inboxUri) {
                console.warn(`⚠️ Could not resolve inbox for actor: ${actorUri}, updating local DB only`);
                this.db.unfollowActor(actorUri);
                return;
            }

            // In ActivityPub, Unfollow is an Undo of the Follow activity
            const undo = {
                "@context": "https://www.w3.org/ns/activitystreams",
                type: "Undo",
                actor: followerId.toString(),
                object: {
                    type: "Follow",
                    actor: followerId.toString(),
                    object: actorUri
                }
            };

            if (followerHandle === "site") {
                await this.sendActivity({ id: -1, slug: "site" } as any, inboxUri, undo);
            } else {
                const artist = this.db.getArtistBySlug(followerHandle);
                if (artist) {
                    await this.sendActivity(artist, inboxUri, undo);
                }
            }

            this.db.unfollowActor(actorUri);
            console.log(`📤 Sent Unfollow request to: ${inboxUri}`);
        } catch (e) {
            console.error(`❌ Failed to unfollow actor ${actorUri}:`, e);
            throw e;
        }
    }

    /**
     * Fetches and parses a remote actor's outbox to populate the local feed.
     */
    public async fetchRemoteOutbox(actorUri: string): Promise<void> {
        console.log(`📥 Fetching remote outbox for: ${actorUri}`);
        
        // Helper: ActivityPub types can be a string OR an array of strings
        const hasType = (typeField: any, ...targets: string[]): boolean => {
            if (!typeField) return false;
            // Handle both string and array of strings
            const types = Array.isArray(typeField) ? typeField : [typeField];
            // Normalize to string values for comparison if they are objects
            const typeStrings = types.map(t => typeof t === 'string' ? t.toLowerCase() : (t.type || t.toString()).toLowerCase());
            return targets.some(t => typeStrings.includes(t.toLowerCase()));
        };

        try {
            // 1. Get Actor profile to find outbox URL and metadata
            // Use signed fetch to support instances with Authorized Fetch enabled (like Funkwhale)
            const res = await this.fetchWithSignature(actorUri);
            if (!res.ok) {
                console.error(`❌ Failed to fetch actor profile ${actorUri}: ${res.status}`);
                return;
            }
            const actor = await res.json() as any;
            
            // Collect outboxes/libraries to scan
            const outboxesToScan: Set<string> = new Set();
            if (hasType(actor.type, "Library", "Collection", "OrderedCollection")) {
                outboxesToScan.add(actorUri);
            }
            if (actor.outbox) outboxesToScan.add(typeof actor.outbox === 'string' ? actor.outbox : actor.outbox.id);
            
            // Funkwhale specific: Library and libraries collections
            if (actor.library) outboxesToScan.add(typeof actor.library === 'string' ? actor.library : actor.library.id);
            if (actor.libraries) {
                const libs = Array.isArray(actor.libraries) ? actor.libraries : [actor.libraries];
                libs.forEach((l: any) => outboxesToScan.add(typeof l === 'string' ? l : l.id));
            }

            // Also check for 'featured' and other common collections
            if (actor.featured) outboxesToScan.add(typeof actor.featured === 'string' ? actor.featured : actor.featured.id);

            console.log(`🔍 Scanning ${outboxesToScan.size} collections for actor ${actorUri}`);

            for (const outboxUrl of outboxesToScan) {
                if (!outboxUrl) continue;
                console.log(`  📂 Fetching collection: ${outboxUrl}`);

                // 2. Fetch pages of outbox/collection
                try {
                    let currentUrl: string | null = outboxUrl;
                    let pageCount = 0;
                    const maxPages = 2; // Reduced further to prevent OOM
                    const maxItemsToResolve = 50; // Cap total items to resolve per outbox to limit memory usage
                    let resolvedItemsCount = 0;
                    const visitedUrls = new Set<string>();

                    while (currentUrl && pageCount < maxPages && !visitedUrls.has(currentUrl) && resolvedItemsCount < maxItemsToResolve) {
                        visitedUrls.add(currentUrl);
                        const pageRes = await this.fetchWithSignature(currentUrl);
                        if (!pageRes.ok) {
                            console.warn(`⚠️ Failed to fetch page: ${currentUrl} (${pageRes.status})`);
                            break;
                        }

                        let outbox = await pageRes.json() as any;

                        // If we fetched the main collection and it has a 'first' page, navigate to it
                        if (pageCount === 0 && outbox.first) {
                             currentUrl = typeof outbox.first === 'string' ? outbox.first : outbox.first.id;
                             pageCount++;
                             continue;
                        }

                        const items = outbox.orderedItems || outbox.items || [];
                        console.log(`📑 Found ${items.length} items in page ${pageCount + 1}`);

                        // Periodically clear memory if processing many pages
                        if (pageCount > 0 || resolvedItemsCount % 10 === 0) {
                            if ((global as any).gc) {
                                (global as any).gc();
                            }
                            const memory = process.memoryUsage();
                            console.log(`[AP] Outbox Progress: ${pageCount} pages, ${resolvedItemsCount} items. Heap: ${Math.round(memory.heapUsed / 1024 / 1024)}MB / ${Math.round(memory.heapTotal / 1024 / 1024)}MB`);
                        }

                    for (const activity of items) {
                        if (resolvedItemsCount >= maxItemsToResolve) {
                            console.log(`🛑 Reached max items limit (${maxItemsToResolve}) for outbox ${outboxUrl}`);
                            break;
                        }
                        try {
                            if (!activity || typeof activity !== 'object') continue;

                            // Handle both direct objects and activities (Create, Announce, Listen)
                            let obj = activity;
                            if (hasType(activity.type, "Create", "Announce", "Listen")) {
                                obj = activity.object;
                            }

                            if (!obj) continue;

                            // Resolve object if it's just a URI
                            let resolvedObj = obj;
                            if (typeof obj === 'string') {
                                const objRes = await this.fetchWithSignature(obj);
                                if (objRes.ok) resolvedObj = await objRes.json();
                                else continue;
                            }

                            // Check if this is a known content type
                            if (hasType(resolvedObj.type, "Note", "Audio", "Track", "Album", "MusicRecording", "MusicAlbum", "Article")) {
                                let type = 'post';
                                // Music markers: Audio, Track, MusicRecording, MusicAlbum, or objects with audio attachments
                                const isMusic = hasType(resolvedObj.type, "Audio", "Track", "Album", "MusicRecording", "MusicAlbum") ||
                                              (resolvedObj.attachment && Array.isArray(resolvedObj.attachment) && resolvedObj.attachment.some((a: any) => hasType(a.type, "Audio") || a.mediaType?.startsWith("audio/")));

                                if (isMusic) {
                                    type = 'release';
                                }

                                // Mapping logic
                                const attachments = Array.isArray(resolvedObj.attachment) ? resolvedObj.attachment : (resolvedObj.attachment ? [resolvedObj.attachment] : []);
                                const audioAttachment = attachments.find((a: any) => hasType(a.type, "Audio") || a.mediaType?.startsWith("audio/"));
                                
                                let streamUrlCandidate = audioAttachment?.url || audioAttachment?.href || audioAttachment || resolvedObj.url;
                                let finalStreamUrl = this.getString(streamUrlCandidate);
                                if (Array.isArray(streamUrlCandidate)) {
                                    const audioLink = streamUrlCandidate.find((u: any) => u?.mediaType?.startsWith("audio/"));
                                    if (audioLink) {
                                        finalStreamUrl = this.getString(audioLink.href || audioLink.url);
                                    }
                                } else if (streamUrlCandidate && typeof streamUrlCandidate === 'object' && streamUrlCandidate.mediaType?.startsWith("audio/")) {
                                    finalStreamUrl = this.getString(streamUrlCandidate.href || streamUrlCandidate.url);
                                }

                                    const remoteContent = {
                                        ap_id: this.getString(resolvedObj.id),
                                        actor_uri: this.getString(actorUri),
                                        type: type,
                                        title: this.getString(resolvedObj.name || resolvedObj.title || resolvedObj.content?.replace(/<[^>]*>?/gm, '').substring(0, 50) || "Untitled"),
                                        content: this.getString(resolvedObj.content || resolvedObj.summary || ""),
                                        url: this.getString(resolvedObj.url || (Array.isArray(resolvedObj.url) ? resolvedObj.url[0]?.href : resolvedObj.url?.href)),
                                        cover_url: this.getString(resolvedObj.image?.url || resolvedObj.icon?.url || (attachments.find((a: any) => hasType(a.type, "Image") || a.mediaType?.startsWith("image/"))?.url) || resolvedObj.track?.album?.image?.url),
                                        stream_url: finalStreamUrl,
                                        artist_name: this.getString(resolvedObj.attributedTo?.name || actor.name || actor.preferredUsername || resolvedObj.track?.artists?.[0]?.name || "Remote Artist"),
                                        album_name: this.getString(resolvedObj.album?.name || resolvedObj.name || resolvedObj.title || resolvedObj.track?.album?.name || null),
                                        duration: this.getString(resolvedObj.duration || audioAttachment?.duration || null),
                                        published_at: this.getString(resolvedObj.published || activity.published || new Date().toISOString())
                                    };

                                    if (remoteContent.ap_id) {
                                        this.db.upsertRemoteContent(remoteContent as any);
                                        resolvedItemsCount++;
                                        console.log(`  ✅ Stored remote ${type}: ${remoteContent.title}`);
                                    }
                            }
                        } catch (itemErr) {
                            console.warn("⚠️ Failed to parse collection item:", itemErr);
                        }
                    }

                    // Navigate to next page
                    currentUrl = outbox.next ? (typeof outbox.next === 'string' ? outbox.next : outbox.next.id) : null;
                    pageCount++;
                }
                } catch (outboxErr) {
                    console.warn(`⚠️ Error fetching outbox/collection ${outboxUrl}:`, outboxErr);
                }
            }
            console.log(`✅ Finished population attempt from ${actorUri}`);
        } catch (e) {
            console.error(`❌ Error fetching remote outbox for ${actorUri}:`, e);
        }
    }

    /**
     * Subscribe the instance (Site Actor) to an ActivityPub Relay
     */
    public async subscribeToRelay(relayUrl: string) {
        return this.followRemoteActor(relayUrl, "site");
    }

    /**
     * Announce an activity to the configured relay
     */
    public async announceToRelay(object: any) {
        const relayUrl = this.db.getSetting("relayUrl") || this.config.relayUrl;
        if (!relayUrl) return;

        try {
            const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
            if (!publicUrl) {
                console.warn("⚠️ No public URL configured, cannot announce to relay");
                return;
            }
            const baseUrl = new URL(publicUrl);
            const siteActorId = new URL(`/users/site`, baseUrl);

            const announce = new Announce({
                actor: siteActorId,
                object: object,
            });

            if (relayUrl) {
                await this.sendActivity({ id: -1, slug: "site" } as any, relayUrl, announce);
                console.log(`📡 Announced activity to relay: ${relayUrl}`);
            }
        } catch (e) {
            console.error(`❌ Failed to announce to relay:`, e);
        }
    }

    private async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
        const generateKeyPairAsync = promisify(crypto.generateKeyPair);
        const { publicKey, privateKey } = await (generateKeyPairAsync as any)("rsa", {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: "spki",
                format: "pem"
            },
            privateKeyEncoding: {
                type: "pkcs8",
                format: "pem"
            }
        });
        return { publicKey, privateKey };
    }

    // JSON-LD Generators
    public generateWebFinger(resource: string): any {
        console.log(`🔍 WebFinger request for: ${resource}`);

        let username;
        if (resource.startsWith("acct:")) {
            const parts = resource.replace("acct:", "").split("@");
            username = parts[0];
        } else {
            username = resource;
        }

        console.log(`👤 Extracted username: ${username}`);
        let artist = this.db.getArtistBySlug(username);
        
        if (!artist && username !== "site") {
            console.log(`❌ Artist not found for slug: ${username}`);
            return null;
        }

        const baseUrl = this.getBaseUrl();
        const profileUrl = username === "site" ? `${baseUrl}/` : `${baseUrl}/@${username}`;
        const actorUrl = `${baseUrl}/users/${username}`;

        return {
            subject: resource,
            links: [
                {
                    rel: "self",
                    type: "application/activity+json",
                    href: actorUrl
                },
                {
                    rel: "http://webfinger.net/rel/profile-page",
                    type: "text/html",
                    href: profileUrl
                }
            ]
        };
    }

    public generateActor(artist: Artist | { slug: string, name: string, bio?: string, photo_path?: string }): any {
        const baseUrl = this.getBaseUrl();
        const slug = artist.slug;
        const isSite = slug === "site";
        
        const userUrl = `${baseUrl}/users/${slug}`;
        const apiUrl = `${baseUrl}/api/ap/users/${slug}`;

        let iconMediaType = "image/jpeg";
        let iconUrl = `${baseUrl}/api/artists/${slug}/cover`;
        
        if (isSite) {
            iconMediaType = "image/svg+xml";
            iconUrl = `${baseUrl}/vite.svg`;
        } else if (artist.photo_path) {
            const ext = artist.photo_path.split('.').pop()?.toLowerCase();
            if (ext === 'png') iconMediaType = "image/png";
            else if (ext === 'webp') iconMediaType = "image/webp";
            else if (ext === 'gif') iconMediaType = "image/gif";
        }

        const name = artist.name;
        const summary = (artist as any).bio || artist.bio || (isSite ? "Tunecamp Federation Actor" : `Artist on ${this.getDomain()}`);

        return {
            "@context": [
                "https://www.w3.org/ns/activitystreams",
                "https://w3id.org/security/v1",
                {
                    "manuallyApprovesFollowers": "as:manuallyApprovesFollowers",
                    "Artist": "https://funkwhale.audio/ns#Artist",
                    "MusicArtist": "https://schema.org/MusicArtist",
                    "MusicAlbum": "https://schema.org/MusicAlbum",
                    "MusicRecording": "https://schema.org/MusicRecording",
                    "library": "https://funkwhale.audio/ns#library"
                }
            ],
            id: userUrl,
            type: isSite ? "Service" : ["Person", "Artist", "MusicArtist"],
            preferredUsername: slug,
            name: name,
            summary: summary,
            url: isSite ? `${baseUrl}/` : `${baseUrl}/@${slug}`,
            icon: {
                type: "Image",
                mediaType: iconMediaType,
                url: iconUrl
            },
            image: {
                type: "Image",
                mediaType: iconMediaType,
                url: iconUrl
            },
            inbox: `${userUrl}/inbox`,
            outbox: `${apiUrl}/outbox`,
            followers: `${apiUrl}/followers`,
            following: `${apiUrl}/following`,
            publicKey: {
                id: `${userUrl}#main-key`,
                owner: userUrl,
                publicKeyPem: (artist as any).public_key || (isSite ? this.db.getSetting("site_public_key") : undefined)
            },
            endpoints: {
                sharedInbox: `${baseUrl}/inbox`
            }
        };
    }

    public generateNote(album: Album, artist: Artist, tracks: Track[]): any {
        const baseUrl = this.getBaseUrl();
        const userUrl = `${baseUrl}/users/${artist.slug}`;
        const apiUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
        const isRelease = true; // generateNote exclusively used for releases
        const albumUrl = `${baseUrl}/releases/${album.slug}`;

        const published = album.published_at || album.created_at;

        const attachments: any[] = [];

        if (album.cover_path) {
            const ext = album.cover_path.split('.').pop()?.toLowerCase();
            let mediaType = "image/jpeg";
            if (ext === 'png') mediaType = "image/png";
            else if (ext === 'webp') mediaType = "image/webp";
            else if (ext === 'gif') mediaType = "image/gif";

            attachments.push({
                type: "Image",
                mediaType: mediaType,
                url: `${baseUrl}/api/releases/${album.slug}/cover`,

                name: "Cover Art"
            });
        }

        const trackObjects = tracks.map(track => {
            if (!track.file_path && !track.url) return null;
            
            let mediaType = "audio/mpeg";
            if (track.file_path) {
                const ext = track.file_path.split('.').pop()?.toLowerCase();
                const contentTypes: Record<string, string> = {
                    "mp3": "audio/mpeg",
                    "flac": "audio/flac",
                    "ogg": "audio/ogg",
                    "wav": "audio/wav",
                    "m4a": "audio/mp4",
                    "aac": "audio/aac",
                    "opus": "audio/opus",
                };
                mediaType = contentTypes[ext || ""] || "audio/mpeg";
            }

            return {
                type: "Audio",
                mediaType: mediaType,
                url: track.file_path ? `${baseUrl}/api/tracks/${track.id}/stream` : track.url,
                name: track.title,
                duration: track.duration ? new Date(track.duration * 1000).toISOString().substr(11, 8) : undefined,
                "https://funkwhale.audio/ns#bitrate": track.bitrate,
                "https://funkwhale.audio/ns#duration": track.duration
            };
        }).filter(t => t !== null);

        if (trackObjects.length > 0) {
            attachments.push(trackObjects[0]);
        }

        const sentTime = published ? new Date(published).getTime() : 0;
        const noteId = `${baseUrl}/api/ap/note/release/${album.slug}/${sentTime}`;

        return {
            "@context": [
                "https://www.w3.org/ns/activitystreams",
                {
                    "MusicAlbum": "https://schema.org/MusicAlbum",
                    "MusicRecording": "https://schema.org/MusicRecording"
                }
            ],
            type: "Note",
            id: noteId,
            attributedTo: userUrl,
            content: `<p>New release available: <a href="${albumUrl}">${album.title}</a></p>`,
            url: albumUrl,
            published: published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${apiUrl}/followers`],
            attachment: attachments,
            tag: []
        };
    }

    public generatePostNote(post: Post, artist: Artist): any {
        const baseUrl = this.getBaseUrl();
        const userUrl = `${baseUrl}/users/${artist.slug}`;
        const apiUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
        const postUrl = `${baseUrl}/artists/${artist.slug}?post=${post.slug}`;

        const published = post.published_at || post.created_at;
        const sentTime = published ? new Date(published).getTime() : 0;

        return {
            type: "Note",
            id: `${baseUrl}/api/ap/note/post/${post.slug}/${sentTime}`,
            attributedTo: userUrl,
            content: `<p>${post.content}</p>`,
            url: postUrl,
            published: published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${apiUrl}/followers`],
            tag: []
        };
    }

    public async acceptFollow(artist: Artist, activity: any): Promise<void> {
        const actorUri = activity.actor;
        const inboxUri = await this.getInboxFromActor(actorUri);

        if (!inboxUri) {
            console.error(`❌ Could not find inbox for actor: ${actorUri}`);
            return;
        }

        this.db.addFollower(artist.id, actorUri, inboxUri);
        console.log(`➕ Added follower ${actorUri} for ${artist.name}`);

        const acceptActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${this.getBaseUrl()}/${crypto.randomUUID()}`,
            type: "Accept",
            actor: `${this.getBaseUrl()}/users/${artist.slug}`,
            object: activity
        };

        await this.sendActivity(artist, inboxUri, acceptActivity);
    }

    public async broadcastRelease(album: Album, force: boolean = false): Promise<void> {
        if (!album.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist) return;

        if (!force) {
            const existingNotes = this.db.getApNotes(artist.id, false);
            const alreadyPublished = existingNotes.find(n => n.note_type === 'release' && n.content_id === album.id);
            if (alreadyPublished) {
                console.log(`ℹ️ Release "${album.title}" already published via ActivityPub. Skipping broadcast.`);
                return;
            }
        }

        console.log(`📢 Broadcasting release "${album.title}" to followers`);

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;

        const tracks = this.db.getTracksByReleaseId(album.id);
        const note = this.generateNote(album, artist, tracks);

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Create",
            actor: artistActorUrl,
            object: note,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${artistActorUrl}/followers`]
        };

        const followers = this.db.getFollowers(artist.id);
        const inboxes = followers.map(f => f.inbox_uri);

        if (inboxes.length > 0) {
            console.log(`📢 Sending release activity to ${inboxes.length} inboxes`);
            await Promise.all(inboxes.map(inbox => this.sendActivity(artist, inbox, activity)));
        } else {
            console.log(`ℹ️ No followers for ${artist.name}, skipping direct broadcast.`);
        }

        // Always announce to relay if configured, even without followers
        await this.announceToRelay(activity);

        this.db.createApNote(artist.id, note.id, 'release', album.id, album.slug, album.title);
    }

    public async broadcastPost(post: Post, force: boolean = false): Promise<void> {
        if (post.visibility !== 'public') return;

        const artist = this.db.getArtist(post.artist_id);
        if (!artist) return;

        if (!force) {
            const existingNotes = this.db.getApNotes(artist.id, false);
            const alreadyPublished = existingNotes.find(n => n.note_type === 'post' && n.content_id === post.id);
            if (alreadyPublished) {
                console.log(`ℹ️ Post "${post.slug}" already published via ActivityPub. Skipping broadcast.`);
                return;
            }
        }

        const note = this.generatePostNote(post, artist);
        this.db.createApNote(artist.id, note.id, 'post', post.id, post.slug, post.content.replace(/<[^>]*>?/gm, '').substring(0, 50) + (post.content.length > 50 ? '...' : ''));

        const followers = this.db.getFollowers(artist.id);
        if (followers.length === 0) return;

        console.log(`📢 Broadcasting post "${post.slug}" to ${followers.length} followers`);

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Create",
            actor: artistActorUrl,
            object: note,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${artistActorUrl}/followers`]
        };

        await Promise.all(followers.map(follower => this.sendActivity(artist, follower.inbox_uri, activity)));
    }

    public async broadcastDelete(album: Album, manualNoteId?: string): Promise<void> {
        if (!album.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist) return;

        const baseUrl = this.getBaseUrl();
        let noteId = manualNoteId;
        let isAlreadyDeleted = false;

        if (!noteId) {
            const notes = this.db.getApNotes(artist.id, true);
            const note = notes.find(n => n.note_type === 'release' && n.content_id === album.id);
            if (note) {
                noteId = note.note_id;
                isAlreadyDeleted = !!note.deleted_at;
            }
        } else {
            const note = this.db.getApNote(noteId);
            if (note) isAlreadyDeleted = !!note.deleted_at;
        }

        if (!noteId || isAlreadyDeleted) {
            return;
        }

        const followers = this.db.getFollowers(artist.id);
        if (followers.length > 0) {
            console.log(`📢 Broadcasting delete for release "${album.title}" to ${followers.length} followers`);
            const activity = {
                "@context": "https://www.w3.org/ns/activitystreams",
                id: `${this.getBaseUrl()}/activity/${crypto.randomUUID()}`,
                type: "Delete",
                actor: `${baseUrl}/users/${artist.slug}`,
                object: { id: noteId, type: "Note", atomUri: noteId },
                to: ["https://www.w3.org/ns/activitystreams#Public"]
            };
            await Promise.all(followers.map(follower => this.sendActivity(artist, follower.inbox_uri, activity)));
        }

        this.db.markApNoteDeleted(noteId);
    }

    public async broadcastPostDelete(post: Post, manualNoteId?: string): Promise<void> {
        const artist = this.db.getArtist(post.artist_id);
        if (!artist) return;

        const baseUrl = this.getBaseUrl();
        let noteId = manualNoteId;
        let isAlreadyDeleted = false;

        if (!noteId) {
            const notes = this.db.getApNotes(artist.id, true);
            const note = notes.find(n => n.note_type === 'post' && n.content_id === post.id);
            if (note) {
                noteId = note.note_id;
                isAlreadyDeleted = !!note.deleted_at;
            }
        } else {
            const note = this.db.getApNote(noteId);
            if (note) isAlreadyDeleted = !!note.deleted_at;
        }

        if (!noteId || isAlreadyDeleted) {
            return;
        }

        const followers = this.db.getFollowers(artist.id);
        if (followers.length > 0) {
            console.log(`📢 Broadcasting delete for post "${post.slug}" to ${followers.length} followers`);
            const activity = {
                "@context": "https://www.w3.org/ns/activitystreams",
                id: `${baseUrl}/activity/${crypto.randomUUID()}`,
                type: "Delete",
                actor: `${baseUrl}/users/${artist.slug}`,
                object: { id: noteId, type: "Note", atomUri: noteId },
                to: ["https://www.w3.org/ns/activitystreams#Public"]
            };
            await Promise.all(followers.map(follower => this.sendActivity(artist, follower.inbox_uri, activity)));
        }
        this.db.markApNoteDeleted(noteId);
    }

    public async syncAllContent(): Promise<{ artists: number; notes: number }> {
        const artists = this.db.getArtists();
        let artistCount = artists.length;
        let noteCount = 0;

        // Fetch all releases upfront to avoid N+1 queries during the loop
        const releases = this.db.getReleases();

        // Group releases by artist ID
        const releasesByArtist: Record<number, any[]> = {};
        for (const release of releases) {
            if (release.artist_id !== null) {
                if (!releasesByArtist[release.artist_id]) releasesByArtist[release.artist_id] = [];
                releasesByArtist[release.artist_id].push(release);
            }
        }

        for (const artist of artists) {
            const artistReleases = releasesByArtist[artist.id] || [];
            const releasePromises = artistReleases.map(async (release) => {
                noteCount++;
                if (release.visibility === 'public' || release.visibility === 'unlisted') {
                    console.log(`  - Syncing public release: ${release.title}`);
                    await this.broadcastRelease(release as any, true).catch(e => console.error(e));
                } else {
                    console.log(`  - Syncing private release (Delete): ${release.title}`);
                    await this.broadcastDelete(release as any).catch(e => console.error(e));
                }
            });
            await Promise.all(releasePromises);

            const posts = this.db.getPostsByArtist(artist.id);
            const postPromises = posts.map(async (post) => {
                noteCount++;
                if (post.visibility === 'public') {
                    await this.broadcastPost(post, true).catch(e => console.error(e));
                } else {
                    await this.broadcastPostDelete(post).catch(e => console.error(e));
                }
            });
            await Promise.all(postPromises);
        }
        return { artists: artistCount, notes: noteCount };
    }

    public async syncArtistContent(artistId: number): Promise<{ notes: number }> {
        const artist = this.db.getArtist(artistId);
        if (!artist) throw new Error("Artist not found");

        let noteCount = 0;
        console.log(`🔄 Syncing ActivityPub content for artist: ${artist.name} (ID: ${artistId})`);

        // Sync Releases
        const releases = this.db.getReleasesByArtist(artistId);
        if (releases.length > 0) {
            console.log(`  📦 Syncing ${releases.length} releases...`);
            const releasePromises = releases.map(async (release) => {
                noteCount++;
                if (release.visibility === 'public' || release.visibility === 'unlisted') {
                    await this.broadcastRelease(release as any, true).catch(e => console.error(`❌ Sync release "${release.title}" failed:`, e));
                } else {
                    await this.broadcastDelete(release as any).catch(e => console.error(`❌ Sync delete release "${release.title}" failed:`, e));
                }
            });
            await Promise.all(releasePromises);
        }

        // Sync Posts
        const posts = this.db.getPostsByArtist(artistId);
        if (posts.length > 0) {
            console.log(`  📝 Syncing ${posts.length} posts...`);
            const postPromises = posts.map(async (post) => {
                noteCount++;
                if (post.visibility === 'public') {
                    await this.broadcastPost(post, true).catch(e => console.error(`❌ Sync post failed:`, e));
                } else {
                    await this.broadcastPostDelete(post).catch(e => console.error(`❌ Sync delete post failed:`, e));
                }
            });
            await Promise.all(postPromises);
        }

        return { notes: noteCount };
    }

    public async sendActivity(actor: Artist | { slug: string, private_key?: string, public_key?: string }, inboxUri: string, activity: any): Promise<void> {
        try {
            const handle = actor.slug;
            const recipient = new URL(inboxUri);

            console.log(`📤 Sending activity ${activity.type || 'unknown'} from ${handle} to ${inboxUri} via Fedify`);
            
            await this.federation.sendActivity(
                { identifier: handle },
                [recipient],
                activity
            );
            
            console.log(`✅ Activity queued/sent to ${inboxUri} via Fedify`);
        } catch (e) {
            console.error(`❌ Fedify failed to send activity to ${inboxUri}, falling back to manual:`, e);
            await this.manualSendActivity(actor, inboxUri, activity);
        }
    }

    private async manualSendActivity(actor: Artist | { slug: string, private_key?: string, public_key?: string }, inboxUri: string, activity: any): Promise<void> {
        let activityJson: any;
        if (activity && typeof activity.toJsonLd === 'function') {
            activityJson = await activity.toJsonLd();
        } else {
            activityJson = { ...activity };
        }
        if (!activityJson["@context"]) activityJson["@context"] = "https://www.w3.org/ns/activitystreams";
        if (!activityJson.id) activityJson.id = `${this.getBaseUrl()}/activity/${crypto.randomUUID()}`;

        try {
            const res = await this.fetchWithSignature(inboxUri, "post", activityJson, actor as Artist);
            if (!res.ok) {
                const errText = await res.text().catch(() => "Unknown error");
                console.error(`❌ Manual fallback failed to send activity to ${inboxUri}: ${res.status} ${errText}`);
            } else {
                await drainResponse(res);
                console.log(`✅ Manually sent activity to ${inboxUri}`);
            }
        } catch (e) {
            console.error(`❌ Error in manual fallback sending activity to ${inboxUri}:`, e);
        }
    }

    private async fetchWithSignature(uri: string, method: "get" | "post" = "get", body: any = null, signingArtist?: Artist): Promise<any> {
        const url = new URL(uri);
        const date = new Date().toUTCString();
        let bodyStr = "";
        let digest = "";
        if (body) {
            bodyStr = JSON.stringify(body);
            digest = `SHA-256=${crypto.createHash("sha256").update(bodyStr).digest("base64")}`;
        }
        const headers: any = { "Host": url.host, "Date": date, "Accept": "application/activity+json" };
        if (digest) {
            headers["Digest"] = digest;
            headers["Content-Type"] = "application/activity+json";
        }
        let actor = signingArtist;
        // If no actor provided OR it's the site actor lacking keys, try to load site keys
        if (!actor || (actor.slug === "site" && !actor.private_key)) {
            const sitePriv = this.db.getSetting("site_private_key");
            const sitePub = this.db.getSetting("site_public_key");
            
            if (!actor) {
                actor = {
                    slug: "site",
                    private_key: sitePriv,
                    public_key: sitePub
                } as any;
            } else {
                // Fill missing keys for site actor
                (actor as any).private_key = sitePriv;
                (actor as any).public_key = sitePub;
            }
        }
        if (actor?.private_key) {
            try {
                const signature = this.signRequest(actor, url, method, date, digest || undefined);
                headers["Signature"] = signature;
            } catch (sigErr) {
                console.warn(`⚠️ Could not sign request to ${uri} (Actor: ${actor.slug}):`, sigErr);
            }
        }
        return fetch(uri, { method: method.toUpperCase(), headers, body: body ? bodyStr : undefined });
    }

    private signRequest(artist: Artist, url: URL, method: string, date: string, digest?: string): string {
        if (!artist.private_key) throw new Error(`Actor ${artist.slug} has no private key`);
        let headersList = "(request-target) host date";
        const targetPath = url.pathname + (url.search || "");
        let stringToSign = `(request-target): ${method.toLowerCase()} ${targetPath}\nhost: ${url.host}\ndate: ${date}`;
        if (digest) {
            headersList += " digest";
            stringToSign += `\ndigest: ${digest}`;
        }
        const signer = crypto.createSign("sha256");
        signer.update(stringToSign);
        const signature = signer.sign(artist.private_key, "base64");
        const keyId = `${this.getBaseUrl()}/users/${artist.slug}#main-key`;
        return `keyId="${keyId}",algorithm="rsa-sha256",headers="${headersList}",signature="${signature}"`;
    }

    private async discoverSiteActor(origin: string): Promise<string | null> {
        try {
            const domain = new URL(origin).hostname;
            const wellKnownAliases = ["site", "instance", domain];
            for (const alias of wellKnownAliases) {
                const actorId = await this.getActorIdFromWebFinger(domain, alias);
                if (actorId) return actorId;
            }
            return await this.getActorIdFromNodeInfo(origin);
        } catch { return null; }
    }

    private async getActorIdFromWebFinger(domain: string, username: string): Promise<string | null> {
        try {
            const resource = `acct:${username}@${domain}`;
            const wfUrl = `https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`;
            const res = await fetch(wfUrl, { headers: { "Accept": "application/jrd+json, application/json" } });
            if (!res.ok) {
                await drainResponse(res);
                return null;
            }
            const jrd = await res.json() as any;
            const selfLink = jrd.links?.find((l: any) => l.rel === "self" && (l.type === "application/activity+json" || l.type?.includes("json")));
            return selfLink?.href || null;
        } catch { return null; }
    }

    private async getActorIdFromNodeInfo(origin: string): Promise<string | null> {
        try {
            const wellKnownRes = await fetch(`${origin}/.well-known/nodeinfo`);
            if (!wellKnownRes.ok) {
                await drainResponse(wellKnownRes);
                return null;
            }
            const wellKnown = await wellKnownRes.json() as any;
            const nodeInfoLink = wellKnown.links?.find((l: any) => l.rel?.includes("nodeinfo"));
            if (!nodeInfoLink?.href) return null;
            const niRes = await fetch(nodeInfoLink.href);
            if (!niRes.ok) {
                await drainResponse(niRes);
                return null;
            }
            const ni = await niRes.json() as any;
            return ni.metadata?.actorId || null;
        } catch { return null; }
    }

    private async getInboxFromActor(actorUri: string): Promise<string | null> {
        if (!this.isSafeUrl(actorUri)) return null;
        try {
            const res = await this.fetchWithSignature(actorUri);
            if (!res.ok) {
                await drainResponse(res);
                return null;
            }
            const actor = await res.json() as any;
            return actor.inbox || null;
        } catch { return null; }
    }

    private isSafeUrl(urlStr: string): boolean {
        try {
            const url = new URL(urlStr);
            const hostname = url.hostname.toLowerCase();
            const blockedPatterns = [/^localhost$/, /^127\./, /^0\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^::1$/, /^fe80:/];
            return !blockedPatterns.some(pattern => pattern.test(hostname));
        } catch { return false; }
    }

    private getString(value: any): string | null {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
            if (value.length === 0) return null;
            return this.getString(value[0]);
        }
        if (typeof value === 'object') {
            // Handle Link/Object with href
            if (value.href) return String(value.href);
            if (value.url) return this.getString(value.url);
            // Handle Language Map (common in ActivityPub)
            if (value.name) return this.getString(value.name);
            if (value.content) return this.getString(value.content);
            const keys = Object.keys(value);
            if (keys.length > 0) {
                // Return first language entry if it looks like a language map
                return String(value[keys[0]]);
            }
        }
        return String(value);
    }

    public async verifySignature(req: any): Promise<boolean> {
        const signatureHeader = req.headers["signature"];
        if (!signatureHeader) {
            console.warn("⚠️ ActivityPub Request missing Signature header");
            return false;
        }

        try {
            // Correctly parse signature header parts (handles keyId="...", etc.)
            const parts: any = {};
            const regex = /([a-zA-Z]+)="([^"]+)"/g;
            let match;
            while ((match = regex.exec(signatureHeader)) !== null) {
                parts[match[1]] = match[2];
            }

            if (!parts.keyId || !parts.signature) {
                console.warn("⚠️ ActivityPub Signature missing keyId or signature data");
                return false;
            }

            // 1. Get Public Key (with caching)
            const publicKey = await this.getRemotePublicKey(parts.keyId);
            if (!publicKey) {
                console.warn(`⚠️ Could not retrieve public key for ${parts.keyId}`);
                return false;
            }

            // 2. Reconstruct String to Sign
            const headersList = parts.headers ? parts.headers.split(' ') : ['date'];
            const signingLines: string[] = [];
            
            for (const headerName of headersList) {
                if (headerName === '(request-target)') {
                    // Use req.originalUrl for Express to get the full path
                    signingLines.push(`(request-target): ${req.method.toLowerCase()} ${req.originalUrl || req.url}`);
                } else {
                    const val = req.headers[headerName.toLowerCase()];
                    if (!val) {
                        console.warn(`⚠️ Header ${headerName} missing from request but required by signature`);
                        return false;
                    }
                    if (headerName.toLowerCase() === 'host') {
                        // Some servers might include the port in the host header
                        signingLines.push(`host: ${val}`);
                    } else {
                        signingLines.push(`${headerName.toLowerCase()}: ${val}`);
                    }
                }
            }
            const signingString = signingLines.join('\n');

            // 3. Verify
            // Identify hashing algorithm (usually rsa-sha256 or sha256)
            let algorithm = "sha256";
            if (parts.algorithm?.toLowerCase().includes("sha512")) algorithm = "sha512";
            
            const verifier = crypto.createVerify(algorithm);
            verifier.update(signingString);
            const isValid = verifier.verify(publicKey, parts.signature, 'base64');
            
            if (isValid) {
                console.log(`✅ ActivityPub Signature verified for ${parts.keyId}`);
            } else {
                console.warn(`❌ ActivityPub Signature verification FAILED for ${parts.keyId}`);
                // Debug signing string
                // console.log("DEBUG: Signing String used:\n" + signingString);
            }
            
            return isValid;
        } catch (err) {
            console.error("❌ Error during ActivityPub signature verification:", err);
            return false;
        }
    }

    private async getRemotePublicKey(keyId: string): Promise<string | null> {
        // keyId is usually http://actor-uri#main-key or just the actor-uri
        const actorUri = keyId.split('#')[0];
        
        // Check DB Cache
        const cachedActor = this.db.getRemoteActor(actorUri);
        if (cachedActor?.public_key) {
            return cachedActor.public_key;
        }

        // Fetch Actor JSON
        try {
            console.log(`📡 Fetching remote actor to retrieve public key: ${actorUri}`);
            const res = await this.fetchWithSignature(actorUri);
            
            if (!res.ok) {
                console.warn(`⚠️ Failed to fetch remote actor ${actorUri}: ${res.status}`);
                await drainResponse(res);
                return null;
            }
            
            const actor = await res.json();
            const publicKeyPem = actor.publicKey?.publicKeyPem;
            
            if (publicKeyPem) {
                // Cache it so we don't fetch every time
                console.log(`💾 Caching public key for ${actorUri}`);
                this.db.upsertRemoteActor({
                    uri: actorUri,
                    type: actor.type || 'Person',
                    username: actor.preferredUsername || null,
                    name: actor.name || null,
                    summary: actor.summary || null,
                    icon_url: actor.icon?.url || (typeof actor.icon === 'string' ? actor.icon : null),
                    inbox_url: actor.inbox || null,
                    outbox_url: actor.outbox || null,
                    public_key: publicKeyPem
                });
                return publicKeyPem;
            } else {
                console.warn(`⚠️ Actor JSON for ${actorUri} does not contain a public key`);
            }
        } catch (e) {
            console.error(`❌ Error fetching remote public key for ${actorUri}:`, e);
        }
        return null;
    }
}

export function createActivityPubService(db: DatabaseService, config: ServerConfig, federation: Federation<void>): ActivityPubService {
    return new ActivityPubService(db, config, federation);
}
