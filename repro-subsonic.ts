
import { createDatabase } from './src/server/database.js';
import { createAuthService } from './src/server/auth.js';
import { createSubsonicRouter } from './src/server/routes/subsonic.js';
import express from 'express';
import request from 'supertest';
import fs from 'fs-extra';

async function repro() {
    const dbPath = './repro-subsonic.db';
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    
    const database = createDatabase(dbPath);
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

    const artistId = database.createArtist('Test Artist');
    
    // Create a library album
    const albumId = database.createAlbum({
        title: 'Library Album',
        slug: 'library-album',
        artist_id: artistId,
        visibility: 'public',
        is_release: false
    } as any);
    
    // Create a release (the new way)
    const releaseId = database.createRelease({
        title: 'Official Release',
        slug: 'official-release',
        artist_id: artistId,
        visibility: 'public',
    } as any);

    console.log('Artist ID:', artistId);
    console.log('Album ID:', albumId);
    console.log('Release ID:', releaseId);

    const authQuery = 'u=user&p=password&v=1.16.1&c=test&f=json';

    console.log('\n--- Testing getMusicDirectory for artist ---');
    const resDir = await request(app).get(`/rest/getMusicDirectory.view?${authQuery}&id=ar_${artistId}`);
    const children = resDir.body['subsonic-response'].directory.child || [];
    console.log('Children found:', children.map((c: any) => c.name));

    if (children.length < 2) {
        console.log('❌ FAILURE: Expected 2 children (Library Album and Official Release), but got ' + children.length);
    } else {
        console.log('✅ SUCCESS: Both found');
    }

    console.log('\n--- Testing getAlbumList2 newest ---');
    const resList = await request(app).get(`/rest/getAlbumList2.view?${authQuery}&type=newest`);
    const albums = resList.body['subsonic-response'].albumList2.album || [];
    console.log('Albums found:', albums.map((a: any) => a.name));

    if (albums.length < 2) {
        console.log('❌ FAILURE: Expected 2 albums in list, but got ' + albums.length);
    } else {
        console.log('✅ SUCCESS: Both found');
    }

    database.db.close();
    fs.unlinkSync(dbPath);
}

repro().catch(console.error);
