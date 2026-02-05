import Database from 'better-sqlite3';

const db = new Database('./tunecamp.db');

try {
    const notes = db.prepare('SELECT * FROM ap_notes').all();
    console.log(`Found ${notes.length} ActivityPub notes:`);
    notes.forEach(note => {
        console.log(`  - ${note.note_type}: ${note.content_title} (${note.note_id})`);
    });
} catch (e) {
    console.error('Error:', e.message);
}

db.close();
