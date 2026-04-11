import sqlite3 from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('tunecamp.db');
const db = new sqlite3(dbPath);
const count = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
console.log(`Tracks in ${dbPath}: ${count.count}`);

if (count.count > 0) {
    const sample = db.prepare("SELECT file_path FROM tracks LIMIT 5").all();
    console.log("Sample paths:", JSON.stringify(sample, null, 2));
}
db.close();
