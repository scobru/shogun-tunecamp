import type { DatabaseService, Album, Release, Track } from "../database.js";
import type { PublishingService } from "../publishing.js";
import type { ZenDBService } from "../zendb.js";
import type { StorageEngine } from "../modules/storage/storage.engine.js";
import path from "path";
import NodeID3 from "node-id3";
import { writeMetadata } from "../ffmpeg.js";

export class LibraryService {
    constructor(
        private db: DatabaseService,
        private publishing: PublishingService,
        private zendb: ZenDBService,
        private storage: StorageEngine,
        private musicDir: string
    ) {}

    // --- Album Operations ---

    /**
     * Promotes a library album to a formal release.
     * This moves metadata to the releases compartment and potentially triggers federation.
     */
    async promoteToRelease(albumId: number): Promise<void> {
        const album = this.db.getAlbum(albumId);
        if (!album) {
            throw new Error("Album not found");
        }

        if (album.is_release) {
            return; // Already a release
        }

        console.log(`🚀 Promoting library album "${album.title}" to release...`);
        
        // 1. Database promotion (handles transfers to releases/release_tracks tables)
        this.db.promoteToRelease(albumId);

        // 2. Refresh release info after promotion
        const release = this.db.getRelease(albumId);
        if (release && (release.visibility === 'public' || release.visibility === 'unlisted')) {
            // 3. Trigger federation if it's immediately public
            await this.publishing.syncRelease(albumId);
        }
    }

    /**
     * Sets album visibility and handles the necessary federation sync.
     */
    async setVisibility(albumId: number, visibility: 'public' | 'private' | 'unlisted'): Promise<void> {
        const album = this.db.getAlbum(albumId) || this.db.getRelease(albumId);
        if (!album) {
            throw new Error("Album not found");
        }

        if (album.visibility === visibility) return;

        console.log(`👁️ Setting visibility of "${album.title}" to ${visibility}...`);
        
        // 1. Update DB
        this.db.updateAlbumVisibility(albumId, visibility);

        // 2. Sync if it's a release (library albums aren't federated in the same way)
        const isRelease = 'is_release' in album ? album.is_release : true;
        if (isRelease) {
            await this.publishing.syncRelease(albumId);
        }
    }

    /**
     * Deletes an album or release from the system.
     */
    async deleteAlbum(albumId: number, keepTracks: boolean = false): Promise<void> {
        const album = this.db.getAlbum(albumId) || this.db.getRelease(albumId);
        if (!album) return;

        console.log(`🗑️ Deleting album/release "${album.title}"...`);

        // 1. If it was federated via AP, we need to broadcast a delete
        const isRelease = 'is_release' in album ? album.is_release : true;
        if (isRelease && (album as Release).published_to_ap) {
            await this.publishing.unpublishReleaseFromAP(album as Release);
        }

        // 2. Remove from ZenDB cache
        if ((album as any).published_to_gundb) {
            await this.zendb.unpublishRelease(album.id);
        }

        // 3. Database deletion
        this.db.deleteAlbum(albumId, keepTracks);
    }

    // --- Track Operations ---

    /**
     * Stars a track (like) and syncs with decentralized mesh if public.
     */
    async starTrack(username: string, trackId: number): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        // 1. Local DB update
        this.db.starItem(username, 'track', String(trackId));

