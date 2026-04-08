import Database from 'better-sqlite3';
const db = new Database('d:/shogun-2/tunecamp/tunecamp.db');
const torrents = db.prepare('SELECT * FROM torrents').all();
console.log('Torrents:', JSON.stringify(torrents, null, 2));
db.close();
