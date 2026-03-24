
import { createDatabase } from "./database.js";
import { createActivityPubService } from "./activitypub.js";
import { createFedify } from "./fedify.js";
import { loadConfig } from "./config.js";
import path from "path";
import fs from "fs-extra";

async function main() {
    const config = loadConfig();
    const dbPath = config.dbPath;

    console.log(`📂 DB Path: ${dbPath}`);
    if (!fs.existsSync(dbPath)) {
        console.error("❌ DB not found!");
        return;
    }

    const db = createDatabase(dbPath);
    const federation = createFedify(db, config);
    const apService = createActivityPubService(db, config, federation);

    console.log("✅ Services initialized");

    const artists = db.getArtists();
    console.log(`found ${artists.length} artists`);

    const artist = artists.find(a => a.slug === 'homologo') || artists[0];
    if (!artist) {
        console.error("❌ No artist found");
        return;
    }

    console.log(`👤 Testing with artist: ${artist.name} (${artist.slug})`);

    const followers = db.getFollowers(artist.id);
    console.log(`👥 Followers: ${followers.length}`);

    if (followers.length === 0) {
        console.warn("⚠️ No followers to test broadcast with.");
    } else {
        followers.forEach(f => console.log(`   - ${f.actor_uri} (Inbox: ${f.inbox_uri})`));
    }

    // Create a dummy note
    const testActivity = {
        "@context": "https://www.w3.org/ns/activitystreams",
        id: `${apService.getBaseUrl()}/debug/${Date.now()}`,
        type: "Create",
        actor: `${apService.getBaseUrl()}/api/ap/users/${artist.slug}`,
        object: {
            id: `${apService.getBaseUrl()}/debug/note/${Date.now()}`,
            type: "Note",
            attributedTo: `${apService.getBaseUrl()}/api/ap/users/${artist.slug}`,
            content: "<p>Debug message from TuneCamp console</p>",
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            published: new Date().toISOString()
        }
    };

    if (followers.length > 0) {
        const follower = followers[0];
        console.log(`🚀 Sending test activity to ${follower.inbox_uri}...`);
        try {
            await apService.sendActivity(artist, follower.inbox_uri, testActivity);
            console.log("✅ Send completed (check previous logs for 200 OK)");
        } catch (e) {
            console.error("❌ Send failed:", e);
        }
    }
}

main().catch(console.error);