        // 2. Mesh sync for public tracks
        if (track.album_id) {
            const album = this.db.getAlbum(track.album_id) || this.db.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.incrementTrackLikeCount(album.slug, String(trackId));
            }
        }
    }

    /**
     * Unstars a track (unlike) and syncs with decentralized mesh if public.
     */
    async unstarTrack(username: string, trackId: number): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track) return;

        // 1. Local DB update
        this.db.unstarItem(username, 'track', String(trackId));

        // 2. Mesh sync for public tracks
        if (track.album_id) {
            const album = this.db.getAlbum(track.album_id) || this.db.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.decrementTrackLikeCount(album.slug, String(trackId));
            }
        }
    }

    /**
     * Sets track rating and syncs with decentralized mesh if public.
     */
    async setTrackRating(username: string, trackId: number, rating: number): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        // 1. Local DB update
        this.db.setItemRating(username, 'track', String(trackId), rating);

        // 2. Mesh sync for public tracks
        if (track.album_id) {
            const album = this.db.getAlbum(track.album_id) || this.db.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.setTrackRating(album.slug, String(trackId), rating);
            }
        }
    }

    /**
     * Deletes a track from the database and optionally removes the physical file.
     */
    async deleteTrack(trackId: number, deleteFile: boolean = false): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track) return;

        // 1. Physical file deletion
        if (deleteFile && track.file_path) {
            const fullPath = path.join(this.musicDir, track.file_path);
            try {
                if (await this.storage.pathExists(fullPath)) {
                    await this.storage.remove(fullPath);
                    
                    // Also check for associated raw file (e.g. .wav if this is .mp3)
                    const ext = path.extname(fullPath).toLowerCase();
                    if (ext === '.mp3') {
                        const wavPath = fullPath.replace(/\.mp3$/i, '.wav');
                        if (await this.storage.pathExists(wavPath)) {
                            await this.storage.remove(wavPath);
                        }
                    }
                }
            } catch (err: any) {
                console.error(`[LibraryService] Failed to delete file for track ${trackId}:`, err.message);
            }
        }

        // 2. Database deletion
        this.db.deleteTrack(trackId);

        // 3. Federation sync (Notify that track is gone from album)
        if (track.album_id) {
            await this.publishing.syncRelease(track.album_id).catch(e => 
                console.error(`[LibraryService] Failed to sync release after track delete:`, e)
            );
        }
    }

    /**
     * Updates track metadata in DB and writes ID3 tags to disk if applicable.
     */
    async updateTrack(trackId: number, data: any): Promise<Track | undefined> {
        const track = this.db.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        const { title, artistId, artist, albumId, album, ownerId, trackNumber, genre, year, price, priceUsdc, currency, lyrics, externalArtwork, fileName, duration } = data;

        let finalArtistId = artistId !== undefined ? artistId : undefined;
        if (finalArtistId === null && typeof artist === 'string' && artist.trim() !== "") {
            const artistName = artist.trim();
            const existingArtist = this.db.getArtistByName(artistName);
            finalArtistId = existingArtist ? existingArtist.id : this.db.createArtist(artistName);
        }

        let finalAlbumId = albumId !== undefined ? albumId : undefined;
        if (finalAlbumId === null && typeof album === 'string' && album.trim() !== "") {
            const albumName = album.trim();
            const slug = "lib-" + albumName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const existingAlbum = this.db.getAlbumBySlug(slug);
            finalAlbumId = existingAlbum ? existingAlbum.id : this.db.createAlbum({
                title: albumName, slug, artist_id: finalArtistId || track.artist_id, owner_id: ownerId !== undefined ? ownerId : track.owner_id,
                date: null, cover_path: null, genre: "Library", description: "",
                type: 'album', year: null, download: null, price: 0, price_usdc: 0, currency: 'ETH',
                external_links: null, is_public: false, visibility: 'private', is_release: false,
                published_at: null, published_to_gundb: false, published_to_ap: false, license: null
            });
        }

        // 1. Handle File Renaming
        if (track.file_path && fileName && typeof fileName === 'string') {
            const oldPath = track.file_path;
            const oldDir = path.dirname(oldPath);
            const oldExt = path.extname(oldPath);
            let sanitizedName = path.parse(fileName).name.replace(/[^a-z0-9_\-]/gi, '_');
            const newPath = path.posix.join(oldDir, sanitizedName + oldExt);

            if (newPath !== oldPath) {
                console.log(`[LibraryService] Renaming track file: ${oldPath} -> ${newPath}`);
                const fullOldPath = path.join(this.musicDir, oldPath);
                const fullNewPath = path.join(this.musicDir, newPath);

                try {
                    if (await this.storage.pathExists(fullOldPath)) {
                        await this.storage.move(fullOldPath, fullNewPath);
                        this.db.updateTrackPath(trackId, newPath, track.album_id);
                    }

                    if (track.lossless_path) {
                        const losslessExt = path.extname(track.lossless_path);
                        const newLosslessPath = path.posix.join(path.dirname(track.lossless_path), sanitizedName + losslessExt);
                        const fullOldLossless = path.join(this.musicDir, track.lossless_path);
                        const fullNewLossless = path.join(this.musicDir, newLosslessPath);
                        if (await this.storage.pathExists(fullOldLossless)) {
                            await this.storage.move(fullOldLossless, fullNewLossless);
                            this.db.updateTrackLosslessPath(trackId, newLosslessPath);
                        }
                    }
                } catch (err: any) {
                    console.error(`[LibraryService] Rename failed for track ${trackId}:`, err.message);
                }
            }
        }

        // 2. Database updates
        if (title !== undefined) this.db.updateTrackTitle(trackId, title);
        if (finalArtistId !== undefined) this.db.updateTrackArtist(trackId, finalArtistId);
        if (finalAlbumId !== undefined) this.db.updateTrackAlbum(trackId, finalAlbumId);
        if (ownerId !== undefined) {
            (this.db as any).db.prepare("UPDATE tracks SET owner_id = ? WHERE id = ?").run(ownerId, trackId);
        }
        if (trackNumber !== undefined) {
            (this.db as any).db.prepare("UPDATE tracks SET track_num = ? WHERE id = ?").run(trackNumber, trackId);
        }
        if (duration !== undefined) {
            this.db.updateTrackDuration(trackId, parseFloat(duration));
        }
        if (price !== undefined || priceUsdc !== undefined) {
            this.db.updateTrackPrice(trackId, price ?? track.price, priceUsdc ?? track.price_usdc, currency ?? track.currency);
        }
        if (lyrics !== undefined) this.db.updateTrackLyrics(trackId, lyrics);
        if (genre !== undefined) this.db.updateTrackGenre(trackId, genre);
        if (year !== undefined) this.db.updateTrackYear(trackId, year ? Number(year) : null);
        if (externalArtwork !== undefined) this.db.updateTrackExternalArtwork(trackId, externalArtwork);

        const updatedTrack = this.db.getTrack(trackId);

        // 3. Write Tags to disk
        if (updatedTrack && updatedTrack.file_path) {
            await this.writeTrackTags(updatedTrack);
        }

        // 4. Federation sync
        if (updatedTrack && updatedTrack.album_id) {
            await this.publishing.syncRelease(updatedTrack.album_id).catch(e => 
                console.error(`[LibraryService] Sync failed for track update:`, e)
            );
        }

        return updatedTrack;
    }

    /**
     * Updates multiple tracks in batch.
     */
    async batchUpdateTracks(trackIds: number[], data: any, user: { userId?: number, artistId?: number, isAdmin: boolean, username?: string }): Promise<any> {
        const results = { success: 0, failed: 0, errors: [] as string[] };
        const affectedAlbums = new Set<number>();

        const tracks = this.db.getTracksByIds(trackIds);
        const trackMap = new Map(tracks.map(t => [t.id, t]));

        for (const id of trackIds) {
            try {
                const track = trackMap.get(id);
                if (!track) {
                    results.failed++;
                    results.errors.push(`Track ${id} not found`);
                    continue;
                }

                // Ownership Check
                const isOwner = track.owner_id === user.userId || (track.owner_id === null && track.artist_id === user.artistId);
                if (!user.isAdmin && !isOwner) {
                    results.failed++;
                    results.errors.push(`Track ${id}: Access denied`);
                    continue;
                }

                await this.updateTrack(id, data);
                results.success++;
                if (track.album_id) affectedAlbums.add(track.album_id);
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Track ${id}: ${err.message}`);
            }
        }

        return results;
    }

    /**
     * Deletes multiple tracks in batch.
     */
    async batchDeleteTracks(trackIds: number[], deleteFiles: boolean, user: { userId?: number, artistId?: number, isAdmin: boolean }): Promise<any> {
        const results = { success: 0, failed: 0, errors: [] as string[] };
        const affectedAlbums = new Set<number>();
        
        const tracks = this.db.getTracksByIds(trackIds);
        
        for (const track of tracks) {
            try {
                // Ownership Check
                const isOwner = track.owner_id === user.userId || (track.owner_id === null && track.artist_id === user.artistId);
                if (!user.isAdmin && !isOwner) {
                    results.failed++;
                    results.errors.push(`Track ${track.id}: Access denied`);
                    continue;
                }

                if (track.album_id) affectedAlbums.add(track.album_id);
                await this.deleteTrack(track.id, deleteFiles);
                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Track ${track.id}: ${err.message}`);
            }
        }

        return results;
    }

    /**
     * Stars an album.
     */
    async starAlbum(username: string, albumId: number): Promise<void> {
        const album = this.db.getAlbum(albumId) || this.db.getRelease(albumId);
        if (!album) throw new Error("Album not found");
        this.db.starItem(username, 'album', String(albumId));
    }

    /**
     * Unstars an album.
     */
    async unstarAlbum(username: string, albumId: number): Promise<void> {
        this.db.unstarItem(username, 'album', String(albumId));
    }

    /**
     * Sets album rating.
     */
    async setAlbumRating(username: string, albumId: number, rating: number): Promise<void> {
        const album = this.db.getAlbum(albumId) || this.db.getRelease(albumId);
        if (!album) throw new Error("Album not found");
        this.db.setItemRating(username, 'album', String(albumId), rating);
    }

    /**
     * Helper to write ID3/Vorbis/etc tags to the physical file.
     */
    private async writeTrackTags(track: Track): Promise<void> {
        const fullPath = path.join(this.musicDir, track.file_path!);
        if (!(await this.storage.pathExists(fullPath))) return;

        const ext = path.extname(fullPath).toLowerCase();
        const tags = {
            title: track.title,
            artist: track.artist_name || undefined,
            album: track.album_title || undefined,
            trackNumber: track.track_num?.toString() || undefined
        };

        try {
            if (ext === '.mp3') {
                NodeID3.update(tags as any, fullPath);
            } else if (['.flac', '.ogg', '.m4a', '.wav'].includes(ext)) {
                await writeMetadata(fullPath, {
                    title: tags.title,
                    artist: tags.artist,
                    album: tags.album,
                    track: tags.trackNumber
                });
            }
        } catch (err) {
            console.error(`[LibraryService] Failed to write tags for ${track.id}:`, err);
        }
    }
}
