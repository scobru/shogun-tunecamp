
import { createDatabase } from './dist/server/database.js';
import { createAuthService } from './dist/server/auth.js';
import { createSubsonicRouter } from './dist/server/routes/subsonic.js';
import express from 'express';
import request from 'supertest';
import fs from 'fs-extra';

async function verifyCoverArt() {
    const dbPath = './verify-cover-art.db';
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    
    let database;
    try {
        database = createDatabase(dbPath);
        const authService = createAuthService(database.db, 'test-secret');
        await authService.init();

        // Create a dummy user
        database.db.prepare("INSERT OR IGNORE INTO admin (username, password_hash) VALUES (?, ?)").run('user', '$2b$10$vI8.Z.T1/R1S1y6G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G'); // 'password' in bcrypt

        const app = express();
        app.use('/rest', createSubsonicRouter({
            db: database,
            auth: authService,
            musicDir: './music'
        }));

        const artistId = database.createArtist('Art Artist');
        
        // 1. Album with local cover
        const localAlbumId = database.createAlbum({
            title: 'Local Album',
            slug: 'local-album',
            artist_id: artistId,
            cover_path: 'covers/local.jpg',
            is_release: true
        });

        // 2. Album with NO local cover, but a track with external_artwork
        const externalAlbumId = database.createAlbum({
            title: 'External Album',
            slug: 'external-album',
            artist_id: artistId,
            cover_path: null,
            is_release: true
        });
        
        const trackId = database.createTrack({
            title: 'External Track',
            album_id: externalAlbumId,
            artist_id: artistId,
            external_artwork: 'https://example.com/cover.jpg',
            file_path: 'test.mp3'
        });

        console.log('--- Setup Complete ---');

        const authQuery = 'u=user&p=password&v=1.16.1&c=test';

        console.log('\n--- Testing local album cover (expecting 404 because file doesn\'t exist) ---');
        const resLocal = await request(app).get(`/rest/getCoverArt.view?${authQuery}&id=al_${localAlbumId}`);
        console.log('Status (local):', resLocal.status);

        console.log('\n--- Testing external album cover (expecting Redirect) ---');
        const resExt = await request(app)
            .get(`/rest/getCoverArt.view?${authQuery}&id=al_${externalAlbumId}`);
        
        console.log('Status (external):', resExt.status);
        console.log('Location:', resExt.header.location);

        if (resExt.status === 302 && resExt.header.location === 'https://example.com/cover.jpg') {
            console.log('✅ SUCCESS: Album correctly redirected to track\'s external artwork!');
        } else {
            console.log('❌ FAILURE: Album did not redirect correctly.');
        }

        console.log('\n--- Testing track cover fallback (expecting Redirect) ---');
        const resTrack = await request(app)
            .get(`/rest/getCoverArt.view?${authQuery}&id=tr_${trackId}`);
        
        console.log('Status (track):', resTrack.status);
        if (resTrack.status === 302 && resTrack.header.location === 'https://example.com/cover.jpg') {
            console.log('✅ SUCCESS: Track correctly redirected to its own external artwork!');
        } else {
            console.log('❌ FAILURE: Track did not redirect correctly.');
        }

    } finally {
        if (database && database.db) database.db.close();
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
}

verifyCoverArt().catch(e => {
    console.error('Test Execution Failed:', e);
});
