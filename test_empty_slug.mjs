import Database from 'better-sqlite3';
const db = new Database(':memory:');
db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, slug TEXT UNIQUE)');
db.prepare('INSERT INTO test (slug) VALUES (?)').run('');
try {
  let attempt = 0;
  let finalSlug = '';
  const slug = '';
  while (attempt < 5) {
    try {
      db.prepare('INSERT INTO test (slug) VALUES (?)').run(finalSlug);
      console.log('Inserted:', finalSlug);
      break;
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' && e.message.includes('slug')) {
        attempt++;
        finalSlug = `${slug}-${attempt}`;
        console.log('Retry:', finalSlug);
      } else {
        throw e;
      }
    }
  }
} catch (e) {
  console.log('CODE:', e.code);
  console.log('MESSAGE:', e.message);
}
