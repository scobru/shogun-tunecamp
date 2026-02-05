import Database from 'better-sqlite3';

const db = new Database('./tunecamp.db');

console.log('🔧 Checking for ap_notes table...');

// Check if table exists
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name='ap_notes'
`).get();

if (tableExists) {
    console.log('✅ Table ap_notes already exists');
} else {
    console.log('📦 Creating ap_notes table...');

    db.exec(`
    CREATE TABLE ap_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      note_id TEXT NOT NULL UNIQUE,
      note_type TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      content_slug TEXT NOT NULL,
      content_title TEXT NOT NULL,
      published_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    
    CREATE INDEX idx_ap_notes_artist ON ap_notes(artist_id);
  `);

    console.log('✅ Table ap_notes created successfully');
}

// Verify table structure
const columns = db.prepare(`PRAGMA table_info(ap_notes)`).all();
console.log('\n📋 Table structure:');
columns.forEach(col => {
    console.log(`  - ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
});

// Check indices
const indices = db.prepare(`PRAGMA index_list(ap_notes)`).all();
console.log('\n🔍 Indices:');
if (indices.length === 0) {
    console.log('  (none)');
} else {
    indices.forEach(idx => {
        console.log(`  - ${idx.name}`);
    });
}

db.close();
console.log('\n✅ Migration complete!');
