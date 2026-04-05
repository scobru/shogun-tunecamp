// Verification script for case-insensitive artist matching
import { createDatabase } from "./dist/server/database.js";
import path from "path";
import process from "process";

async function verify() {
    const dbPath = path.join(process.cwd(), "tunecamp.db");
    const dbService = createDatabase(dbPath);

    console.log("--- Verifying Case-Insensitive Artist Match ---");
    
    // 1. Test getArtistByName
    const recondite = dbService.getArtistBySlug("recondite");
    if (!recondite) {
        console.error("Artist 'recondite' not found in database. Skipping test.");
        return;
    }
    console.log(`Found artist: ${recondite.name} (ID: ${recondite.id})`);

    const resultLower = dbService.getArtistByName("recondite");
    const resultUpper = dbService.getArtistByName("RECONDITE");
    
    console.log(`getArtistByName("recondite"): ${resultLower ? resultLower.name : "MISSING"} (ID: ${resultLower ? resultLower.id : "N/A"})`);
    console.log(`getArtistByName("RECONDITE"): ${resultUpper ? resultUpper.name : "MISSING"} (ID: ${resultUpper ? resultUpper.id : "N/A"})`);

    if (resultLower && resultUpper && resultLower.id === resultUpper.id) {
        console.log("✅ getArtistByName is case-insensitive.");
    } else {
        console.error("❌ getArtistByName is still case-sensitive!");
    }

    // 2. Test repairArtistLinks
    console.log("\n--- Verifying repairArtistLinks logic ---");
    try {
        const repairRes = dbService.repairArtistLinks(recondite.id, "RECONDITE");
        console.log(`Repair Results for "RECONDITE": Tracks ${repairRes.tracks}, Albums ${repairRes.albums}`);
        console.log("✅ repairArtistLinks logic executed.");
    } catch (e) {
        console.error("❌ repairArtistLinks failed", e);
    }
}

verify().catch(console.error);
