const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'tunecamp.db');
const db = new Database(dbPath);

console.log("🔍 Checking Album ID 10 (Nulla che vale aspettare)...");

const album = db.prepare("SELECT * FROM albums WHERE id = 10").get();
if (album) {
    console.log("Album:", JSON.stringify(album, null, 2));

    if (album.artist_id === null) {
        console.log("⚠️ artist_id is NULL as expected from logs.");

        // Let's see if we can find any tracks for this album and what artist they think they belong to
        const tracks = db.prepare("SELECT * FROM tracks WHERE album_id = 10").all();
        console.log(`Found ${tracks.length} tracks.`);
        tracks.forEach(t => {
            console.log(` - Track: ${t.title}, artist_id: ${t.artist_id}`);
        });

        // Search for an artist that might match
        const artists = db.prepare("SELECT * FROM artists").all();
        console.log("\nAvailable Artists:");
        artists.forEach(a => {
            console.log(` - ${a.id}: ${a.name}`);
        });
    } else {
        console.log("✅ artist_id is NOT NULL:", album.artist_id);
    }
} else {
    console.log("❌ Album ID 10 not found.");
}

db.close();
