import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { createDatabase } from '../database.js';
import type { ConsolidationService } from '../consolidate.js';

// Mock dependencies
// Note: unstable_mockModule is needed for ESM
await jest.unstable_mockModule('../ffmpeg.js', () => ({
    convertWavToMp3: jest.fn(() => Promise.resolve('dummy/path.mp3')),
}));

await jest.unstable_mockModule('node-id3', () => ({
    default: {
        write: jest.fn().mockReturnValue(true),
    },
    // Also support named export if used
    write: jest.fn().mockReturnValue(true),
}));

// Dynamic import after mocks
const { ConsolidationService: ConsolidationServiceClass } = await import('../consolidate.js');

describe('ConsolidationService Reproduction', () => {
    let db: any;
    let service: ConsolidationService;
    let tempDir: string;

    beforeEach(async () => {
        // Setup DB
        const dbService = createDatabase(':memory:');
        db = dbService;

        // Setup temp dir
        tempDir = await fs.mkdtemp(path.join(process.cwd(), 'test-music-'));
        await fs.ensureDir(path.join(tempDir, 'library'));

        service = new ConsolidationServiceClass(dbService, tempDir);
    });

    afterEach(async () => {
        await fs.remove(tempDir);
        if (db && db.db) db.db.close();
    });

    it('should reset associations: deletes release association', async () => {
        // 1. Setup Artist, Album, Release
        const artistId = db.createArtist('Test Artist');
        const albumId = db.createAlbum({
            title: 'Test Album',
            artist_id: artistId,
            is_release: false,
            slug: 'test-album'
        });
        const releaseId = db.createAlbum({
            title: 'Test Release',
            artist_id: artistId,
            is_release: true,
            slug: 'test-release'
        });

        // 2. Create Track linked to Album
        const trackPath = path.join('Test Artist', 'Test Album', '01 - Test Track.mp3');
        await fs.ensureDir(path.dirname(path.join(tempDir, trackPath)));
        await fs.writeFile(path.join(tempDir, trackPath), 'dummy content');

        const trackId = db.createTrack({
            title: 'Test Track',
            album_id: albumId,
            artist_id: artistId,
            track_num: 1,
            file_path: trackPath,
            format: 'mp3'
        });

        // 3. Link Track to Release
        db.addTrackToRelease(releaseId, trackId);

        // Verify initial state
        let releaseTracks = db.getReleaseTrackIds(releaseId);
        expect(releaseTracks).toContain(trackId);

        // 4. Run Consolidate
        const result = await service.consolidateTrack(trackId);
        expect(result).toBe(true);

        // 5. Check release association (New behavior: Deleted)
        releaseTracks = db.getReleaseTrackIds(releaseId);
        expect(releaseTracks).not.toContain(trackId);

        // 6. Check album association (New behavior: Restored because folder matches)
        const track = db.getTrack(trackId);
        expect(track.album_id).toBe(albumId);
    });

    it('should reset associations: deletes album association if consolidation fails', async () => {
         const artistId = db.createArtist('Artist 2');
         const albumId = db.createAlbum({ title: 'Album 2', artist_id: artistId, slug: 'album-2' });

         const trackId = db.createTrack({
             title: 'Missing File',
             album_id: albumId,
             artist_id: artistId,
             file_path: 'nowhere.mp3',
             format: 'mp3'
         });

         const result = await service.consolidateTrack(trackId);
         // New behavior: Returns false because no album found (album_id reset)
         expect(result).toBe(false);

         // Album association should be reset (null)
         const track = db.getTrack(trackId);
         expect(track.album_id).toBeNull();
    });
});
