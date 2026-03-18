const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, slug TEXT UNIQUE)');
db.prepare('INSERT INTO test (slug) VALUES (?)').run('abc');
try {
  db.prepare('INSERT INTO test (slug) VALUES (?)').run('abc');
} catch (e) {
  console.log('CODE:', e.code);
  console.log('MESSAGE:', e.message);
}
