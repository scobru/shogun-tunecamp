import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import type { DatabaseService } from '../database.js';
import type { PublishingService } from '../publishing.js';

// Mock everything needed
jest.unstable_mockModule('node-fetch', () => ({ default: jest.fn() }));
jest.unstable_mockModule('fs-extra', () => ({ default: { pathExists: jest.fn(), promises: { stat: jest.fn() }, createReadStream: jest.fn() } }));
jest.unstable_mockModule('fluent-ffmpeg', () => ({ default: jest.fn() }));
jest.unstable_mockModule('ffmpeg-static', () => ({ default: '/tmp/ffmpeg' }));
jest.unstable_mockModule('music-metadata', () => ({ parseFile: jest.fn() }));
jest.unstable_mockModule('../ffmpeg.js', () => ({ writeMetadata: jest.fn() }));
jest.unstable_mockModule('../metadata.js', () => ({ metadataService: { getWaveform: jest.fn() } }));
jest.unstable_mockModule('../publishing.js', () => ({ PublishingService: jest.fn() }));

const { createTracksRoutes } = await import('./tracks.js');

describe('Track Visibility Logic', () => {
    let mockDatabase: any;
    let mockPublishingService: any;
    let app: express.Express;
    let authContext: any = { isAdmin: false, artistId: null };

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockDatabase = {
            getTracks: jest.fn(),
            getTracksByArtist: jest.fn(),
            getTrack: jest.fn(),
        };

        mockPublishingService = {
            syncRelease: jest.fn(),
        };

        app = express();
        app.use(express.json());
        
        // Dynamic Auth Mock
        app.use((req: any, res, next) => {
            req.isAdmin = authContext.isAdmin;
            req.artistId = authContext.artistId;
            next();
        });

        const router = createTracksRoutes(mockDatabase as any, mockPublishingService as any, '/tmp/music');
        app.use('/api/tracks', router);
    });

    const publicTracks = [
        { id: 1, title: 'Public Track 1', artist_id: 10, album_id: 100 },
        { id: 2, title: 'Public Track 2', artist_id: 11, album_id: 101 }
    ];

    const artistTracks = [
        { id: 3, title: 'Artist Private Track', artist_id: 10, album_id: null },
        { id: 4, title: 'Artist Album Track', artist_id: 10, album_id: 102 }
    ];

    test('Admins see all tracks', async () => {
        authContext = { isAdmin: true, artistId: null };
        mockDatabase.getTracks.mockReturnValue([...publicTracks, ...artistTracks]);

        const res = await request(app).get('/api/tracks');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(4);
        expect(mockDatabase.getTracks).toHaveBeenCalledWith();
    });

    test('Guests see only public tracks', async () => {
        authContext = { isAdmin: false, artistId: null };
        mockDatabase.getTracks.mockReturnValue(publicTracks);

        const res = await request(app).get('/api/tracks');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(2);
        expect(mockDatabase.getTracks).toHaveBeenCalledWith(undefined, true);
    });

    test('Artists see their own tracks plus public catalog', async () => {
        authContext = { isAdmin: false, artistId: 10 };
        mockDatabase.getTracksByArtist.mockReturnValue(artistTracks);
        mockDatabase.getTracks.mockReturnValue(publicTracks);

        const res = await request(app).get('/api/tracks');
        expect(res.status).toBe(200);
        // Combined and deduplicated: 2 private + 2 public = 4
        expect(res.body.length).toBe(4);
        expect(mockDatabase.getTracksByArtist).toHaveBeenCalledWith(10);
        expect(mockDatabase.getTracks).toHaveBeenCalledWith(undefined, true);
    });

    test('Artists see deduplicated tracks if they appear in both', async () => {
        authContext = { isAdmin: false, artistId: 10 };
        // Assume track 1 is also owned by artist 10 and is already public
        const artistOwnsPublicTrack = publicTracks[0];
        mockDatabase.getTracksByArtist.mockReturnValue([artistOwnsPublicTrack, ...artistTracks]);
        mockDatabase.getTracks.mockReturnValue(publicTracks);

        const res = await request(app).get('/api/tracks');
        expect(res.status).toBe(200);
        // Public(1,2) + ArtistOwned(1,3,4) = 4 unique tracks
        expect(res.body.length).toBe(4);
        const ids = res.body.map((t: any) => t.id).sort();
        expect(ids).toEqual([1, 2, 3, 4]);
    });
});
