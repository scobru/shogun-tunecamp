import express from 'express';
import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import { createBackupRoutes } from './backup.js';
import type { DatabaseService } from '../database.js';
import type { ServerConfig } from '../config.js';
import { jest } from '@jest/globals';

// Mocks
const mockDatabase = {
    db: {
        prepare: jest.fn().mockReturnValue({ run: jest.fn() }),
        close: jest.fn(),
    },
    getArtists: jest.fn().mockReturnValue([]),
    getSetting: jest.fn(),
} as unknown as DatabaseService;

const mockConfig = {
    dbPath: 'test.db',
    musicDir: 'test_music',
} as unknown as ServerConfig;

const mockRestartFn = jest.fn();

describe('Backup Routes (Chunked Upload)', () => {
    let app: express.Express;
    const uploadId = 'test_upload_123';
    const tempDir = 'uploads';

    beforeAll(async () => {
        await fs.ensureDir(tempDir);
        // Create dummy files for restore target
        await fs.ensureDir(mockConfig.musicDir);
        await fs.writeFile(mockConfig.dbPath, 'dummy db content');
    });

    afterAll(async () => {
        await fs.remove(tempDir);
        await fs.remove(mockConfig.musicDir);
        await fs.remove(mockConfig.dbPath);
        if (fs.existsSync('test.db.backup')) fs.unlinkSync('test.db.backup');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json()); // needed for /restore-chunked body

        // Mock auth middleware (req.artistId undefined = root admin)
        app.use((req: any, res, next) => {
            req.artistId = undefined;
            next();
        });

        const router = createBackupRoutes(mockDatabase, mockConfig, mockRestartFn);
        app.use('/backup', router);
    });

    test('should upload chunks and assemble file', async () => {
        const chunk1 = Buffer.from('Hello ');
        const chunk2 = Buffer.from('World!');

        // Upload Chunk 1
        const res1 = await request(app)
            .post('/backup/chunk')
            .field('uploadId', uploadId)
            .field('chunkIndex', 0)
            .attach('chunk', chunk1, 'chunk1.bin');

        expect(res1.status).toBe(200);
        expect(res1.body.success).toBe(true);

        // Verify temp file exists and has content
        const tempPath = path.join(tempDir, `temp_${uploadId}`);
        expect(await fs.pathExists(tempPath)).toBe(true);
        expect((await fs.readFile(tempPath)).toString()).toBe('Hello ');

        // Upload Chunk 2
        const res2 = await request(app)
            .post('/backup/chunk')
            .field('uploadId', uploadId)
            .field('chunkIndex', 1)
            .attach('chunk', chunk2, 'chunk2.bin');

        expect(res2.status).toBe(200);

        // Verify content appended
        expect((await fs.readFile(tempPath)).toString()).toBe('Hello World!');
    });

    test('should finalize chunked upload', async () => {
        // Prepare a temp file as if chunks were uploaded
        const tempPath = path.join(tempDir, `temp_${uploadId}`);
        await fs.writeFile(tempPath, 'Dummy Zip Content');

        // Call restore-chunked
        // Note: 'performRestore' will fail because 'Dummy Zip Content' is not a valid zip
        // But we expect the endpoint to return 200 OK immediately.

        const res = await request(app)
            .post('/backup/restore-chunked')
            .send({ uploadId });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('Restore started');

        // Check file was processed (renamed from temp path)
        // Note: The final file (backup_...) might be deleted immediately by performRestore
        // if it fails validation (which it will, as it's dummy content), so we only check temp is gone.
        expect(await fs.pathExists(tempPath)).toBe(false);
    });
});
