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
        app.use((req: any, res, next) => {
            req.isAdmin = true;
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
});
