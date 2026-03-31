
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('tunecamp.db');
const db = new Database(dbPath);

console.log('--- Database Tables ---');
try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));
} catch (e) {
    console.error('Error listing tables:', e);
}
db.close();
