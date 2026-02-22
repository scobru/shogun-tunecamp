const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('d:/shogun-2/tunecamp/tunecamp.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

if (tables.some(t => t.name === 'tracks')) {
    const tracks = db.prepare('SELECT id, title, file_path, lossless_path, format FROM tracks LIMIT 20').all();
    console.log(JSON.stringify(tracks, null, 2));
} else {
    console.log('Tracks table NOT FOUND');
}
db.close();
