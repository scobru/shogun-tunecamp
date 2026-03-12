
const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const tracksWithoutArtist = db.prepare(`
    SELECT t.id, t.title, t.album_id, t.artist_id as track_artist_id, a.artist_id as album_artist_id
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    WHERE t.artist_id IS NULL AND a.artist_id IS NOT NULL
`).all();

console.log('Tracks with NULL artist_id but non-NULL album artist_id:', tracksWithoutArtist.length);
if (tracksWithoutArtist.length > 0) {
    console.log('Sample:', tracksWithoutArtist.slice(0, 5));
}

const tracksWithoutArtistAnywhere = db.prepare(`
    SELECT t.id, t.title, t.album_id, t.artist_id as track_artist_id, a.artist_id as album_artist_id
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    WHERE t.artist_id IS NULL AND a.artist_id IS NULL
`).all();

console.log('Tracks with NULL artist_id AND NULL album artist_id:', tracksWithoutArtistAnywhere.length);

db.close();
