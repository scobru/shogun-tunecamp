import { createReleaseRoutes } from './releases.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../database.js';
import type { ScannerService } from '../scanner.js';
import type { PublishingService } from '../publishing.js';

// Mock dependencies
const mockDatabase = {
    getArtistByName: jest.fn(),
    createArtist: jest.fn(),
    getArtist: jest.fn(),
    createAlbum: jest.fn(),
    updateReleaseTracks: jest.fn(),
    getAlbum: jest.fn(),
    updateAlbumTitle: jest.fn(),
    updateAlbumArtist: jest.fn(),
    updateAlbumVisibility: jest.fn(),
    updateAlbumFederationSettings: jest.fn(),
    getReleaseTrackIds: jest.fn(),
    getTracksByReleaseId: jest.fn(),
    deleteAlbum: jest.fn(),
    db: {
        prepare: jest.fn(() => ({ run: jest.fn() }))
    }
} as unknown as DatabaseService;

const mockScanner = {
    scanDirectory: jest.fn(),
} as unknown as ScannerService;

const mockPublishingService = {
    syncRelease: jest.fn().mockImplementation(async () => {}),
    unpublishReleaseFromAP: jest.fn().mockImplementation(async () => {}),
    unpublishReleaseFromGunDB: jest.fn().mockImplementation(async () => {}),
} as unknown as PublishingService;

const musicDir = '/tmp/music';

describe('Release Routes - Creation and Publishing', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();

        app = express();
        app.use(express.json());

        // Middleware to mock permissions if needed (releases routes check req.artistId for updates/deletes but create seems open or admin only?)
        // In this test environment, we assume the router is mounted and authenticated.

        const router = createReleaseRoutes(
            mockDatabase,
            mockScanner,
            musicDir,
            mockPublishingService
        );
        app.use('/releases', router);
    });

    test('POST /releases should trigger publishing sync for new public releases', async () => {
        // Setup
        const newAlbumId = 123;
        (mockDatabase.createAlbum as jest.Mock).mockReturnValue(newAlbumId);
        (mockDatabase.getAlbum as jest.Mock).mockReturnValue({
            id: newAlbumId,
            title: 'Test Album',
            visibility: 'public',
            published_to_ap: true,
            published_to_gundb: true
        });

        // Act
        const response = await request(app)
            .post('/releases')
            .send({
                title: 'Test Album',
                visibility: 'public',
                publishedToAP: true
            });

        // Assert
        expect(response.status).toBe(201);
        expect(mockDatabase.createAlbum).toHaveBeenCalled();

        // Ensure syncRelease is called for new releases
        expect(mockPublishingService.syncRelease).toHaveBeenCalledWith(newAlbumId);
    });
});
