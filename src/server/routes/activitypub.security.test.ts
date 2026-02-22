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
        if (!req.headers.authorization) {
            return res.status(401).json({ error: "No token provided" });
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

    test('DELETE /note should succeed for authenticated admin', async () => {
        (mockDb.getApNote as jest.Mock).mockReturnValue({
            note_id: 'http://example.com/note/1',
            note_type: 'release',
            content_id: 123
        });
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 123 });

        // Fix for TS error: explicit cast or simple return
        (mockApService.broadcastDelete as jest.Mock).mockImplementation(async () => {});

        const response = await request(app)
            .delete('/ap/note?id=http://example.com/note/1')
            .set('Authorization', 'Bearer validtoken');

        expect(response.status).toBe(200);
        expect(mockApService.broadcastDelete).toHaveBeenCalled();
    });
});
