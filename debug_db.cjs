
const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

try {
    const track = db.prepare('SELECT id, title, artist_id, album_id FROM tracks WHERE id = 14').get();
    console.log('TRACK_INFO:', JSON.stringify(track));

    if (track && track.album_id) {
        const album = db.prepare('SELECT id, title, visibility FROM albums WHERE id = ?').get(track.album_id);
        console.log('ALBUM_INFO:', JSON.stringify(album));
    }

    const user = db.prepare('SELECT id, username, artist_id, role, gun_pub FROM admin WHERE username = ?').get('homologo');
    console.log('USER_INFO:', JSON.stringify(user));

    const allAdmins = db.prepare('SELECT id, username, role FROM admin').all();
    console.log('ALL_ADMINS:', JSON.stringify(allAdmins));

} catch (e) {
    console.error('ERROR:', e.message);
}
