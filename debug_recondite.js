import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('tunecamp.db');
const db = new Database(dbPath);

console.log('--- Recondite Debugging ---');

const artist = db.prepare('SELECT * FROM artists WHERE name LIKE "Recondite%"').get();
console.log('Artist:', JSON.stringify(artist, null, 2));

if (artist) {
    const tracks = db.prepare('SELECT * FROM tracks WHERE artist_id = ?').all(artist.id);
    console.log(`Tracks for Artist ID ${artist.id}:`, JSON.stringify(tracks, null, 2));

    const albums = db.prepare('SELECT * FROM albums WHERE artist_id = ?').all(artist.id);
    console.log(`Albums for Artist ID ${artist.id}:`, JSON.stringify(albums, null, 2));

    const releases = db.prepare('SELECT * FROM releases WHERE artist_id = ?').all(artist.id);
    console.log(`Releases for Artist ID ${artist.id}:`, JSON.stringify(releases, null, 2));
}

db.close();
