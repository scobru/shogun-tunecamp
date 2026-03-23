const Database = require("better-sqlite3");
const db = new Database("data/tunecamp.db");

try {
    const stmt = db.prepare(`
                SELECT 
                    t.id,
                    rt.title as title,
                    t.album_id,
                    r.title as album_title,
                    r.download as album_download,
                    r.visibility as album_visibility,
                    r.price as album_price,
                    r.artist_id as artist_id,
                    rt.artist_name as artist_name,
                    ar.wallet_address as walletAddress,
                    r.owner_id as owner_id,
                    rt.track_num as track_num,
                    rt.duration as duration,
                    t.file_path,
                    t.format,
                    t.bitrate,
                    t.sample_rate,
                    rt.price as price,
                    rt.currency as currency,
                    t.waveform,
                    t.url,
                    t.service,
                    t.external_artwork,
                    t.lyrics,
                    t.created_at
                FROM release_tracks rt
                JOIN releases r ON rt.release_id = r.id
                LEFT JOIN tracks t ON rt.track_id = t.id
                LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE rt.release_id = ?
                ORDER BY rt.track_num
    `);
    console.log("Statement compiled successfully.");
} catch (e) {
    console.error("Error compiling tracks query:", e.message);
}

try {
    const stmt2 = db.prepare(`
                SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE r.id = ?
    `);
    console.log("Statement 2 compiled successfully.");
} catch (e) {
    console.error("Error compiling release query:", e.message);
}

