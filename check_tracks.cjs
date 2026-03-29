
const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

try {
    console.log('--- TRACKS for homologo ---');
    const tracks = db.prepare("SELECT id, title, album_id, artist_name, file_path, format FROM tracks WHERE artist_name LIKE '%homologo%'").all();
    console.log(JSON.stringify(tracks, null, 2));

    console.log('\n--- ALBUMS for homologo ---');
    const artist = db.prepare("SELECT id FROM artists WHERE name LIKE '%homologo%'").get();
    if (artist) {
        const albums = db.prepare("SELECT id, title, visibility, is_release FROM albums WHERE artist_id = ?").all(artist.id);
        console.log(JSON.stringify(albums, null, 2));
    } else {
        console.log('Artist not found');
    }

} catch (e) {
    console.error('ERROR:', e.message);
}
