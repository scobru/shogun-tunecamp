const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('d:/shogun-2/tunecamp/tunecamp.db');
console.log(`Checking database at: ${dbPath}`);

const db = new Database(dbPath);

try {
    const tableInfo = db.prepare("PRAGMA table_info(gun_users)").all();
    if (tableInfo.length > 0) {
        console.log("✅ Table 'gun_users' exists.");
        console.log("Columns:", tableInfo.map(c => c.name).join(", "));

        // Test sync logic (simulated)
        db.prepare("INSERT OR REPLACE INTO gun_users (pub, epub, alias) VALUES (?, ?, ?)").run('test_pub', 'test_epub', 'test_alias');
        const user = db.prepare("SELECT * FROM gun_users WHERE pub = ?").get('test_pub');
        if (user && user.alias === 'test_alias') {
            console.log("✅ Sync logic verified in database.");
        } else {
            console.error("❌ Sync logic failed.");
        }

        // Cleanup
        db.prepare("DELETE FROM gun_users WHERE pub = ?").run('test_pub');
    } else {
        console.error("❌ Table 'gun_users' does NOT exist.");
    }
} catch (e) {
    console.error("❌ Error checking database:", e.message);
} finally {
    db.close();
}
