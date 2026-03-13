const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.argv[2] || "tunecamp.db";
const username = process.argv[3];

if (!username) {
    console.log("Usage: node promote_admin.js <username> [db_path]");
    process.exit(1);
}

const db = new Database(dbPath);

try {
    const user = db.prepare("SELECT id, username, role FROM admin WHERE username = ?").get(username);
    
    if (!user) {
        console.error(`User '${username}' not found.`);
        process.exit(1);
    }

    console.log(`Found user: ${user.username} (Role: ${user.role})`);

    db.prepare("UPDATE admin SET role = 'admin', storage_quota = 0 WHERE username = ?").run(username);
    
    console.log(`✅ User '${username}' promoted to admin and storage quota set to unlimited.`);
} catch (e) {
    console.error("Error:", e.message);
} finally {
    db.close();
}
