const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'tunecamp.db');
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables in database:", tables.map(t => t.name).join(", "));

db.close();
