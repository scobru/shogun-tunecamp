import Database from "better-sqlite3";
const db = new Database("tunecamp.db");
try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("Tables:", tables);
    if (tables.some(t => t.name === 'admin')) {
        const admins = db.prepare("SELECT id, username, role FROM admin").all();
        console.log("Admins:", admins);
    } else {
        console.log("No 'admin' table found.");
    }
} catch (e) {
    console.error("Error:", e.message);
} finally {
    db.close();
}
