import { createAlbumsRoutes } from './albums.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { DatabaseService } from '../database.js';

// Mock dependencies
const mockDatabase = {
    getAlbum: jest.fn(),
    getAlbumBySlug: jest.fn(),
    getTracksByReleaseId: jest.fn(),
    getTracks: jest.fn(),
} as unknown as DatabaseService;

describe('Albums Routes - Cache Optimization', () => {
    let app: express.Express;
    let tempMusicDir: string;
    let coverPath: string;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create a temporary music directory
        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-test-albums-'));
        coverPath = path.join(tempMusicDir, 'cover.jpg');
        await fs.ensureDir(tempMusicDir);
        await fs.writeFile(coverPath, 'fake image content');

        app = express();
        app.use(express.json());

        const router = createAlbumsRoutes(mockDatabase, tempMusicDir);
        app.use('/albums', router);
    });

    afterEach(async () => {
        // Clean up temp directory
        await fs.remove(tempMusicDir);
    });

    test('GET /albums/:id/cover returns correct cache headers (max-age=86400)', async () => {
        // Setup
        (mockDatabase.getAlbum as jest.Mock).mockReturnValue({
            id: 1,
            title: 'Test Album',
            slug: 'test-album',
            cover_path: 'cover.jpg',
            visibility: 'public'
        });

        // Act
        const response = await request(app).get('/albums/1/cover');

        // Assert
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toContain('max-age=86400');
        expect(response.headers['content-type']).toContain('image/jpeg');
    });
});
