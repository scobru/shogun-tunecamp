const Database = require('better-sqlite3');
const db = new Database('./data/tunecamp.db');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='releases'").get();
console.log(schema);
