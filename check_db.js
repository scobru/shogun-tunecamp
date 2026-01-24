
import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');

const tracks = db.prepare('SELECT id, title, duration, file_path FROM tracks LIMIT 10').all();
console.log(tracks);
