import { createDatabase } from './src/server/database.ts';
import path from 'path';

async function test() {
    console.log("Testing database initialization...");
    try {
        const db = createDatabase('tunecamp.db');
        const artists = db.getArtists();
        console.log(`Successfully initialized! Found ${artists.length} artists.`);
        
        const albums = db.getLibraryAlbums();
        console.log(`Found ${albums.length} albums.`);
        
        const tracks = db.getTracks();
        console.log(`Found ${tracks.length} tracks.`);
        
        console.log("Test PASSED");
    } catch (error) {
        console.error("Test FAILED:", error);
        process.exit(1);
    }
}

test();
