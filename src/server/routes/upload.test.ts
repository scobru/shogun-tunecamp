import { createUploadRoutes } from './upload.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { DatabaseService } from '../database.js';
import type { ScannerService } from '../scanner.js';

// Mock dependencies
const mockDatabase = {
    getAlbumBySlug: jest.fn(),
    updateAlbumCover: jest.fn(),
    getArtist: jest.fn(),
    updateArtist: jest.fn(),
    setSetting: jest.fn(),
} as unknown as DatabaseService;

const mockScanner = {
    processAudioFile: jest.fn(),
} as unknown as ScannerService;

describe('Upload Routes - Path Traversal', () => {
    let app: express.Express;
    let tempMusicDir: string;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create a temporary music directory
        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-test-'));
        await fs.ensureDir(path.join(tempMusicDir, 'releases'));
        await fs.ensureDir(path.join(tempMusicDir, 'assets'));

        app = express();
        app.use(express.json());

        const router = createUploadRoutes(
            mockDatabase,
            mockScanner,
            tempMusicDir
        );
        app.use('/upload', router);
    });

    afterEach(async () => {
        // Clean up temp directory
        await fs.remove(tempMusicDir);
    });

    test('POST /upload/cover prevents path traversal with "releaseSlug: ../"', async () => {
        // Setup
        (mockDatabase.getAlbumBySlug as jest.Mock).mockReturnValue(undefined);

        // Create a dummy image file
        const imagePath = path.join(tempMusicDir, 'test-image.jpg');
        await fs.writeFile(imagePath, 'fake image content');

        // Act
        // Attempt to upload to "../" which resolves to tempMusicDir root instead of tempMusicDir/releases/../artwork
        // Wait, logic: releaseDir = path.join(musicDir, "releases", releaseSlug)
        // If releaseSlug = "../", releaseDir = path.join(musicDir, "releases", "../") = musicDir
        // artworkDir = path.join(musicDir, "artwork")
        // So we expect a file in musicDir/artwork/cover-TIMESTAMP.jpg

        // Ensure "artwork" dir doesn't exist in root
        const rootArtworkDir = path.join(tempMusicDir, "artwork");
        await fs.remove(rootArtworkDir);

        const response = await request(app)
            .post('/upload/cover')
            .field('releaseSlug', '../') // Path traversal payload
            .attach('file', imagePath);

        // Assert
        // We expect failure (404) because album not found, OR explicitly blocked path traversal
        // Currently, the code returns 200 and writes the file.

        // This test asserts the DESIRED SECURE behavior.
        // It will fail if the vulnerability exists.

        expect(response.status).not.toBe(200);

        // Check if file was written to the traversal path
        const traversedDirExists = await fs.pathExists(rootArtworkDir);
        expect(traversedDirExists).toBe(false);
    });

    test('POST /upload/cover allows valid upload', async () => {
        // Setup
        const validSlug = 'valid-album';
        (mockDatabase.getAlbumBySlug as jest.Mock).mockReturnValue({
            id: 1,
            title: 'Valid Album',
            slug: validSlug,
            artist_id: 1
        });

        // Create dummy image
        const imagePath = path.join(tempMusicDir, 'valid.jpg');
        await fs.writeFile(imagePath, 'valid image content');

        // Act
        const response = await request(app)
            .post('/upload/cover')
            .field('releaseSlug', validSlug)
            .attach('file', imagePath);

        // Assert
        expect(response.status).toBe(200);

        // Verify file exists in correct location
        const expectedDir = path.join(tempMusicDir, 'releases', validSlug, 'artwork');
        const files = await fs.readdir(expectedDir);
        expect(files.length).toBeGreaterThan(0);
        expect(files[0]).toContain('cover-');
    });
});
