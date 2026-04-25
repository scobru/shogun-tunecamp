import { performance } from 'perf_hooks';
import { Database } from 'better-sqlite3';
import DatabaseConstructor from 'better-sqlite3';

const db = new DatabaseConstructor(':memory:');

db.exec(`
    CREATE TABLE admin (
        id INTEGER PRIMARY KEY,
        username TEXT,
        artist_id INTEGER,
        role TEXT,
        storage_quota INTEGER,
        is_active INTEGER,
        created_at TEXT
    );
    CREATE TABLE artists (
        id INTEGER PRIMARY KEY,
        name TEXT
    );
`);

// Insert 1000 users
const insertAdmin = db.prepare('INSERT INTO admin (username, artist_id, role, storage_quota, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const insertArtist = db.prepare('INSERT INTO artists (name) VALUES (?)');

for (let i = 0; i < 1000; i++) {
    insertArtist.run(`Artist ${i}`);
    insertAdmin.run(`user${i}`, i, 'admin', 1000, 1, '2023-01-01');
}

const listAdmins = () => {
    const rows = db.prepare(`
        SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, ar.name as artist_name
        FROM admin a
        LEFT JOIN artists ar ON a.artist_id = ar.id
        ORDER BY a.username
    `).all() as any[];

    return rows.map(row => ({
        ...row,
        role: row.role || 'admin',
        is_root: row.id === 1
    }));
};

const getUserById = (id: number) => {
    const row = db.prepare(`
        SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, ar.name as artist_name
        FROM admin a
        LEFT JOIN artists ar ON a.artist_id = ar.id
        WHERE a.id = ?
    `).get(id) as any;

    if (!row) {
        return undefined;
    }

    return {
        ...row,
        role: row.role || 'admin',
        is_root: row.id === 1
    };
};

const idToFind = 500;

// Warmup
for(let i=0; i<100; i++) {
    listAdmins().find(a => a.id === idToFind);
    getUserById(idToFind);
}

// Benchmark baseline
const startBaseline = performance.now();
for(let i=0; i<1000; i++) {
    const admins = listAdmins();
    const admin = admins.find(a => a.id === idToFind);
}
const endBaseline = performance.now();
const baselineTime = endBaseline - startBaseline;

// Benchmark optimized
const startOptimized = performance.now();
for(let i=0; i<1000; i++) {
    const admin = getUserById(idToFind);
}
const endOptimized = performance.now();
const optimizedTime = endOptimized - startOptimized;

console.log(`Baseline time: ${baselineTime.toFixed(2)}ms`);
console.log(`Optimized time: ${optimizedTime.toFixed(2)}ms`);
console.log(`Improvement: ${((baselineTime - optimizedTime) / baselineTime * 100).toFixed(2)}%`);
