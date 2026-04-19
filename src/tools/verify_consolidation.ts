import { createDatabase } from "../server/database.js";
import { Scanner } from "../server/scanner.js";
import path from "path";
import fs from "fs-extra";

async function test() {
    const dbPath = "tunecamp.db"; 
    const musicDir = path.resolve("music");
    
    const db = createDatabase(dbPath);
    const scanner = new Scanner(db);
    
    console.log("Creating dummy track with missing file...");
    const trackId = db.createTrack({
        title: "Missing Track Test",
        album_id: null,
        artist_id: null,
        owner_id: 1,
        track_num: 1,
        duration: 100,
        file_path: "missing/file/path.mp3",
        format: "mp3",
        bitrate: 320,
        sample_rate: 44100
    });
    
    console.log(`Track created with ID: ${trackId}`);
    
    const trackBefore = db.getTrack(trackId);
    console.log("Track before consolidation:", trackBefore ? "Exists" : "Deleted");
    
    console.log("Running consolidateFiles...");
    const result = await scanner.consolidateFiles(musicDir);
    console.log("Consolidation result:", result);
    
    const trackAfter = db.getTrack(trackId);
    console.log("Track after consolidation:", trackAfter ? "Exists" : "Deleted");
    
    if (!trackAfter && result.deleted > 0) {
        console.log("✅ SUCCESS: Missing track was deleted.");
    } else {
        console.log("❌ FAILURE: Missing track was NOT deleted.");
    }
}

test().catch(console.error);
