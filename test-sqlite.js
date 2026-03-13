import Database from 'better-sqlite3';

try {
    const db = new Database(':memory:');
    console.log('✅ Successfully created memory database');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    console.log('✅ Successfully executed SQL');
    db.close();
} catch (e) {
    console.error('❌ Failed:', e);
}
