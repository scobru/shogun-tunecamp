const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

/**
 * MIGRATION SCRIPT: library -> tracks
 * 
 * This script moves files from the legacy 'library' folder to 'tracks'
 * and updates the database paths to match.
 * 
 * Usage: node migrate_library.cjs [musicDir] [dbPath] [--dry-run]
 */

const musicDir = process.argv[2] || '/music';
const dbPath = process.argv[3] === '--dry-run' ? path.join(process.cwd(), 'tunecamp.db') : (process.argv[3] || path.join(process.cwd(), 'tunecamp.db'));
const isDryRun = process.argv.includes('--dry-run');

console.log(`🚀 Starting migration: library -> tracks`);
console.log(`📂 Music Directory: ${musicDir}`);
console.log(`🗄️  Database Path: ${dbPath}`);
console.log(isDryRun ? `🧪 DRY RUN MODE - No changes will be made\n` : `⚠️  PERMANENT CHANGES MODE\n`);

if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database not found at ${dbPath}`);
    process.exit(1);
}

const db = new Database(dbPath);

function migratePath(oldPath) {
    if (!oldPath) return null;
    if (oldPath.startsWith('library/')) {
        return oldPath.replace('library/', 'tracks/');
    }
    return oldPath;
}

async function runMigration() {
    try {
        // 1. Migrate TRACKS
        const tracks = db.prepare("SELECT id, title, file_path, lossless_path FROM tracks WHERE file_path LIKE 'library/%' OR lossless_path LIKE 'library/%'").all();
        console.log(`🔍 Found ${tracks.length} tracks to migrate.`);

        for (const track of tracks) {
            const oldFilePath = track.file_path;
            const newFilePath = migratePath(oldFilePath);
            const oldLosslessPath = track.lossless_path;
            const newLosslessPath = migratePath(oldLosslessPath);

            console.log(`🎵 Migrating track: ${track.title} (ID ${track.id})`);

            if (newFilePath !== oldFilePath) {
                await moveFile(oldFilePath, newFilePath);
            }
            if (newLosslessPath && newLosslessPath !== oldLosslessPath) {
                await moveFile(oldLosslessPath, newLosslessPath);
            }

            if (!isDryRun) {
                db.prepare("UPDATE tracks SET file_path = ?, lossless_path = ? WHERE id = ?").run(newFilePath, newLosslessPath, track.id);
            }
        }

        // 2. Migrate ALBUMS (Covers)
        const albums = db.prepare("SELECT id, title, cover_path FROM albums WHERE cover_path LIKE 'library/%'").all();
        console.log(`\n🔍 Found ${albums.length} albums to migrate.`);

        for (const album of albums) {
            const oldPath = album.cover_path;
            const newPath = migratePath(oldPath);

            console.log(`🖼️  Migrating album cover: ${album.title} (ID ${album.id})`);

            if (newPath !== oldPath) {
                await moveFile(oldPath, newPath);
                if (!isDryRun) {
                    db.prepare("UPDATE albums SET cover_path = ? WHERE id = ?").run(newPath, album.id);
                }
            }
        }

        // 3. Migrate ARTISTS (Photos)
        const artists = db.prepare("SELECT id, name, photo_path FROM artists WHERE photo_path LIKE 'library/%'").all();
        console.log(`\n🔍 Found ${artists.length} artists to migrate.`);

        for (const artist of artists) {
            const oldPath = artist.photo_path;
            const newPath = migratePath(oldPath);

            console.log(`👤 Migrating artist photo: ${artist.name} (ID ${artist.id})`);

            if (newPath !== oldPath) {
                await moveFile(oldPath, newPath);
                if (!isDryRun) {
                    db.prepare("UPDATE artists SET photo_path = ? WHERE id = ?").run(newPath, artist.id);
                }
            }
        }

        console.log(`\n✨ Migration complete!`);
        if (!isDryRun) {
            console.log(`🧹 You can now safely remove the empty 'library' directory if you wish.`);
        }

    } catch (err) {
        console.error(`\n❌ Migration failed:`, err.message);
    } finally {
        db.close();
    }
}

async function moveFile(relOldPath, relNewPath) {
    const fullOldPath = path.join(musicDir, relOldPath);
    const fullNewPath = path.join(musicDir, relNewPath);

    if (isDryRun) {
        console.log(`   [DRY RUN] Would move: ${relOldPath} -> ${relNewPath}`);
        return;
    }

    try {
        if (fs.existsSync(fullOldPath)) {
            await fs.ensureDir(path.dirname(fullNewPath));
            await fs.move(fullOldPath, fullNewPath, { overwrite: true });
            console.log(`   ✅ Moved: ${relOldPath} -> ${relNewPath}`);
        } else {
            console.warn(`   ⚠️  Source not found: ${fullOldPath}`);
        }
    } catch (err) {
        console.error(`   ❌ Failed to move ${relOldPath}:`, err.message);
        throw err;
    }
}

runMigration();
