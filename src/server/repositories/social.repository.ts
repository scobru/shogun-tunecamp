import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Follower } from "../database.types.js";

export class SocialRepository extends BaseRepository {
    constructor(db: DatabaseType) {
        super(db);
    }

    // --- Followers ---

    addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string): void {
        this.db.prepare(
            "INSERT OR IGNORE INTO followers (artist_id, actor_uri, inbox_uri, shared_inbox_uri) VALUES (?, ?, ?, ?)"
        ).run(artistId, actorUri, inboxUri, sharedInboxUri || null);
    }

    removeFollower(artistId: number, actorUri: string): void {
        this.db.prepare("DELETE FROM followers WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
    }

    getFollowers(artistId: number): Follower[] {
        return this.db.prepare("SELECT * FROM followers WHERE artist_id = ?").all(artistId) as Follower[];
    }

    getFollower(artistId: number, actorUri: string): Follower | undefined {
        return this.db.prepare("SELECT * FROM followers WHERE artist_id = ? AND actor_uri = ?").get(artistId, actorUri) as Follower | undefined;
    }

    // --- Likes ---

    addLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void {
        this.db.prepare(`
            INSERT OR IGNORE INTO likes (remote_actor_fid, object_type, object_id)
            VALUES (?, ?, ?)
        `).run(actorUri, objectType, objectId);
    }

    removeLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void {
        this.db.prepare(`
            DELETE FROM likes WHERE remote_actor_fid = ? AND object_type = ? AND object_id = ?
        `).run(actorUri, objectType, objectId);
    }

    getLikesCount(objectType: 'album' | 'track' | 'post', objectId: number): number {
        const row = this.db.prepare(`
            SELECT COUNT(*) as count FROM likes WHERE object_type = ? AND object_id = ?
        `).get(objectType, objectId) as { count: number };
        return row ? row.count : 0;
    }

    hasLiked(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): boolean {
        const row = this.db.prepare(`
            SELECT 1 FROM likes WHERE remote_actor_fid = ? AND object_type = ? AND object_id = ?
        `).get(actorUri, objectType, objectId);
        return !!row;
    }

    // --- Local User Social (Stars/Ratings) ---

    starItem(username: string, type: 'album' | 'track' | 'artist', targetId: string): void {
        this.db.prepare("INSERT OR IGNORE INTO stars (username, type, target_id) VALUES (?, ?, ?)").run(username, type, targetId);
    }

    unstarItem(username: string, type: 'album' | 'track' | 'artist', targetId: string): void {
        this.db.prepare("DELETE FROM stars WHERE username = ? AND type = ? AND target_id = ?").run(username, type, targetId);
    }

    isStarred(username: string, type: 'album' | 'track' | 'artist', targetId: string): boolean {
        const row = this.db.prepare("SELECT 1 FROM stars WHERE username = ? AND type = ? AND target_id = ?").get(username, type, targetId);
        return !!row;
    }

    setItemRating(username: string, type: 'album' | 'track' | 'artist', targetId: string, rating: number): void {
        this.db.prepare("INSERT OR REPLACE INTO ratings (username, type, target_id, rating) VALUES (?, ?, ?, ?)")
            .run(username, type, targetId, rating);
    }

    getItemRating(username: string, type: 'album' | 'track' | 'artist', targetId: string): number {
        const row = this.db.prepare("SELECT rating FROM ratings WHERE username = ? AND type = ? AND target_id = ?").get(username, type, targetId) as { rating: number };
        return row ? row.rating : 0;
    }
}
