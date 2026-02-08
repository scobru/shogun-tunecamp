const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * REPAIR SCRIPT FOR TUNECAMP DATABASE PATHS
 * 
 * Usage: node repair_paths.cjs <musicDir>
 * Example: node repair_paths.cjs /music
 */

const dbPath = path.join(__dirname, 'tunecamp.db');
const targetMusicDir = process.argv[2];

if (!targetMusicDir) {
    console.error("Usage: node repair_paths.cjs <targetMusicDir>");
    console.error("Example: node repair_paths.cjs /music");
    process.exit(1);
}

if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}`);
    process.exit(1);
}

const db = new Database(dbPath);

function normalizePath(p, musicDir) {
    if (!p) return null;

    // Convert Windows backslashes to forward slashes
    let normalized = p.replace(/\\/g, '/');

    // If it's already relative (doesn't start with / or C:), return as is
    if (!path.isAbsolute(normalized) && !normalized.includes(':')) {
        return normalized;
    }

    // Try to extract relative part if it contains the musicDir or common patterns
    // e.g. "D:/shogun-2/tunecamp/music/foo" -> "foo"
    // e.g. "/music/foo" -> "foo"

    const musicDirPattern = musicDir.replace(/\\/g, '/').replace(/\/$/, '');
    if (normalized.startsWith(musicDirPattern)) {
        normalized = normalized.substring(musicDirPattern.length);
    }

    // Remove leading slash
    normalized = normalized.replace(/^\//, '');

    return normalized;
}

try {
    const tracks = db.prepare("SELECT id, file_path FROM tracks").all();
    console.log(`Checking ${tracks.length} tracks...`);

    const updateTrack = db.prepare("UPDATE tracks SET file_path = ? WHERE id = ?");
    let trackFixed = 0;

    db.transaction(() => {
        for (const track of tracks) {
            const fixed = normalizePath(track.file_path, targetMusicDir);
            if (fixed !== track.file_path) {
                updateTrack.run(fixed, track.id);
                trackFixed++;
            }
        }
    })();
    console.log(`Fixed ${trackFixed} track paths.`);

    const albums = db.prepare("SELECT id, cover_path FROM albums").all();
    console.log(`Checking ${albums.length} albums...`);

    const updateAlbum = db.prepare("UPDATE albums SET cover_path = ? WHERE id = ?");
    let albumFixed = 0;

    db.transaction(() => {
        for (const album of albums) {
            const fixed = normalizePath(album.cover_path, targetMusicDir);
            if (fixed !== album.cover_path) {
                updateAlbum.run(fixed, album.id);
                albumFixed++;
            }
        }
    })();
    console.log(`Fixed ${albumFixed} album cover paths.`);

    const artists = db.prepare("SELECT id, photo_path FROM artists").all();
    console.log(`Checking ${artists.length} artists...`);

    const updateArtist = db.prepare("UPDATE artists SET photo_path = ? WHERE id = ?");
    let artistFixed = 0;

    db.transaction(() => {
        for (const artist of artists) {
            const fixed = normalizePath(artist.photo_path, targetMusicDir);
            if (fixed !== artist.photo_path) {
                updateArtist.run(fixed, artist.id);
                artistFixed++;
            }
        }
    })();
    console.log(`Fixed ${artistFixed} artist photo paths.`);

    console.log("\nRepair complete!");
    console.log("Restart your TuneCamp server to apply changes.");

} catch (e) {
    console.error("Error during repair:", e.message);
} finally {
    db.close();
}
