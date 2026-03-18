import { createCatalogRoutes } from './catalog.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../database.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

// Mock dependencies
const mockDatabase = {
    getStats: jest.fn(),
    getAlbums: jest.fn(),
    getPublicTracksCount: jest.fn(),
    search: jest.fn(),
    getSetting: jest.fn(),
    getRemoteTracks: jest.fn(),
    getRemotePosts: jest.fn(),
} as unknown as DatabaseService;

describe('Catalog Routes', () => {
    let app: express.Express;
    let mockIsAdmin = false;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIsAdmin = false;

        app = express();
        app.use(express.json());

        // Middleware to mock req.isAdmin
        app.use((req: any, res, next) => {
            req.isAdmin = mockIsAdmin;
            next();
        });

        const router = createCatalogRoutes(mockDatabase);
        app.use('/catalog', router);
    });

    describe('GET /catalog', () => {
        const mockStats = {
            artists: 5,
            albums: 10,
            tracks: 50,
            publicAlbums: 8,
            totalUsers: 2,
            storageUsed: 1024,
            networkSites: 3,
            totalTracks: 50,
            genresCount: 4
        };

        const mockAlbums = [
            { id: 1, title: 'Album 1' },
            { id: 2, title: 'Album 2' }
        ];

        test('should return stats and recent albums for admin', async () => {
            mockIsAdmin = true;
            (mockDatabase.getStats as jest.Mock<any>).mockResolvedValue(mockStats);
            (mockDatabase.getAlbums as jest.Mock).mockReturnValue(mockAlbums);

            const response = await request(app).get('/catalog');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                stats: mockStats,
                recentAlbums: mockAlbums
            });
            expect(mockDatabase.getStats).toHaveBeenCalled();
            expect(mockDatabase.getAlbums).toHaveBeenCalledWith(false);
            expect(mockDatabase.getPublicTracksCount).not.toHaveBeenCalled();
        });

        test('should return modified public stats and recent public albums for non-admin', async () => {
            mockIsAdmin = false;
            (mockDatabase.getStats as jest.Mock<any>).mockResolvedValue(mockStats);
            (mockDatabase.getAlbums as jest.Mock).mockReturnValue(mockAlbums);
            (mockDatabase.getPublicTracksCount as jest.Mock).mockReturnValue(30);

            const response = await request(app).get('/catalog');

            expect(response.status).toBe(200);
            expect(response.body.stats).toEqual({
                albums: 8,
                tracks: 30,
                artists: 5,
                publicAlbums: 8,
                totalUsers: 2,
                storageUsed: 1024,
                networkSites: 3,
                totalTracks: 30,
                genresCount: 4
            });
            expect(response.body.recentAlbums).toEqual(mockAlbums);
            expect(mockDatabase.getAlbums).toHaveBeenCalledWith(true);
            expect(mockDatabase.getPublicTracksCount).toHaveBeenCalled();
        });

        test('should handle errors and return 500', async () => {
            (mockDatabase.getStats as jest.Mock<any>).mockRejectedValue(new Error('DB Error'));

            const response = await request(app).get('/catalog');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Failed to get catalog' });
        });
    });

    describe('GET /catalog/search', () => {
        test('should return empty array if no query parameter is provided', async () => {
            const response = await request(app).get('/catalog/search');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
            expect(mockDatabase.search).not.toHaveBeenCalled();
        });

        test('should search and return results for non-admin', async () => {
            mockIsAdmin = false;
            const mockResults = {
                artists: [{ id: 1, name: 'Artist 1' }],
                albums: [],
                tracks: []
            };
            (mockDatabase.search as jest.Mock).mockReturnValue(mockResults);

            const response = await request(app).get('/catalog/search?q=test');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockResults);
            expect(mockDatabase.search).toHaveBeenCalledWith('test', true);
        });

        test('should search and return results for admin', async () => {
            mockIsAdmin = true;
            const mockResults = {
                artists: [],
                albums: [{ id: 1, title: 'Album 1' }],
                tracks: []
            };
            (mockDatabase.search as jest.Mock).mockReturnValue(mockResults);

            const response = await request(app).get('/catalog/search?q=test');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockResults);
            expect(mockDatabase.search).toHaveBeenCalledWith('test', false);
        });

        test('should handle errors and return 500', async () => {
            (mockDatabase.search as jest.Mock).mockImplementation(() => {
                throw new Error('Search failed');
            });

            const response = await request(app).get('/catalog/search?q=test');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Search failed' });
        });
    });

    describe('GET /catalog/settings', () => {
        test('should return default settings if none are configured', async () => {
            (mockDatabase.getSetting as jest.Mock).mockReturnValue(undefined);

            const response = await request(app).get('/catalog/settings');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                siteName: 'TuneCamp',
                siteDescription: '',
                donationLinks: null,
                backgroundImage: undefined,
                coverImage: undefined,
                mode: 'label',
                siteId: '',
                gunPeers: '',
                web3_checkout_address: '',
                web3_nft_address: ''
            });
        });

        test('should return configured settings', async () => {
            const mockSettings: { [key: string]: string } = {
                siteName: 'My Custom Site',
                siteDescription: 'A custom description',
                donationLinks: JSON.stringify([{ title: 'Donate', url: 'https://example.com' }]),
                backgroundImage: 'bg.jpg',
                coverImage: 'cover.jpg',
                mode: 'artist',
                siteId: 'site-123',
                gunPeers: 'peer1,peer2',
                web3_checkout_address: '0x123',
                web3_nft_address: '0x456'
            };

            (mockDatabase.getSetting as jest.Mock<any>).mockImplementation((key: string) => {
                return mockSettings[key];
            });

            const response = await request(app).get('/catalog/settings');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                siteName: 'My Custom Site',
                siteDescription: 'A custom description',
                donationLinks: [{ title: 'Donate', url: 'https://example.com' }],
                backgroundImage: 'bg.jpg',
                coverImage: 'cover.jpg',
                mode: 'artist',
                siteId: 'site-123',
                gunPeers: 'peer1,peer2',
                web3_checkout_address: '0x123',
                web3_nft_address: '0x456'
            });
        });

        test('should handle errors and return 500', async () => {
            (mockDatabase.getSetting as jest.Mock).mockImplementation(() => {
                throw new Error('Database error');
            });

            const response = await request(app).get('/catalog/settings');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Failed to get settings' });
        });
    });

    describe('GET /catalog/remote/tracks', () => {
        test('should return remote tracks', async () => {
            const mockRemoteTracks = [
                { id: 1, title: 'Remote Track 1', url: 'https://remote1.com/track' }
            ];
            (mockDatabase.getRemoteTracks as jest.Mock).mockReturnValue(mockRemoteTracks);

            const response = await request(app).get('/catalog/remote/tracks');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockRemoteTracks);
            expect(mockDatabase.getRemoteTracks).toHaveBeenCalled();
        });

        test('should handle errors and return 500', async () => {
            (mockDatabase.getRemoteTracks as jest.Mock).mockImplementation(() => {
                throw new Error('Database error');
            });

            const response = await request(app).get('/catalog/remote/tracks');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Failed to get remote tracks' });
        });
    });

    describe('GET /catalog/remote/posts', () => {
        test('should return remote posts', async () => {
            const mockRemotePosts = [
                { id: 1, content: 'Remote Post 1', url: 'https://remote1.com/post' }
            ];
            (mockDatabase.getRemotePosts as jest.Mock).mockReturnValue(mockRemotePosts);

            const response = await request(app).get('/catalog/remote/posts');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockRemotePosts);
            expect(mockDatabase.getRemotePosts).toHaveBeenCalled();
        });

        test('should handle errors and return 500', async () => {
            (mockDatabase.getRemotePosts as jest.Mock).mockImplementation(() => {
                throw new Error('Database error');
            });

            const response = await request(app).get('/catalog/remote/posts');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Failed to get remote posts' });
        });
    });
});
