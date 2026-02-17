import { createAdminRoutes } from './admin.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../database.js';
import type { ScannerService } from '../scanner.js';
import type { GunDBService } from '../gundb.js';
import type { ServerConfig } from '../config.js';
import type { AuthService } from '../auth.js';
import type { PublishingService } from '../publishing.js';

// Mock dependencies
const mockDatabase = {
    getSetting: jest.fn(),
    setSetting: jest.fn(),
    getStats: jest.fn(),
    getAllSettings: jest.fn(),
    getArtists: jest.fn(),
    getAlbums: jest.fn(),
    getAlbum: jest.fn(),
    updateAlbumVisibility: jest.fn(),
    getTracks: jest.fn(),
    getPost: jest.fn(),
    updatePost: jest.fn(),
    createPost: jest.fn(),
    deletePost: jest.fn(),
} as unknown as DatabaseService;

const mockScanner = {
    scanDirectory: jest.fn(),
} as unknown as ScannerService;

const mockGunDBService = {
    registerSite: jest.fn(),
    registerTracks: jest.fn(),
    unregisterTracks: jest.fn(),
    syncNetwork: jest.fn(),
    getIdentityKeyPair: jest.fn(),
    setIdentityKeyPair: jest.fn(),
} as unknown as GunDBService;

const mockConfig = {
    publicUrl: 'http://localhost',
    siteName: 'Test Site',
} as unknown as ServerConfig;

const mockAuthService = {
    isRootAdmin: jest.fn(),
    listAdmins: jest.fn(),
    changePassword: jest.fn(),
    createAdmin: jest.fn(),
    updateAdmin: jest.fn(),
    deleteAdmin: jest.fn(),
} as unknown as AuthService;

const mockPublishingService = {
    publishReleaseToGunDB: jest.fn(),
    unpublishReleaseFromGunDB: jest.fn(),
    publishReleaseToAP: jest.fn(),
    unpublishReleaseFromAP: jest.fn(),
    syncRelease: jest.fn(),
    publishPostToAP: jest.fn(),
    unpublishPostFromAP: jest.fn(),
    syncPost: jest.fn(),
} as unknown as PublishingService;


describe('Admin Routes Vulnerability Check', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();

        app = express();
        app.use(express.json());

        // Simple auth middleware mock
        app.use((req: any, res, next) => {
            req.username = req.headers['x-username'] || 'admin';
            next();
        });

        const router = createAdminRoutes(
            mockDatabase,
            mockScanner,
            '/tmp/music',
            mockGunDBService,
            mockConfig,
            mockAuthService,
            mockPublishingService
        );
        app.use('/admin', router);
    });

    test('Non-root admin CANNOT change root admin password', async () => {
        // Setup:
        // root admin (id=1, username='root')
        // other admin (id=2, username='other')

        const admins = [
            { id: 1, username: 'root', is_root: true, artist_id: null, created_at: '', artist_name: null },
            { id: 2, username: 'other', is_root: false, artist_id: null, created_at: '', artist_name: null }
        ];

        (mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
        (mockAuthService.isRootAdmin as jest.Mock).mockImplementation((username) => username === 'root');
        (mockAuthService.changePassword as jest.Mock).mockImplementation(async () => {});

        // Act: specific user 'other' tries to change password of user 'root' (id=1)
        const response = await request(app)
            .put('/admin/system/users/1/password')
            .set('x-username', 'other') // Authenticated as 'other'
            .send({ password: 'newpassword123' });

        // Assert:
        // Currently (vulnerable): 200 OK
        // Expected (fixed): 403 Forbidden

        expect(response.status).toBe(403);
        expect(mockAuthService.changePassword).not.toHaveBeenCalled();
    });

    test('Root admin CAN change other admin password', async () => {
        const admins = [
            { id: 1, username: 'root', is_root: true, artist_id: null, created_at: '', artist_name: null },
            { id: 2, username: 'other', is_root: false, artist_id: null, created_at: '', artist_name: null }
        ];

        (mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
        (mockAuthService.isRootAdmin as jest.Mock).mockImplementation((username) => username === 'root');
        (mockAuthService.changePassword as jest.Mock).mockImplementation(async () => {});

        const response = await request(app)
            .put('/admin/system/users/2/password')
            .set('x-username', 'root')
            .send({ password: 'newpassword123' });

        expect(response.status).toBe(200);
        expect(mockAuthService.changePassword).toHaveBeenCalledWith('other', 'newpassword123');
    });

    test('User CAN change own password', async () => {
        const admins = [
            { id: 1, username: 'root', is_root: true, artist_id: null, created_at: '', artist_name: null },
            { id: 2, username: 'other', is_root: false, artist_id: null, created_at: '', artist_name: null }
        ];

        (mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
        (mockAuthService.isRootAdmin as jest.Mock).mockImplementation((username) => username === 'root');
        (mockAuthService.changePassword as jest.Mock).mockImplementation(async () => {});

        const response = await request(app)
            .put('/admin/system/users/2/password')
            .set('x-username', 'other')
            .send({ password: 'newpassword123' });

        expect(response.status).toBe(200);
        expect(mockAuthService.changePassword).toHaveBeenCalledWith('other', 'newpassword123');
    });

    test('Root admin CAN update settings with mode', async () => {
        (mockAuthService.isRootAdmin as jest.Mock).mockReturnValue(true);
        (mockDatabase.setSetting as jest.Mock).mockImplementation(() => {});
        (mockDatabase.getArtists as jest.Mock).mockReturnValue([]);
        (mockDatabase.getAlbums as jest.Mock).mockReturnValue([]);

        const response = await request(app)
            .put('/admin/settings')
            .set('x-username', 'root')
            .send({ mode: 'personal', siteName: 'My Library' });

        expect(response.status).toBe(200);
        expect(mockDatabase.setSetting).toHaveBeenCalledWith('mode', 'personal');
        expect(mockDatabase.setSetting).toHaveBeenCalledWith('siteName', 'My Library');
    });
});
