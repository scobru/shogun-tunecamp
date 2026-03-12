
import { createDatabase } from '../database.js';
import { createAuthService } from '../auth.js';
import { createSubsonicRouter } from './subsonic.js';
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs-extra';
import path from 'path';

describe('Subsonic Artist Retrieval Repro', () => {
    let database: any;
    let authService: any;
    let app: any;
    const dbPath = './repro-subsonic-artist.db';

    beforeAll(async () => {
        database = createDatabase(dbPath);
        authService = createAuthService(database.db, 'test-secret');
        await authService.init();

        database.db.prepare("INSERT OR IGNORE INTO admin (username, password_hash) VALUES (?, ?)").run('user', '$2b$10$vI8.Z.T1/R1S1y6G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G');

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
        if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
        if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    });

    it('should return artist info for a track that only has an album artist', async () => {
        const artistId = database.createArtist('The Real Artist');
        const albumId = database.createAlbum({
            title: 'The Great Album',
            slug: 'the-great-album',
            artist_id: artistId,
            visibility: 'public'
        } as any);
        
        // Track with NULL artist_id
        const trackId = database.createTrack({
            title: 'Hidden Track',
            album_id: albumId,
            artist_id: null,
            track_num: 1,
            duration: 100,
            file_path: 'hidden.mp3'
        } as any);

        const authQuery = 'u=user&p=password&v=1.16.1&c=test&f=json';
        
        const response = await request(app)
            .get(`/rest/getSong.view?${authQuery}&id=tr_${trackId}`);

        expect(response.status).toBe(200);
        const song = response.body['subsonic-response'].song;
        console.log('Returned song:', song);
        
        // This is expected to FAIL before the fix
        expect(song.artist).toBe('The Real Artist');
        expect(song.artistId).toBe(`ar_${artistId}`);
    });
});
