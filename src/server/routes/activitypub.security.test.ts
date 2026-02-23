import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { createActivityPubRoutes } from './activitypub.js';
import type { DatabaseService } from '../database.js';
import type { ActivityPubService } from '../activitypub.js';

const mockDb = {
    getApNote: jest.fn(),
    getAlbum: jest.fn(),
    getPost: jest.fn(),
    deleteApNote: jest.fn(),
    updateAlbumVisibility: jest.fn(),
    updatePost: jest.fn(),
    getArtistBySlug: jest.fn(),
} as unknown as DatabaseService;

const mockApService = {
    broadcastDelete: jest.fn(),
    broadcastPostDelete: jest.fn(),
} as unknown as ActivityPubService;

const mockAuthMiddleware = {
    requireAdmin: (req: any, res: any, next: any) => {
        // Mock middleware that blocks if no token
        const token = req.headers.authorization;
        if (!token) {
            return res.status(401).json({ error: "No token provided" });
        }

        if (token === 'Bearer root') {
            req.isAdmin = true;
            req.artistId = null; // Root admin
        } else if (token === 'Bearer artist1') {
            req.isAdmin = true;
            req.artistId = 1;
        } else if (token === 'Bearer artist2') {
            req.isAdmin = true;
            req.artistId = 2;
        } else {
             // Default generic admin for existing tests compatibility, or treat as restricted?
             // Let's treat as root for 'validtoken' to keep existing test passing (mostly)
             req.isAdmin = true;
        }
        next();
    },
    optionalAuth: (req: any, res: any, next: any) => next(),
};

describe('ActivityPub Security', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use('/ap', createActivityPubRoutes(mockApService, mockDb, mockAuthMiddleware as any));
    });

    test('DELETE /note should require authentication', async () => {
        (mockDb.getApNote as jest.Mock).mockReturnValue({
            note_id: 'http://example.com/note/1',
            note_type: 'release',
            content_id: 123
        });
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 123 });

        const response = await request(app)
            .delete('/ap/note?id=http://example.com/note/1');

        // Desired behavior: 401 Unauthorized
        expect(response.status).toBe(401);
    });

    test('DELETE /note should succeed for authenticated root admin', async () => {
        (mockDb.getApNote as jest.Mock).mockReturnValue({
            note_id: 'http://example.com/note/1',
            note_type: 'release',
            content_id: 123,
            artist_id: 2
        });
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 123, artist_id: 2 });

        (mockApService.broadcastDelete as jest.Mock).mockImplementation(async () => {});

        const response = await request(app)
            .delete('/ap/note?id=http://example.com/note/1')
            .set('Authorization', 'Bearer root');

        expect(response.status).toBe(200);
        expect(mockApService.broadcastDelete).toHaveBeenCalled();
    });

    test('DELETE /note should deny access if artist does not own the note', async () => {
        // Note belongs to Artist 2
        (mockDb.getApNote as jest.Mock).mockReturnValue({
            note_id: 'http://example.com/note/1',
            artist_id: 2,
            note_type: 'release',
            content_id: 123
        });
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 123, artist_id: 2 });

        // Request from Artist 1
        const response = await request(app)
            .delete('/ap/note?id=http://example.com/note/1')
            .set('Authorization', 'Bearer artist1');

        expect(response.status).toBe(403);
    });
});
