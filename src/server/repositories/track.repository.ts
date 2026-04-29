import type { Database as DatabaseType, Statement } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Track } from "../database.types.js";

export class TrackRepository extends BaseRepository {
    private getTrackStmt: Statement;

    constructor(db: DatabaseType) {
        super(db);
        
        this.getTrackStmt = this.db.prepare(`
            SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            ar_t.id as artist_id,
            COALESCE(ar_t.name, t.artist_name, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id,
            own.username as owner_name
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
           WHERE t.id = ?
        `);
    }

    private mapTrack(row: any): Track {
        return {
            ...row,
            album_is_release: !!row.album_is_release,
        } as Track;
    }

    getById(id: number): Track | undefined {
        const row = this.getTrackStmt.get(id);
        return row ? this.mapTrack(row) : undefined;
    }

    getByIds(ids: number[]): Track[] {
        if (ids.length === 0) return [];
        const CHUNK_SIZE = 900;
        const results: Track[] = [];

        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => "?").join(",");
            const rows = this.db.prepare(`
                SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price,
                COALESCE(ar_t.id, ar_a.id) as artist_id,
                COALESCE(ar_t.name, ar_a.name, t.artist_name) as artist_name,
                COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
                COALESCE(t.owner_id, a.owner_id) as owner_id,
                own.username as owner_name
               FROM tracks t
               LEFT JOIN albums a ON t.album_id = a.id
               LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
               LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
               LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
               WHERE t.id IN (${placeholders})
            `).all(...chunk);
            results.push(...rows.map(row => this.mapTrack(row)));
        }
        return results;
    }

    getByAlbumId(albumId: number): Track[] {
        const rows = this.db.prepare(`
            SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price,
            COALESCE(ar_t.id, ar_a.id) as artist_id,
            COALESCE(ar_t.name, ar_a.name, t.artist_name) as artist_name,
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id,
            own.username as owner_name
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
           WHERE t.album_id = ?
           ORDER BY t.track_num ASC, t.title ASC
        `).all(albumId);
        return rows.map(row => this.mapTrack(row));
    }

    getByArtist(artistId: number, publicOnly = false, artistName?: string): Track[] {
        const sql = publicOnly 
            ? `SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
                COALESCE(ar_t.id, ar_a.id) as artist_id,
                COALESCE(ar_t.name, ar_a.name, t.artist_name) as artist_name, 
                COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
                COALESCE(t.owner_id, a.owner_id) as owner_id,
                own.username as owner_name
                FROM tracks t
                LEFT JOIN albums a ON t.album_id = a.id
                LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
                LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
                LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
                WHERE (t.artist_id = ? OR (t.artist_id IS NULL AND a.artist_id = ?) OR (t.artist_id IS NULL AND a.artist_id IS NULL AND t.artist_name LIKE ?)) 
                AND (
                    (a.is_release = 1 AND a.visibility IN ('public', 'unlisted'))
                    OR EXISTS (SELECT 1 FROM release_tracks rt JOIN releases r ON rt.release_id = r.id WHERE rt.track_id = t.id AND r.visibility IN ('public', 'unlisted'))
                )
                ORDER BY a.title, t.track_num`
            : `SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
                COALESCE(ar_t.id, ar_a.id) as artist_id,
                COALESCE(ar_t.name, ar_a.name, t.artist_name) as artist_name, 
                COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
                COALESCE(t.owner_id, a.owner_id) as owner_id,
                own.username as owner_name
                FROM tracks t
                LEFT JOIN albums a ON t.album_id = a.id
                LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
                LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
                LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
                WHERE t.artist_id = ? 
                   OR (t.artist_id IS NULL AND a.artist_id = ?)
                   OR (t.artist_id IS NULL AND a.artist_id IS NULL AND t.artist_name LIKE ?)
                ORDER BY a.title, t.track_num`;
        
        const rows = this.db.prepare(sql).all(artistId, artistId, artistName || null);
        return rows.map(row => this.mapTrack(row));
    }

    getByReleaseId(releaseId: number): Track[] {
        const rows = this.db.prepare(`
            SELECT rt.*, t.file_path as original_file_path, t.waveform, t.lyrics,
                   r.title as album_title, r.cover_path as album_cover_path,
                   ar.name as artist_name, ar.wallet_address as walletAddress
            FROM release_tracks rt
            JOIN releases r ON rt.release_id = r.id
            LEFT JOIN tracks t ON rt.track_id = t.id
            LEFT JOIN artists ar ON r.artist_id = ar.id
            WHERE rt.release_id = ?
            ORDER BY rt.track_num ASC
        `).all(releaseId);
        return rows.map(row => this.mapTrack(row));
    }
}
