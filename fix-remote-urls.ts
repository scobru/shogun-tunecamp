import sqlite3 from 'better-sqlite3';
import path from 'path';

// Define the database path (adjust if necessary)
const dbPath = path.resolve('data', 'music.db');
const db = sqlite3(dbPath);

async function fixRemoteUrls() {
    console.log(`📡 Connecting to SQLite DB: ${dbPath}`);
    
    // Find tracks with broken or suspected bad URLs
    const query = db.prepare(`
        SELECT id, ap_id, stream_url 
        FROM remote_content 
        WHERE stream_url LIKE '%/library/tracks/%' 
           OR stream_url LIKE '%/api/v1/listen/%'
    `);
    
    const tracks = query.all() as { id: number, ap_id: string, stream_url: string }[];
    console.log(`🔍 Found ${tracks.length} tracks with potentially broken stream_urls.`);

    let fixedCount = 0;
    
    for (const track of tracks) {
        // Only target Funkwhale URLs using standard library paths or the faulty migration ID
        if (!track.stream_url.includes('/library/tracks/') && track.stream_url.match(/\/api\/v1\/listen\/\d+\/$/) === null) {
            continue; // Skip valid UUId URLs
        }

        try {
            console.log(`Fetching AP data for track ID ${track.id}: ${track.ap_id}`);
            const response = await fetch(track.ap_id, {
                headers: { "Accept": "application/activity+json" }
            });
            
            if (!response.ok) {
                console.warn(`⚠️ Failed to fetch AP data for ${track.ap_id}: ${response.status}`);
                continue;
            }
            
            const apData = await response.json();
            
            // Extract correct stream URL
            let newStreamUrl = null;
            if (Array.isArray(apData.url)) {
                const audioLink = apData.url.find((u: any) => u?.mediaType?.startsWith('audio/'));
                if (audioLink) {
                    newStreamUrl = audioLink.href || audioLink.url;
                }
            } else if (apData.url && typeof apData.url === 'object' && apData.url.mediaType?.startsWith('audio/')) {
                newStreamUrl = apData.url.href || apData.url.url;
            }

            if (!newStreamUrl && Array.isArray(apData.attachment)) {
                const attachmentLink = apData.attachment.find((u: any) => u?.mediaType?.startsWith('audio/'));
                if (attachmentLink) {
                    newStreamUrl = attachmentLink.href || attachmentLink.url;
                }
            }
            
            if (newStreamUrl) {
                db.prepare(`UPDATE remote_content SET stream_url = ? WHERE id = ?`).run(newStreamUrl, track.id);
                console.log(`✅ Fixed track ${track.id}: ${newStreamUrl}`);
                fixedCount++;
            } else {
                console.warn(`⚠️ No audio stream found in AP data for ${track.ap_id}`);
            }
            
            // Sleep for 100ms to avoid hammering remote nodes
            await new Promise(r => setTimeout(r, 100));
            
        } catch (err: any) {
            console.error(`❌ Error processing track ${track.id}: ${err.message}`);
        }
    }
    
    console.log(`\n🎉 Finished! Fixed ${fixedCount} stream_urls.`);
}

fixRemoteUrls().catch(console.error);
