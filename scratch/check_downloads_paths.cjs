const Database = require('better-sqlite3');
const path = require('path');
const db = new Database('tunecamp.db');

const tracks = db.prepare("SELECT id, file_path FROM tracks WHERE file_path LIKE '../downloads/%' LIMIT 20").all();
console.log('--- Tracks starting with ../downloads/ ---');
console.log(JSON.stringify(tracks, null, 2));

const lossless = db.prepare("SELECT id, lossless_path FROM tracks WHERE lossless_path LIKE '../downloads/%' LIMIT 20").all();
console.log('\n--- Lossless starting with ../downloads/ ---');
console.log(JSON.stringify(lossless, null, 2));

const albums = db.prepare("SELECT id, cover_path FROM albums WHERE cover_path LIKE '../downloads/%' LIMIT 20").all();
console.log('\n--- Albums covering tracks in downloads ---');
console.log(JSON.stringify(albums, null, 2));

const releases = db.prepare("SELECT id, cover_path FROM releases WHERE cover_path LIKE '../downloads/%' LIMIT 20").all();
console.log('\n--- Releases covering tracks in downloads ---');
console.log(JSON.stringify(releases, null, 2));
