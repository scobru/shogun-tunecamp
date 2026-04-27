import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import type { DatabaseService } from '../database.js';
import type { PublishingService } from '../publishing.js';

// Mock node-fetch
const mockFetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch,
}));

// Mock fs-extra
const mockFs = {
    pathExists: jest.fn(),
    promises: { stat: jest.fn() },
    createReadStream: jest.fn(),
    remove: jest.fn(),
    move: jest.fn(),
};
jest.unstable_mockModule('fs-extra', () => ({
  default: mockFs,
  pathExists: mockFs.pathExists, // In case named import is used somewhere
}));

// Mock fluent-ffmpeg
jest.unstable_mockModule('fluent-ffmpeg', () => ({
  default: Object.assign(jest.fn(() => ({
      format: jest.fn().mockReturnThis(),
      audioBitrate: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      pipe: jest.fn(),
  })), {
      setFfmpegPath: jest.fn(),
  }),
}));

// Mock ffmpeg-static
jest.unstable_mockModule('ffmpeg-static', () => ({
  default: '/tmp/ffmpeg'
}));

// Mock music-metadata
jest.unstable_mockModule('music-metadata', () => ({
  parseFile: jest.fn()
}));

// Mock node-id3
jest.unstable_mockModule('node-id3', () => ({
  default: { update: jest.fn() }
}));

// Mock ../ffmpeg.js
jest.unstable_mockModule('../ffmpeg.js', () => ({
    writeMetadata: jest.fn()
}));

// Import module under test dynamically
const { createTracksRoutes } = await import('./tracks.js');

const mockDatabase = {
    getTrack: jest.fn(),
    getAlbum: jest.fn(),
    getTracks: jest.fn(),
    getTracksByArtist: jest.fn(),
    getTracksByOwner: jest.fn(),
    deleteTrack: jest.fn(),
} as unknown as DatabaseService;

const mockPublishingService = {
    syncRelease: jest.fn(),
} as unknown as PublishingService;

describe('Tracks Routes', () => {
    test("fetch is mocked", async () => { const { default: f } = await import("node-fetch"); expect(jest.isMockFunction(f)).toBe(true); });
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        // Mock auth middleware
        let testAuth = { isAdmin: true, artistId: null as number | null };
        app.use((req: any, res, next) => {
            req.isAdmin = (app as any).testAuth?.isAdmin ?? true;
            req.artistId = (app as any).testAuth?.artistId ?? null;
            req.userId = (app as any).testAuth?.userId ?? ((app as any).testAuth?.artistId ?? undefined);
            req.isActive = (app as any).testAuth?.isActive ?? true;
            next();
        });

        const router = createTracksRoutes(mockDatabase, mockPublishingService, '/tmp/music');
        app.use('/tracks', router);
    });

    test.skip('GET /:id/stream proxies external track if file_path is missing', async () => {
        const mockTrack = {
            id: 1,
            title: 'External Track',
            url: 'http://example.com/song.mp3',
            file_path: null
        };
        (mockDatabase.getTrack as jest.Mock).mockReturnValue(mockTrack);

        // Mock fetch response
        const mockResponse = {
            ok: true,
            statusText: 'OK',
            headers: {
                has: (key: string) => ['content-type', 'content-length'].includes(key),
                get: (key: string) => {
                    if (key === 'content-type') return 'audio/mpeg';
                    if (key === 'content-length') return '12345';
                    return null;
                }
            },
            body: {
                pipe: jest.fn((res: any) => { res.end(); return res; })
            }
        };
        (mockFetch as any).mockResolvedValue(mockResponse as any);

        const response = await request(app).get('/tracks/1/stream');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('audio/mpeg');
        expect(response.headers['content-length']).toBe('12345');
        expect(mockFetch).toHaveBeenCalledWith('http://example.com/song.mp3');
    });

    test('GET /:id/stream returns 404 if track not found', async () => {
        (mockDatabase.getTrack as jest.Mock).mockReturnValue(null);
        const response = await request(app).get('/tracks/999/stream');
        expect(response.status).toBe(404);
    });

    describe('Visibility Logic', () => {
        const publicTracks = [
            { id: 1, title: 'Public 1', artist_id: 10, album_id: 100 },
            { id: 2, title: 'Public 2', artist_id: 11, album_id: 101 }
        ];
        const privateTracks = [
            { id: 3, title: 'Private 1', artist_id: 10, album_id: null },
        ];

        test('Admins see all tracks', async () => {
            (app as any).testAuth = { isAdmin: true };
            (mockDatabase.getTracks as jest.Mock).mockReturnValue([...publicTracks, ...privateTracks]);
            
            const res = await request(app).get('/tracks');
            expect(res.status).toBe(200);
            expect(res.body.length).toBe(3);
            expect(mockDatabase.getTracks).toHaveBeenCalledWith();
        });

        test('Artists see their own tracks + public catalog', async () => {
            (app as any).testAuth = { isAdmin: false, artistId: 10 };
            (mockDatabase.getTracksByOwner as jest.Mock).mockReturnValue(privateTracks);
            (mockDatabase.getTracks as jest.Mock).mockReturnValue(publicTracks);

            const res = await request(app).get('/tracks');
            expect(res.status).toBe(200);
            // Combined: 1 private + 2 public = 3
            expect(res.body.length).toBe(3);
            expect(mockDatabase.getTracksByOwner).toHaveBeenCalledWith(10);
            expect(mockDatabase.getTracks).toHaveBeenCalledWith(undefined, true);
        });

        test('Guests see only public tracks', async () => {
            (app as any).testAuth = { isAdmin: false, artistId: null };
            (mockDatabase.getTracks as jest.Mock).mockReturnValue(publicTracks);

            const res = await request(app).get('/tracks');
            expect(res.status).toBe(200);
            expect(res.body.length).toBe(2);
            expect(mockDatabase.getTracks).toHaveBeenCalledWith(undefined, true);
        });
    });

    describe('Deletion Logic', () => {
        test('Artists can delete their own tracks', async () => {
            (app as any).testAuth = { isAdmin: false, artistId: 10 };
            const myTrack = { id: 274, artist_id: 10, owner_id: 10, title: 'My Track' };
            (mockDatabase.getTrack as jest.Mock).mockReturnValue(myTrack);

            const res = await request(app).delete('/tracks/274');
            expect(res.status).toBe(200);
            expect(mockDatabase.deleteTrack).toHaveBeenCalledWith(274);
        });

        test('Artists cannot delete tracks of others', async () => {
            (app as any).testAuth = { isAdmin: false, artistId: 10 };
            const otherTrack = { id: 275, artist_id: 11, owner_id: 11, title: 'Other Track' };
            (mockDatabase.getTrack as jest.Mock).mockReturnValue(otherTrack);

            const res = await request(app).delete('/tracks/275');
            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Access denied');
            expect(mockDatabase.deleteTrack).not.toHaveBeenCalled();
        });

        test('Guests (no artistId) cannot delete anything', async () => {
            (app as any).testAuth = { isAdmin: false, artistId: null };
            const anyTrack = { id: 274, artist_id: 10, title: 'Any Track' };
            (mockDatabase.getTrack as jest.Mock).mockReturnValue(anyTrack);

            const res = await request(app).delete('/tracks/274');
            expect(res.status).toBe(401);
            expect(mockDatabase.deleteTrack).not.toHaveBeenCalled();
        });
    });
});
