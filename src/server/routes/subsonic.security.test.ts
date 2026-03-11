import { createDatabase } from '../database.js';
import { createAuthService } from '../auth.js';
import { createSubsonicRouter } from './subsonic.js';
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs-extra';

describe('Subsonic Security', () => {
    let database: any;
    let authService: any;
    let app: any;
    const dbPath = './test-subsonic-security.db';

    beforeAll(async () => {
        database = createDatabase(dbPath);
        authService = createAuthService(database.db, 'test-secret');
        await authService.init();

        // Create a dummy user
        // 'password' in bcrypt: b0.Z.T1/R1S1y6G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G (abbreviated/mock)
        database.db.prepare("INSERT OR IGNORE INTO admin (username, password_hash) VALUES (?, ?)").run('user', '$2b0.Z.T1/R1S1y6G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G');

        app = express();
        app.use(express.json());
        app.use('/rest', createSubsonicRouter({
            db: database,
            auth: authService,
            musicDir: './music'
        }));
    });

    afterAll(async () => {
        if (database && database.db) {
            database.db.close();
        }
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    it('should handle multiple id parameters gracefully in getMusicDirectory (DoS prevention)', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/getMusicDirectory.view?${authQuery}&id=ar_1&id=ar_2`);

        // Should not crash and should probably return 404 or process the first ID
        expect(response.status).toBe(200);
    });

    it('should handle multiple id parameters gracefully in getCoverArt', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/getCoverArt.view?${authQuery}&id=ar_1&id=ar_2`);
        expect(response.status).toBe(200);
    });

    it('should handle multiple f parameters gracefully (JSON/XML detection)', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/ping.view?${authQuery}&f=json&f=xml`);

        expect(response.status).toBe(200);
        // Should either be JSON or XML, but not crash
        const isJson = response.headers['content-type']?.includes('application/json');
        const isXml = response.headers['content-type']?.includes('text/xml');
        expect(isJson || isXml).toBe(true);
    });

    it('should handle multiple authentication parameters gracefully', async () => {
        // Multiple 'u' parameters could cause issues if not handled
        const response = await request(app)
            .get(`/rest/ping.view?u=user&u=attacker&p=password&v=1.16.1&c=test`);

        expect(response.status).toBe(200);
    });
});
