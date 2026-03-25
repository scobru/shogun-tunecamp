import { createDatabase } from "./database.js";
import path from "path";
import fs from "fs-extra";

async function testFallback() {
    const dbPath = "./tunecamp.db";
    const musicDir = "./music";

    if (!await fs.pathExists(dbPath)) {
        console.error("❌ Database not found. Run this on a machine with the tunecamp.db file.");
        return;
    }

    const database = createDatabase(dbPath);
    
    console.log("🔍 Checking for tracks with external_artwork...");
    const tracksWithArtwork = database.db.prepare("SELECT * FROM tracks WHERE external_artwork IS NOT NULL LIMIT 5").all() as any[];
    
    if (tracksWithArtwork.length === 0) {
        console.log("ℹ️ No tracks with external_artwork found to test with.");
        return;
    }

    for (const track of tracksWithArtwork) {
        console.log(`\nTesting fallback for Album ID: ${track.album_id} (Track: ${track.title})`);
        
        // Simulating the logic in albums.ts
        const album = database.getRelease(track.album_id) || database.getAlbum(track.album_id);
        
        if (!album) {
            console.log("❌ Album not found in DB.");
            continue;
        }

        console.log(`Album Title: ${album.title}`);
        console.log(`Local Cover Path: ${album.cover_path || "NULL"}`);

        const localFileExists = album.cover_path ? await fs.pathExists(path.join(musicDir, album.cover_path)) : false;
        console.log(`Local File Exists: ${localFileExists}`);

        if (!album.cover_path || !localFileExists) {
            console.log("🚀 Testing Fallback Logic...");
            
            // Fix: Release type doesn't have is_release property because it is a release by definition.
            // Album type has is_release to distinguish from library albums.
            const isRelease = ("is_release" in album) ? (album as any).is_release : true;
            const tracks = isRelease ? database.getTracksByReleaseId(album.id) : database.getTracks(album.id);
            const externalCover = tracks.find(t => t.external_artwork)?.external_artwork;
            
            if (externalCover) {
                console.log(`✅ SUCCESS: Found external fallback: ${externalCover}`);
            } else {
                console.log("❌ FAIL: No external artwork found in tracks (Wait, but we selected this track precisely because it had one!)");
            }
        } else {
            console.log("ℹ️ Album already has a local cover. Fallback would not be triggered.");
        }
    }
}

testFallback().catch(console.error);
