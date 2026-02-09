const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('tunecamp.db');
console.log(`Open DB: ${dbPath}`);
const db = new Database(dbPath);

const rows = db.prepare("SELECT id, title, cover_path FROM albums LIMIT 10").all();
console.log(JSON.stringify(rows, null, 2));
