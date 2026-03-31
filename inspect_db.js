
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('tunecamp.db');
const db = new Database(dbPath);

console.log('--- Database Inspection ---');

const releaseCount = db.prepare('SELECT COUNT(*) as count FROM releases').get().count;
console.log(`Total releases: ${releaseCount}`);

const releases = db.prepare('SELECT id, title, artist_id, owner_id FROM releases LIMIT 10').all();
console.log('Sample releases:', JSON.stringify(releases, null, 2));

const admins = db.prepare('SELECT id, username, artist_id FROM admin').all();
console.log('Admins:', JSON.stringify(admins, null, 2));

const artists = db.prepare('SELECT id, name FROM artists LIMIT 10').all();
console.log('Artists:', JSON.stringify(artists, null, 2));

const albumOwnership = db.prepare('SELECT * FROM album_ownership LIMIT 10').all();
console.log('Album Ownership sample:', JSON.stringify(albumOwnership, null, 2));

db.close();
