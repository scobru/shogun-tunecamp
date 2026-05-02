import { jest } from '@jest/globals';

// Mock ffmpeg.js at the top level
jest.unstable_mockModule('../ffmpeg.js', () => ({
    writeMetadata: jest.fn().mockImplementation(() => Promise.resolve())
}));

// Mock node-id3
jest.unstable_mockModule('node-id3', () => ({
    default: {
        update: jest.fn()
    }
}));

// Dynamic import for the service
const { LibraryService: LibService } = await import('./library.service.js');

describe('LibraryService', () => {
    let service: any;
    let mockDb: any;
    let mockPublishing: any;
    let mockZendb: any;
    let mockStorage: any;
    const musicDir = '/tmp/music';

    beforeEach(() => {
        mockDb = {
            getAlbum: jest.fn(),
            getRelease: jest.fn(),
            getTrack: jest.fn(),
            getTracksByIds: jest.fn(),
            getArtistByName: jest.fn(),
            getAlbumBySlug: jest.fn(),
            createArtist: jest.fn(),
            createAlbum: jest.fn(),
            updateTrackTitle: jest.fn(),
            updateTrackArtist: jest.fn(),
            updateTrackAlbum: jest.fn(),
            updateTrackOwner: jest.fn(),
            updateTrackNumber: jest.fn(),
            updateTrackGenre: jest.fn(),
            updateTrackYear: jest.fn(),
            updateTrackPrice: jest.fn(),
            updateTrackPath: jest.fn(),
            promoteToRelease: jest.fn(),
            updateAlbumVisibility: jest.fn(),
            deleteAlbum: jest.fn(),
            starItem: jest.fn(),
            unstarItem: jest.fn(),
            setItemRating: jest.fn(),
            deleteTrack: jest.fn()
        };
        mockPublishing = {
            syncRelease: jest.fn().mockImplementation(() => Promise.resolve()),
            unpublishReleaseFromAP: jest.fn().mockImplementation(() => Promise.resolve())
        };
        mockZendb = {
            unpublishRelease: jest.fn().mockImplementation(() => Promise.resolve())
        };
        mockStorage = {
            pathExists: jest.fn().mockImplementation(() => Promise.resolve(true)),
            remove: jest.fn().mockImplementation(() => Promise.resolve()),
            move: jest.fn().mockImplementation(() => Promise.resolve())
        };

        service = new LibService(mockDb as any, mockPublishing as any, mockZendb as any, mockStorage as any, musicDir);
    });

    describe('batchUpdateTracks', () => {
        test('updates multiple tracks and syncs albums once', async () => {
            const trackIds = [1, 2];
            const tracks = [
                { id: 1, title: 'Track 1', album_id: 10, owner_id: 100, file_path: 't1.mp3' },
                { id: 2, title: 'Track 2', album_id: 10, owner_id: 100, file_path: 't2.mp3' }
            ];
            mockDb.getTracksByIds.mockReturnValue(tracks);
            mockDb.getTrack.mockImplementation((id: number) => tracks.find((t: any) => t.id === id));
            
            const data = { genre: 'Rock' };
            const user = { userId: 100, isAdmin: false };

            const result = await service.batchUpdateTracks(trackIds, data, user);

            expect(result.success).toBe(2);
            expect(mockDb.updateTrackGenre).toHaveBeenCalledTimes(2);
            expect(mockPublishing.syncRelease).toHaveBeenCalledWith(10);
            expect(mockPublishing.syncRelease).toHaveBeenCalledTimes(1);
        });
    });
});
