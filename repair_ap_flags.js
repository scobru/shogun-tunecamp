import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("d:/shogun-2/tunecamp/tunecamp.db");
console.log("Connecting to:", dbPath);
const db = new Database(dbPath);

console.log("Fixing releases...");
const releaseRes = db.prepare("UPDATE releases SET published_to_ap = 1, published_to_gundb = 1 WHERE visibility IN ('public', 'unlisted')").run();
console.log(`Updated ${releaseRes.changes} releases.`);

console.log("Fixing albums...");
const albumRes = db.prepare("UPDATE albums SET published_to_ap = 1, published_to_gundb = 1 WHERE visibility IN ('public', 'unlisted')").run();
console.log(`Updated ${albumRes.changes} albums.`);

db.close();
console.log("Done.");
