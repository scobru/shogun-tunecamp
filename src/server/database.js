import Database from "better-sqlite3";
function mapAlbum(row) {
    if (!row)
        return undefined;
    return {
        ...row,
        currency: row.currency || 'ETH',
        is_public: !!row.is_public,
        is_release: !!row.is_release,
        published_to_gundb: !!row.published_to_gundb,
        published_to_ap: !!row.published_to_ap,
    };
}
function mapAlbums(rows) {
    return rows.map(mapAlbum);
}
export function createDatabase(dbPath) {
    const db = new Database(dbPath);
    // Disable foreign key constraints to allow manual relationship management
    // and prevent 'FOREIGN KEY constraint failed' errors during updates/migrations.
    db.pragma("foreign_keys = OFF");
    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");
    // Register custom Levenshtein function
    db.function("levenshtein", (a, b) => {
        if (!a)
            return b ? b.length : 0;
        if (!b)
            return a ? a.length : 0;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
            }
        }
        return matrix[b.length][a.length];
    });
    // Create tables
    db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      bio TEXT,
      photo_path TEXT,
      links TEXT,
      public_key TEXT,
      private_key TEXT,
      wallet_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS followers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      actor_uri TEXT NOT NULL,
      inbox_uri TEXT NOT NULL,
      shared_inbox_uri TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(artist_id, actor_uri)
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_actor_fid TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(remote_actor_fid, object_type, object_id)
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      artist_id INTEGER REFERENCES artists(id),
      artist_name TEXT,
      date TEXT,
      cover_path TEXT,
      genre TEXT,
      description TEXT,
      download TEXT,
      price REAL DEFAULT 0,
      price_usdc REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      external_links TEXT,
      is_public INTEGER DEFAULT 0,
      visibility TEXT DEFAULT 'private',
      license TEXT,
      is_release INTEGER DEFAULT 0,
      published_to_gundb INTEGER DEFAULT 0,
      published_to_ap INTEGER DEFAULT 0,
      published_at TEXT,
      use_nft INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      album_id INTEGER REFERENCES albums(id),
      artist_id INTEGER REFERENCES artists(id),
      artist_name TEXT,
      track_num INTEGER,
      duration REAL,
      file_path TEXT,
      format TEXT,
      bitrate INTEGER,
      sample_rate INTEGER,
      price REAL DEFAULT 0,
      price_usdc REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      waveform TEXT,
      url TEXT,
      service TEXT,
      external_artwork TEXT,
      lyrics TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      description TEXT,
      is_public INTEGER DEFAULT 0,
      cover_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      artist_id INTEGER REFERENCES artists(id),
      owner_id INTEGER REFERENCES artists(id),
      date TEXT,
      cover_path TEXT,
      genre TEXT,
      description TEXT,
      type TEXT,
      year INTEGER,
      download TEXT,
      price REAL DEFAULT 0,
      price_usdc REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      external_links TEXT,
      visibility TEXT DEFAULT 'private',
      published_at TEXT,
      published_to_gundb INTEGER DEFAULT 0,
      published_to_ap INTEGER DEFAULT 0,
      license TEXT,
      use_nft INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS release_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id INTEGER,
      track_id INTEGER,
      title TEXT NOT NULL,
      artist_name TEXT,
      track_num INTEGER,
      duration REAL,
      file_path TEXT,
      price REAL DEFAULT 0,
      price_usdc REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_release_tracks_release_id ON release_tracks(release_id);
    CREATE INDEX IF NOT EXISTS idx_release_tracks_track_id ON release_tracks(track_id);


    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      played_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at);
    CREATE INDEX IF NOT EXISTS idx_play_history_track_id ON play_history(track_id);

    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
    CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
    CREATE INDEX IF NOT EXISTS idx_albums_public ON albums(is_public);
    CREATE INDEX IF NOT EXISTS idx_albums_release ON albums(is_release);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS unlock_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      release_id INTEGER REFERENCES albums(id),
      is_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      redeemed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      visibility TEXT DEFAULT 'public',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_posts_artist_id ON posts(artist_id);

    CREATE TABLE IF NOT EXISTS ap_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      note_id TEXT NOT NULL UNIQUE,
      note_type TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      content_slug TEXT NOT NULL,
      content_title TEXT NOT NULL,
      published_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ap_notes_artist ON ap_notes(artist_id);

    CREATE TABLE IF NOT EXISTS gun_users (
      pub TEXT PRIMARY KEY,
      epub TEXT,
      alias TEXT,
      avatar TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      instance_url TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_links (
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      gun_pub TEXT NOT NULL,
      gun_priv TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, subject)
    );

    CREATE TABLE IF NOT EXISTS remote_actors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uri TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      username TEXT,
      name TEXT,
      summary TEXT,
      icon_url TEXT,
      inbox_url TEXT,
      outbox_url TEXT,
      is_followed INTEGER DEFAULT 0,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS remote_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ap_id TEXT NOT NULL UNIQUE,
      actor_uri TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      url TEXT,
      cover_url TEXT,
      stream_url TEXT,
      artist_name TEXT,
      album_name TEXT,
      duration REAL,
      published_at TEXT,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS starred_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(username, item_type, item_id)
    );

    CREATE TABLE IF NOT EXISTS play_queue_state (
      username TEXT PRIMARY KEY,
      current_track_id TEXT,
      position_ms INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS play_queue_tracks (
      username TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (username, position)
    );

    CREATE TABLE IF NOT EXISTS item_ratings (
      username TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (username, item_type, item_id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position_ms INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(username);

    CREATE TABLE IF NOT EXISTS album_ownership (
      album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
      owner_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      PRIMARY KEY (album_id, owner_id)
    );

    CREATE TABLE IF NOT EXISTS track_ownership (
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      owner_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      PRIMARY KEY (track_id, owner_id)
    );
    CREATE INDEX IF NOT EXISTS idx_track_ownership_owner ON track_ownership(owner_id);
    CREATE INDEX IF NOT EXISTS idx_album_ownership_owner ON album_ownership(owner_id);
  `);
    // Migration: Move existing releases from 'albums' to 'releases' table
    try {
        const releaseCount = db.prepare("SELECT COUNT(*) as count FROM releases").get().count;
        if (releaseCount === 0) {
            const oldReleases = db.prepare("SELECT * FROM albums WHERE is_release = 1").all();
            if (oldReleases.length > 0) {
                console.log(`📦 Migrating ${oldReleases.length} releases to new structure...`);
                db.transaction(() => {
                    for (const album of oldReleases) {
                        // 1. Insert into releases
                        const res = db.prepare(`
                            INSERT INTO releases (id, title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, price, currency, external_links, visibility, published_at, published_to_gundb, published_to_ap, license, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(album.id, album.title, album.slug, album.artist_id, album.owner_id || album.artist_id, album.date, album.cover_path, album.genre, album.description, album.type, album.year, album.download, album.price, album.currency, album.external_links, album.visibility, album.published_at, album.published_to_gundb, album.published_to_ap, album.license, album.created_at);
                        // 2. Migrate tracks
                        // We need to find tracks associated with this album. 
                        // In the old system, they were in 'release_tracks' referencing albums(id) OR just tracks with album_id.
                        // Actually, if is_release=1, the tracks were linked via release_tracks.
                        const oldTracks = db.prepare(`
                            SELECT t.* FROM tracks t
                            JOIN release_tracks rt ON t.id = rt.track_id
                            WHERE rt.release_id = ?
                        `).all(album.id);
                        // But wait, the old 'release_tracks' table might have been dropped or renamed if I'm not careful.
                        // Actually, I haven't dropped it yet.
                        for (const track of oldTracks) {
                            db.prepare(`
                                INSERT INTO release_tracks (release_id, track_id, title, artist_name, track_num, duration, file_path, price, currency, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(album.id, track.id, track.title, track.artist_name, track.track_num, track.duration, track.file_path, track.price, track.currency, track.created_at);
                        }
                    }
                    // 3. Migrate unlock_codes
                    // They already point to the ID which is now in 'releases' (we preserved IDs).
                    // But we might want to update the table definition later.
                    console.log("✅ Migration complete: releases moved to separate compartment.");
                })();
            }
        }
    }
    catch (e) {
        console.error("Migration error (releases):", e);
    }
    // Migration: Recreate release_tracks without strict foreign keys to avoid constraint failures in decoupled mode
    try {
        const tableInfo = db.pragma("table_info(release_tracks)");
        // Check if table has strict FKs (usually indicated by REFERENCES in schema, but easier to just check if we haven't fixed it yet)
        const fixKey = "release_tracks_fk_fixed_v2";
        const isFixed = db.prepare("SELECT value FROM settings WHERE key = ?").get(fixKey);
        if (!isFixed) {
            console.log("📦 Migrating database: Removing strict foreign keys from release_tracks...");
            db.transaction(() => {
                // 1. Get existing data
                const data = db.prepare("SELECT * FROM release_tracks").all();
                // 2. Drop old table
                db.exec("DROP TABLE IF EXISTS release_tracks");
                // 3. Create new table without REFERENCES
                db.exec(`
                    CREATE TABLE IF NOT EXISTS release_tracks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        release_id INTEGER,
                        track_id INTEGER,
                        title TEXT NOT NULL,
                        artist_name TEXT,
                        track_num INTEGER,
                        duration REAL,
                        file_path TEXT,
                        price REAL DEFAULT 0,
                        currency TEXT DEFAULT 'ETH',
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                // 4. Restore data
                if (data.length > 0) {
                    const insert = db.prepare(`
                        INSERT INTO release_tracks (id, release_id, track_id, title, artist_name, track_num, duration, file_path, price, currency, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    for (const row of data) {
                        insert.run(row.id, row.release_id, row.track_id, row.title, row.artist_name, row.track_num, row.duration, row.file_path, row.price, row.currency, row.created_at);
                    }
                }
                // 5. Re-create indexes
                db.exec("CREATE INDEX IF NOT EXISTS idx_release_tracks_release_id ON release_tracks(release_id)");
                db.exec("CREATE INDEX IF NOT EXISTS idx_release_tracks_track_id ON release_tracks(track_id)");
                // 6. Mark as fixed
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(fixKey, "true");
            })();
            console.log("✅ Database migrated: release_tracks is now unconstrained.");
        }
    }
    catch (e) {
        console.warn("⚠️  Migration warning (release_tracks recreation):", e);
    }
    // Migration: Add is_release column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN is_release INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added is_release column");
    }
    catch (e) {
        // Column already exists, ignore
    }
    // Migration: Add subsonic_token to admin
    try {
        db.exec(`ALTER TABLE admin ADD COLUMN subsonic_token TEXT`);
        console.log("📦 Migrated database: added subsonic_token to admin");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add subsonic_password (encrypted cleartext) to admin for token+salt auth
    try {
        db.exec(`ALTER TABLE admin ADD COLUMN subsonic_password TEXT`);
        console.log("📦 Migrated database: added subsonic_password to admin");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add epub, alias, avatar to gun_users
    try {
        db.exec(`ALTER TABLE gun_users ADD COLUMN epub TEXT`);
        console.log("📦 Migrated database: added epub to gun_users");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE gun_users ADD COLUMN alias TEXT`);
        console.log("📦 Migrated database: added alias to gun_users");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE gun_users ADD COLUMN avatar TEXT`);
        console.log("📦 Migrated database: added avatar to gun_users");
    }
    catch (e) { }
    // Migration: Add download column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN download TEXT`);
        console.log("📦 Migrated database: added download column");
    }
    catch (e) {
        // Column already exists, ignore
    }
    // Migration: Add price columns 
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN price REAL DEFAULT 0`);
        console.log("📦 Migrated database: added price column to albums");
    }
    catch (e) {
    }
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN price REAL DEFAULT 0`);
        console.log("📦 Migrated database: added price column to tracks");
    }
    catch (e) {
    }
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN price REAL DEFAULT 0`);
        console.log("📦 Migrated database: added price column to release_tracks");
    }
    catch (e) {
    }
    // Migration: Add currency columns
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN currency TEXT DEFAULT 'ETH'`);
        console.log("📦 Migrated database: added currency column to albums");
    }
    catch (e) {
    }
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN currency TEXT DEFAULT 'ETH'`);
        console.log("📦 Migrated database: added currency column to tracks");
    }
    catch (e) {
    }
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN currency TEXT DEFAULT 'ETH'`);
        console.log("📦 Migrated database: added currency column to release_tracks");
    }
    catch (e) {
    }
    // Migration: Add external_links column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN external_links TEXT`);
        console.log("📦 Migrated database: added external_links column");
    }
    catch (e) {
        // Column already exists, ignore
    }
    // Migration: Add waveform column to tracks
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN waveform TEXT`);
        console.log("📦 Migrated database: added waveform column");
    }
    catch (e) {
        // Column already exists, ignore
    }
    // Migration: Add lossless_path column to tracks
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN lossless_path TEXT`);
        console.log("📦 Migrated database: added lossless_path column");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add lower(title) index to tracks
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_title_lower ON tracks(lower(title))`);
    }
    catch (e) {
        // Ignore
    }
    // Migration: Add price_usdc to tracks, albums, releases, release_tracks
    const tablesWithUsdc = ['tracks', 'albums', 'releases', 'release_tracks'];
    for (const tableName of tablesWithUsdc) {
        try {
            const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
            if (!tableInfo.find(c => c.name === 'price_usdc')) {
                db.exec(`ALTER TABLE ${tableName} ADD COLUMN price_usdc REAL DEFAULT 0`);
                console.log(`📦 Migrated database: added price_usdc column to ${tableName}`);
            }
        }
        catch (e) {
            // Ignore if column exists
        }
    }
    // Migration: Add use_nft to releases
    try {
        const releaseTableInfo = db.prepare(`PRAGMA table_info(releases)`).all();
        if (!releaseTableInfo.find(c => c.name === 'use_nft')) {
            db.exec(`ALTER TABLE releases ADD COLUMN use_nft INTEGER DEFAULT 1`);
            console.log(`📦 Migrated database: added use_nft column to releases`);
        }
    }
    catch (e) {
        // Ignore if column exists
    }
    // Migration: Add is_public column to playlists if it doesn't exist
    try {
        db.exec(`ALTER TABLE playlists ADD COLUMN is_public INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added is_public column to playlists");
    }
    catch (e) {
        // Column already exists, ignore
    }
    // Migration: Add cover_path column to playlists if it doesn't exist
    try {
        db.exec(`ALTER TABLE playlists ADD COLUMN cover_path TEXT`);
        console.log("📦 Migrated database: added cover_path column to playlists");
    }
    catch (e) {
        // Column already exists, ignore
    }
    // Migration: Add username column to playlists if it doesn't exist
    try {
        db.exec(`ALTER TABLE playlists ADD COLUMN username TEXT`);
        db.prepare("UPDATE playlists SET username = 'admin' WHERE username IS NULL").run();
        console.log("📦 Migrated database: added username column to playlists");
    }
    catch (e) {
        // Column already exists, ignore
    }
    // Migration: Add keys to artists
    try {
        db.exec(`ALTER TABLE artists ADD COLUMN public_key TEXT`);
        db.exec(`ALTER TABLE artists ADD COLUMN private_key TEXT`);
        console.log("📦 Migrated database: added keys to artists");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add post_params to artists
    try {
        db.exec(`ALTER TABLE artists ADD COLUMN post_params TEXT`);
        console.log("📦 Migrated database: added post_params to artists");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add wallet_address to artists
    try {
        db.exec(`ALTER TABLE artists ADD COLUMN wallet_address TEXT`);
        console.log("📦 Migrated database: added wallet_address to artists");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add license to albums
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN license TEXT`);
        console.log("📦 Migrated database: added license column to albums");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add visibility to albums
    try {
        const columns = db.pragma("table_info(albums)");
        const hasVisibility = columns.some(c => c.name === "visibility");
        if (!hasVisibility) {
            db.exec(`ALTER TABLE albums ADD COLUMN visibility TEXT DEFAULT 'private'`);
            // Backfill based on is_public
            db.prepare("UPDATE albums SET visibility = 'public' WHERE is_public = 1").run();
            db.prepare("UPDATE albums SET visibility = 'private' WHERE is_public = 0").run();
            console.log("📦 Migrated database: added visibility to albums");
        }
    }
    catch (e) {
        console.warn("⚠️  Migration warning (albums.visibility):", e);
    }
    // Ensure index on visibility
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_albums_visibility ON albums(visibility)`);
    }
    catch (e) {
        // Ignore
    }
    // Migration: Add type and year to albums
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN type TEXT`);
        db.exec(`ALTER TABLE albums ADD COLUMN year INTEGER`);
        console.log("📦 Migrated database: added type and year to albums");
    }
    catch (e) {
        // Columns already exist
    }
    // Migration: Add visibility to posts
    try {
        db.exec(`ALTER TABLE posts ADD COLUMN visibility TEXT DEFAULT 'public'`);
        console.log("📦 Migrated database: added visibility to posts");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add federation settings to albums
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN published_to_gundb INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE albums ADD COLUMN published_to_ap INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added federation settings to albums");
        // Backfill based on visibility
        db.prepare("UPDATE albums SET published_to_gundb = 1, published_to_ap = 1 WHERE visibility IN ('public', 'unlisted')").run();
    }
    catch (e) {
        // Columns already exist
    }
    // Migration: Add published_at to posts
    try {
        db.exec(`ALTER TABLE posts ADD COLUMN published_at TEXT`);
        // Backfill published_at with created_at for existing public posts
        db.prepare("UPDATE posts SET published_at = created_at WHERE visibility = 'public'").run();
        console.log("📦 Migrated database: added published_at to posts");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add external track columns
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN url TEXT`);
        db.exec(`ALTER TABLE tracks ADD COLUMN service TEXT`);
        db.exec(`ALTER TABLE tracks ADD COLUMN external_artwork TEXT`);
        console.log("📦 Migrated database: added external track columns (url, service, external_artwork)");
    }
    catch (e) {
        // Columns already exist
    }
    // Migration: Add lyrics column to tracks
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN lyrics TEXT`);
        console.log("📦 Migrated database: added lyrics column to tracks");
    }
    catch (e) {
        // Column already exists
    }
    // Migration: Add date index to albums
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_albums_date ON albums(date DESC)`);
        console.log("📦 Migrated database: added date index to albums");
    }
    catch (e) {
        // Ignore
    }
    // Migration: Fix NOT NULL constraint on tracks.file_path for external tracks
    try {
        const columns = db.pragma("table_info(tracks)");
        const filePathCol = columns.find(c => c.name === "file_path");
        if (filePathCol && filePathCol.notnull === 1) {
            console.log("📦 Migrating database: making tracks.file_path nullable...");
            db.transaction(() => {
                // 1. Create new table with correct schema
                const tableDef = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tracks'").get();
                let newSql = tableDef.sql.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?['"`]?tracks['"`]?/i, "CREATE TABLE tracks_new");
                newSql = newSql.replace(/(file_path\s+TEXT)\s+NOT\s+NULL/i, "$1");
                db.exec(newSql);
                // 2. Copy data
                const colNames = columns.map(c => `"${c.name}"`).join(", ");
                db.exec(`INSERT INTO tracks_new (${colNames}) SELECT ${colNames} FROM tracks;`);
                // 3. Swap tables
                db.exec(`DROP TABLE tracks;`);
                db.exec(`ALTER TABLE tracks_new RENAME TO tracks;`);
                // 4. Re-create indexes
                db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);`);
                db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);`);
                db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_title_lower ON tracks(lower(title));`);
            })();
            console.log("✅ Database migrated: tracks.file_path is now nullable.");
        }
    }
    catch (e) {
        console.warn("⚠️  Migration warning (tracks.file_path):", e);
    }
    // Migration: Add remote_actors table
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS remote_actors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uri TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL,
                username TEXT,
                name TEXT,
                summary TEXT,
                icon_url TEXT,
                inbox_url TEXT,
                outbox_url TEXT,
                last_seen TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("📦 Migrated database: added remote_actors table");
    }
    catch (e) {
        console.warn("⚠️  Migration warning (remote_actors):", e);
    }
    // Migration: Add is_followed column to remote_actors
    try {
        db.exec(`ALTER TABLE remote_actors ADD COLUMN is_followed INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added is_followed column to remote_actors");
    }
    catch (e) { }
    // Migration: Add remote_content table
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS remote_content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ap_id TEXT NOT NULL UNIQUE,
                actor_uri TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT,
                content TEXT,
                url TEXT,
                cover_url TEXT,
                stream_url TEXT,
                artist_name TEXT,
                album_name TEXT,
                duration REAL,
                published_at TEXT,
                received_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("📦 Migrated database: added remote_content table");
    }
    catch (e) {
        console.warn("⚠️  Migration warning (remote_content):", e);
    }
    // Migration: Add federation columns to releases if missing
    try {
        db.exec(`ALTER TABLE releases ADD COLUMN published_to_gundb INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added published_to_gundb column to releases");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE releases ADD COLUMN published_to_ap INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added published_to_ap column to releases");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE releases ADD COLUMN visibility TEXT DEFAULT 'private'`);
        console.log("📦 Migrated database: added visibility column to releases");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE releases ADD COLUMN published_at TEXT`);
        console.log("📦 Migrated database: added published_at column to releases");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE releases ADD COLUMN license TEXT`);
        console.log("📦 Migrated database: added license column to releases");
    }
    catch (e) { }
    // Migration: Add artist_name to albums and tracks if missing
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN artist_name TEXT`);
        console.log("📦 Migrated database: added artist_name column to albums");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN artist_name TEXT`);
        console.log("📦 Migrated database: added artist_name column to tracks");
    }
    catch (e) { }
    // Migration: Add columns to release_tracks if missing (Robust version)
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN id INTEGER`);
        db.prepare("UPDATE release_tracks SET id = rowid WHERE id IS NULL").run();
        console.log("📦 Migrated database: added and backfilled id column to release_tracks");
    }
    catch (e) {
        if (!e.message.includes("duplicate column name"))
            console.error("Error adding id to release_tracks:", e);
    }
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN artist_name TEXT`);
        console.log("📦 Migrated database: added artist_name column to release_tracks");
    }
    catch (e) {
        if (!e.message.includes("duplicate column name"))
            console.error("Error adding artist_name:", e);
    }
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN title TEXT NOT NULL DEFAULT 'Unknown'`);
        console.log("📦 Migrated database: added title column to release_tracks");
    }
    catch (e) {
        if (!e.message.includes("duplicate column name"))
            console.error("Error adding title:", e);
    }
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN track_num INTEGER`);
        console.log("📦 Migrated database: added track_num column to release_tracks");
    }
    catch (e) {
        if (!e.message.includes("duplicate column name"))
            console.error("Error adding track_num:", e);
    }
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN duration REAL`);
        console.log("📦 Migrated database: added duration column to release_tracks");
    }
    catch (e) {
        if (!e.message.includes("duplicate column name"))
            console.error("Error adding duration:", e);
    }
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN file_path TEXT`);
        console.log("📦 Migrated database: added file_path column to release_tracks");
    }
    catch (e) {
        if (!e.message.includes("duplicate column name"))
            console.error("Error adding file_path:", e);
    }
    try {
        db.exec(`ALTER TABLE release_tracks ADD COLUMN created_at TEXT`);
        db.prepare("UPDATE release_tracks SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL").run();
        console.log("📦 Migrated database: added created_at column to release_tracks");
    }
    catch (e) {
        if (!e.message.includes("duplicate column name"))
            console.error("Error adding created_at:", e);
    }
    // Migration: Add owner_id to albums and tracks if missing
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN owner_id INTEGER REFERENCES artists(id)`);
        console.log("📦 Migrated database: added owner_id column to albums");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN owner_id INTEGER REFERENCES artists(id)`);
        console.log("📦 Migrated database: added owner_id column to tracks");
    }
    catch (e) { }
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN hash TEXT`);
        console.log("📦 Migrated database: added hash column to tracks");
    }
    catch (e) { }
    // Migration: Backfill ownership tables from owner_id columns
    try {
        db.exec(`
            INSERT OR IGNORE INTO album_ownership (album_id, owner_id)
            SELECT id, owner_id FROM albums WHERE owner_id IS NOT NULL;
        `);
        db.exec(`
            INSERT OR IGNORE INTO track_ownership (track_id, owner_id)
            SELECT id, owner_id FROM tracks WHERE owner_id IS NOT NULL;
        `);
        console.log("📦 Migrated database: backfilled ownership tables");
    }
    catch (e) {
        console.error("Migration error (ownership backfill):", e);
    }
    try {
        db.exec(`
            ALTER TABLE albums ADD COLUMN use_nft INTEGER DEFAULT 1;
        `);
        console.log("📦 Migrated database: added use_nft to albums table");
    }
    catch (e) {
        if (!e.message.includes("duplicate column name")) {
            console.error("Migration error (albums use_nft):", e);
        }
    }
    // Optimized: Pre-compile frequent queries
    const getArtistStmt = db.prepare("SELECT * FROM artists WHERE id = ?");
    const getAlbumStmt = db.prepare(`SELECT a.*, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a
           LEFT JOIN artists ar ON a.artist_id = ar.id
           WHERE a.id = ?`);
    const getTrackStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            ar_t.id as artist_id,
            COALESCE(ar_t.name, t.artist_name, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           WHERE t.id = ?`);
    const getTracksByAlbumStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
              COALESCE(ar_t.id, ar_a.id) as artist_id,
              COALESCE(ar_t.name, ar_a.name) as artist_name, 
              COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
              COALESCE(t.owner_id, a.owner_id) as owner_id
             FROM tracks t
             LEFT JOIN albums a ON t.album_id = a.id
             LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
             LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
             WHERE t.album_id = ? ORDER BY t.track_num`);
    const getPublicTracksByAlbumStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            ar_t.id as artist_id,
            COALESCE(ar_t.name, t.artist_name, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
            LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
            WHERE t.album_id = ? AND a.is_public = 1
            ORDER BY t.track_num`);
    const getAllTracksStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            ar_t.id as artist_id,
            COALESCE(ar_t.name, t.artist_name, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           ORDER BY artist_name, a.title, t.track_num`);
    const getAllPublicTracksStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            ar_t.id as artist_id,
            COALESCE(ar_t.name, t.artist_name, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           WHERE a.is_public = 1 OR (t.album_id IS NULL AND ar_t.id IS NOT NULL)
           ORDER BY artist_name, a.title, t.track_num`);
    const getTracksByArtistStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            ar_t.id as artist_id,
            COALESCE(ar_t.name, t.artist_name, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id
            FROM tracks t
            LEFT JOIN albums a ON t.album_id = a.id
            LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
            LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
            WHERE t.artist_id = ? OR (t.artist_id IS NULL AND a.artist_id = ?)
            ORDER BY a.title, t.track_num`);
    const getPublicTracksByArtistStmt = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            ar_t.id as artist_id,
            COALESCE(ar_t.name, t.artist_name, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id
            FROM tracks t
            LEFT JOIN albums a ON t.album_id = a.id
            LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
            LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
            WHERE (t.artist_id = ? OR (t.artist_id IS NULL AND a.artist_id = ?)) 
            AND (a.is_public = 1 OR t.album_id IS NULL)
            ORDER BY a.title, t.track_num`);
    return {
        db,
        getReleaseTrackIds(releaseId) {
            const rows = db.prepare("SELECT track_id FROM release_tracks WHERE release_id = ?").all(releaseId);
            return rows.map(r => r.track_id).filter(id => id !== null);
        },
        // Releases (Watertight compartment)
        getReleases(publicOnly = false) {
            const sql = publicOnly
                ? `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                   LEFT JOIN artists ar ON r.artist_id = ar.id
                   WHERE r.visibility = 'public' ORDER BY r.date DESC`
                : `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                   LEFT JOIN artists ar ON r.artist_id = ar.id
                   ORDER BY r.date DESC`;
            return db.prepare(sql).all();
        },
        getRelease(id) {
            const row = db.prepare(`
                SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE r.id = ?
            `).get(id);
            if (!row)
                return undefined;
            return {
                ...row,
                published_to_gundb: !!row.published_to_gundb,
                published_to_ap: !!row.published_to_ap
            };
        },
        getReleaseBySlug(slug) {
            console.log(`🔍 [Debug] getReleaseBySlug: ${slug}`);
            const row = db.prepare(`
                SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE r.slug = ?
            `).get(slug);
            if (!row) {
                console.log(`   - Not found in releases table`);
                return undefined;
            }
            return {
                ...row,
                published_to_gundb: !!row.published_to_gundb,
                published_to_ap: !!row.published_to_ap
            };
        },
        getReleasesByArtist(artistId, publicOnly = false) {
            const sql = publicOnly
                ? `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                   LEFT JOIN artists ar ON r.artist_id = ar.id
                   WHERE r.artist_id = ? AND r.visibility = 'public' ORDER BY r.date DESC`
                : `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                   LEFT JOIN artists ar ON r.artist_id = ar.id
                   WHERE r.artist_id = ? ORDER BY r.date DESC`;
            return db.prepare(sql).all(artistId);
        },
        getReleasesByOwner(ownerId, publicOnly = false) {
            const sql = publicOnly
                ? `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                   LEFT JOIN artists ar ON r.artist_id = ar.id
                   WHERE r.owner_id = ? AND r.visibility = 'public' ORDER BY r.date DESC`
                : `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
                   LEFT JOIN artists ar ON r.artist_id = ar.id
                   WHERE r.owner_id = ? ORDER BY r.date DESC`;
            return db.prepare(sql).all(ownerId);
        },
        createRelease(release) {
            const slug = release.slug || release.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "release";
            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    const result = db.prepare(`
                        INSERT INTO releases (title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, price, currency, external_links, visibility, published_at, published_to_gundb, published_to_ap, license)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(release.title, finalSlug, release.artist_id, release.owner_id || release.artist_id, release.date, release.cover_path, release.genre, release.description, release.type, release.year, release.download, release.price || 0, release.currency || 'ETH', release.external_links, release.visibility || 'private', release.published_at, release.published_to_gundb ? 1 : 0, release.published_to_ap ? 1 : 0, release.license);
                    return result.lastInsertRowid;
                }
                catch (e) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    }
                    else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for release");
        },
        updateRelease(id, release) {
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(release)) {
                if (key === 'id' || key === 'created_at' || key === 'artist_name' || key === 'artist_slug')
                    continue;
                fields.push(`${key} = ?`);
                if (key === 'published_to_gundb' || key === 'published_to_ap') {
                    values.push(value ? 1 : 0);
                }
                else {
                    values.push(value);
                }
            }
            if (fields.length === 0)
                return;
            values.push(id);
            db.prepare(`UPDATE releases SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        },
        deleteRelease(id) {
            db.transaction(() => {
                db.prepare("DELETE FROM release_tracks WHERE release_id = ?").run(id);
                db.prepare("DELETE FROM unlock_codes WHERE release_id = ?").run(id);
                db.prepare("DELETE FROM releases WHERE id = ?").run(id);
            })();
        },
        // Release Tracks
        getReleaseTracks(releaseId) {
            return db.prepare("SELECT * FROM release_tracks WHERE release_id = ? ORDER BY track_num").all(releaseId);
        },
        getReleaseTrack(id) {
            return db.prepare("SELECT * FROM release_tracks WHERE id = ?").get(id);
        },
        getTracksByReleaseId(releaseId) {
            // This returns Track objects but with metadata from the release_tracks table (decoupled)
            return db.prepare(`
                SELECT 
                    COALESCE(t.id, rt.id, rt.rowid) as id,
                    rt.title as title,
                    t.album_id,
                    r.title as album_title,
                    r.download as album_download,
                    r.visibility as album_visibility,
                    r.price as album_price,
                    COALESCE(t.artist_id, r.artist_id) as artist_id,
                    COALESCE(rt.artist_name, ar.name) as artist_name,
                    ar.wallet_address as walletAddress,
                    r.owner_id as owner_id,
                    rt.track_num as track_num,
                    rt.duration as duration,
                    t.file_path,
                    t.format,
                    t.bitrate,
                    t.sample_rate,
                    rt.price as price,
                    rt.currency as currency,
                    t.waveform,
                    t.url,
                    t.service,
                    t.external_artwork,
                    t.lyrics,
                    rt.created_at
                FROM release_tracks rt
                JOIN releases r ON rt.release_id = r.id
                LEFT JOIN tracks t ON rt.track_id = t.id
                LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE rt.release_id = ?
                ORDER BY rt.track_num
            `).all(releaseId);
        },
        addTrackToRelease(releaseId, trackId, metadata) {
            // Get base metadata from library track if not provided
            const libraryTrack = trackId ? this.getTrack(trackId) : null;
            if (trackId && !libraryTrack) {
                console.warn(`⚠️ Attempted to add non-existent library track ${trackId} to release ${releaseId}. Avoiding ghost track.`);
                return 0;
            }
            // SECURITY: If trackId was provided but track doesn't exist, use NULL for track_id column
            // to avoid FOREIGN KEY constraint failure, but keep the metadata.
            const effectiveTrackId = libraryTrack ? trackId : null;
            const title = metadata?.title || libraryTrack?.title || "Unknown Track";
            const artistName = metadata?.artist_name || libraryTrack?.artist_name || null;
            const duration = metadata?.duration || libraryTrack?.duration || 0;
            const filePath = metadata?.file_path || libraryTrack?.file_path || null;
            const price = metadata?.price || 0;
            const priceUsdc = metadata?.price_usdc || 0;
            const currency = metadata?.currency || 'ETH';
            // Auto-calculate track_num if not provided
            let trackNum = metadata?.track_num;
            if (trackNum === undefined) {
                const maxNum = db.prepare("SELECT MAX(track_num) as max FROM release_tracks WHERE release_id = ?").get(releaseId);
                trackNum = (maxNum.max || 0) + 1;
            }
            const result = db.prepare(`
                INSERT INTO release_tracks (release_id, track_id, title, artist_name, track_num, duration, file_path, price, price_usdc, currency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(releaseId, effectiveTrackId, title, artistName, trackNum, duration, filePath, price, priceUsdc, currency);
            return result.lastInsertRowid;
        },
        updateReleaseTrack(id, metadata) {
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(metadata)) {
                if (key === 'id' || key === 'release_id' || key === 'created_at')
                    continue;
                fields.push(`${key} = ?`);
                values.push(value);
            }
            if (fields.length === 0)
                return;
            values.push(id);
            db.prepare(`UPDATE release_tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        },
        updateReleaseTrackMetadata(releaseId, trackId, metadata) {
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(metadata)) {
                if (key === 'id' || key === 'release_id' || key === 'created_at')
                    continue;
                fields.push(`${key} = ?`);
                values.push(value);
            }
            if (fields.length === 0)
                return;
            values.push(releaseId, trackId);
            db.prepare(`UPDATE release_tracks SET ${fields.join(', ')} WHERE release_id = ? AND track_id = ?`).run(...values);
        },
        removeTrackFromRelease(releaseId, trackId) {
            db.prepare("DELETE FROM release_tracks WHERE release_id = ? AND track_id = ?").run(releaseId, trackId);
        },
        deleteReleaseTrack(id) {
            db.prepare("DELETE FROM release_tracks WHERE id = ?").run(id);
        },
        updateReleaseTracksOrder(releaseId, trackIds) {
            db.transaction(() => {
                const stmt = db.prepare("UPDATE release_tracks SET track_num = ? WHERE release_id = ? AND track_id = ?");
                trackIds.forEach((trackId, index) => {
                    stmt.run(index + 1, releaseId, trackId);
                });
            })();
        },
        cleanUpGhostTracks(releaseId) {
            db.prepare("DELETE FROM release_tracks WHERE release_id = ? AND track_id IS NULL").run(releaseId);
        },
        // OAuth
        getOAuthClient(instanceUrl) {
            return db.prepare("SELECT * FROM oauth_clients WHERE instance_url = ?").get(instanceUrl);
        },
        saveOAuthClient(client) {
            db.prepare(`
                INSERT INTO oauth_clients (instance_url, client_id, client_secret, redirect_uri)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(instance_url) DO UPDATE SET
                    client_id=excluded.client_id,
                    client_secret=excluded.client_secret,
                    redirect_uri=excluded.redirect_uri
            `).run(client.instance_url, client.client_id, client.client_secret, client.redirect_uri);
        },
        getOAuthLink(provider, subject) {
            return db.prepare("SELECT * FROM oauth_links WHERE provider = ? AND subject = ?").get(provider, subject);
        },
        createOAuthLink(provider, subject, gunPub, gunPriv) {
            db.prepare(`
                INSERT INTO oauth_links (provider, subject, gun_pub, gun_priv)
                VALUES (?, ?, ?, ?)
            `).run(provider, subject, gunPub, gunPriv);
        },
        // Artists
        getArtists() {
            return db.prepare("SELECT * FROM artists ORDER BY name").all();
        },
        getArtist(id) {
            return getArtistStmt.get(id);
        },
        getArtistsByIds(ids) {
            if (ids.length === 0)
                return [];
            const CHUNK_SIZE = 900;
            const results = [];
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => "?").join(",");
                const rows = db.prepare(`SELECT * FROM artists WHERE id IN (${placeholders})`).all(...chunk);
                results.push(...rows);
            }
            return results;
        },
        getArtistByName(name) {
            return db.prepare("SELECT * FROM artists WHERE name = ?").get(name);
        },
        getArtistBySlug(slug) {
            return db.prepare("SELECT * FROM artists WHERE slug = ?").get(slug);
        },
        createArtist(name, bio, photoPath, links, postParams, walletAddress) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";
            const linksJson = links ? JSON.stringify(links) : null;
            const postParamsJson = postParams ? JSON.stringify(postParams) : null;
            // Try to insert, if slug exists add a number suffix
            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    const result = db
                        .prepare("INSERT INTO artists (name, slug, bio, photo_path, links, post_params, wallet_address) VALUES (?, ?, ?, ?, ?, ?, ?)")
                        .run(name, finalSlug, bio || null, photoPath || null, linksJson, postParamsJson, walletAddress || null);
                    return result.lastInsertRowid;
                }
                catch (e) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    }
                    else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for artist");
        },
        updateArtist(id, bio, photoPath, links, postParams, walletAddress) {
            const linksJson = links ? JSON.stringify(links) : null;
            const postParamsJson = postParams ? JSON.stringify(postParams) : null;
            db.prepare("UPDATE artists SET bio = ?, photo_path = ?, links = ?, post_params = ?, wallet_address = ? WHERE id = ?")
                .run(bio || null, photoPath || null, linksJson, postParamsJson, walletAddress || null, id);
        },
        updateArtistKeys(id, publicKey, privateKey) {
            db.prepare("UPDATE artists SET public_key = ?, private_key = ? WHERE id = ?")
                .run(publicKey, privateKey, id);
        },
        deleteArtist(id) {
            // Unlink from albums
            db.prepare("UPDATE albums SET artist_id = NULL WHERE artist_id = ?").run(id);
            // Unlink from tracks
            db.prepare("UPDATE tracks SET artist_id = NULL WHERE artist_id = ?").run(id);
            // Delete followers
            db.prepare("DELETE FROM followers WHERE artist_id = ?").run(id);
            // Delete artist
            db.prepare("DELETE FROM artists WHERE id = ?").run(id);
        },
        // Followers
        addFollower(artistId, actorUri, inboxUri, sharedInboxUri) {
            db.prepare("INSERT OR IGNORE INTO followers (artist_id, actor_uri, inbox_uri, shared_inbox_uri) VALUES (?, ?, ?, ?)").run(artistId, actorUri, inboxUri, sharedInboxUri || null);
        },
        removeFollower(artistId, actorUri) {
            db.prepare("DELETE FROM followers WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
        },
        getFollowers(artistId) {
            return db.prepare("SELECT * FROM followers WHERE artist_id = ?").all(artistId);
        },
        getFollower(artistId, actorUri) {
            return db.prepare("SELECT * FROM followers WHERE artist_id = ? AND actor_uri = ?").get(artistId, actorUri);
        },
        // Albums (Library)
        getAlbums(publicOnly = false) {
            const sql = publicOnly
                ? `SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 0 AND a.visibility = 'public' ORDER BY a.date DESC`
                : `SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 0 ORDER BY a.date DESC`;
            return db.prepare(sql).all();
        },
        getLibraryAlbums() {
            const rows = db.prepare(`SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 0 ORDER BY a.title`).all();
            return mapAlbums(rows);
        },
        getAlbum(id) {
            const row = db.prepare(`SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a
                   LEFT JOIN artists ar ON a.artist_id = ar.id
                   WHERE a.id = ?`).get(id);
            if (!row || row.is_release)
                return undefined; // Only return library albums
            return mapAlbum(row);
        },
        getAlbumsByIds(ids) {
            if (ids.length === 0)
                return [];
            const CHUNK_SIZE = 900;
            const results = [];
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => "?").join(",");
                const rows = db.prepare(`SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a
                    LEFT JOIN artists ar ON a.artist_id = ar.id
                    WHERE a.is_release = 0 AND a.id IN (${placeholders})`).all(...chunk);
                results.push(...mapAlbums(rows));
            }
            return results;
        },
        getAlbumBySlug(slug) {
            console.log(`🔍 [Debug] getAlbumBySlug: ${slug}`);
            const row = db
                .prepare(`SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 0 AND a.slug = ?`)
                .get(slug);
            if (!row) {
                console.log(`   - Not found in albums table`);
                return undefined;
            }
            return mapAlbum(row);
        },
        getAlbumByTitle(title, artistId) {
            if (artistId) {
                const row = db
                    .prepare("SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.title = ? AND a.artist_id = ?")
                    .get(title, artistId);
                return mapAlbum(row);
            }
            const row = db
                .prepare("SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.title = ?")
                .get(title);
            return mapAlbum(row);
        },
        getArtistAlbumCounts() {
            const sql = `SELECT artist_id, count(*) as count FROM albums WHERE is_release = 0 GROUP BY artist_id`;
            return db.prepare(sql).all();
        },
        getAlbumsByArtist(artistId, publicOnly = false) {
            const sql = publicOnly
                ? `SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM albums a 
                   LEFT JOIN artists ar ON a.artist_id = ar.id 
                   WHERE a.artist_id = ? AND a.is_release = 0 AND a.visibility = 'public' ORDER BY a.date DESC`
                : `SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM albums a 
                   LEFT JOIN artists ar ON a.artist_id = ar.id 
                   WHERE a.artist_id = ? AND a.is_release = 0 ORDER BY a.date DESC`;
            const rows = db.prepare(sql).all(artistId);
            return mapAlbums(rows);
        },
        getAlbumsByOwner(ownerId, publicOnly = false) {
            const sql = publicOnly
                ? `SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM albums a 
                   JOIN album_ownership ao ON a.id = ao.album_id
                   LEFT JOIN artists ar ON a.artist_id = ar.id 
                   WHERE ao.owner_id = ? AND a.is_release = 0 AND a.visibility = 'public' ORDER BY a.date DESC`
                : `SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM albums a 
                   JOIN album_ownership ao ON a.id = ao.album_id
                   LEFT JOIN artists ar ON a.artist_id = ar.id 
                   WHERE ao.owner_id = ? AND a.is_release = 0 ORDER BY a.date DESC`;
            const rows = db.prepare(sql).all(ownerId);
            return mapAlbums(rows);
        },
        createAlbum(album) {
            const slug = album.slug || album.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "album";
            // Try to insert, if slug exists add a number suffix
            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    const result = db
                        .prepare(`INSERT INTO albums (title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, price, currency, external_links, is_public, visibility, is_release, published_at, published_to_gundb, published_to_ap)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                        .run(album.title, finalSlug, album.artist_id, album.owner_id || album.artist_id, // Backwards compatibility for single column
                    album.date, album.cover_path, album.genre, album.description, album.type || null, album.year || null, album.download, album.price || 0, album.currency || 'ETH', album.external_links, album.visibility === 'public' || album.visibility === 'unlisted' ? 1 : 0, album.visibility || 'private', album.is_release ? 1 : 0, album.published_at, album.published_to_gundb ? 1 : 0, album.published_to_ap ? 1 : 0);
                    const albumId = result.lastInsertRowid;
                    const ownerId = album.owner_id || album.artist_id;
                    if (ownerId) {
                        this.addAlbumOwner(albumId, ownerId);
                    }
                    return albumId;
                }
                catch (e) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    }
                    else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for album");
        },
        updateAlbumVisibility(id, visibility) {
            const isPublic = visibility === 'public' || visibility === 'unlisted';
            const publishedAt = isPublic ? new Date().toISOString() : null;
            db.prepare("UPDATE albums SET is_public = ?, visibility = ?, published_at = ? WHERE id = ?").run(isPublic ? 1 : 0, visibility, publishedAt, id);
        },
        updateAlbumFederationSettings(id, publishedToGunDB, publishedToAP) {
            db.prepare("UPDATE albums SET published_to_gundb = ?, published_to_ap = ? WHERE id = ?").run(publishedToGunDB ? 1 : 0, publishedToAP ? 1 : 0, id);
        },
        updateAlbumArtist(id, artistId) {
            db.prepare("UPDATE albums SET artist_id = ? WHERE id = ?").run(artistId, id);
        },
        updateAlbumOwner(id, ownerId) {
            db.prepare("UPDATE albums SET owner_id = ? WHERE id = ?").run(ownerId, id);
        },
        updateAlbumTitle(id, title) {
            // Also update slug to match scanner behavior
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "album";
            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    db.prepare("UPDATE albums SET title = ?, slug = ? WHERE id = ?").run(title, finalSlug, id);
                    return;
                }
                catch (e) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    }
                    else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for album rename");
        },
        updateAlbumCover(id, coverPath) {
            db.prepare("UPDATE albums SET cover_path = ? WHERE id = ?").run(coverPath, id);
        },
        updateAlbumGenre(id, genre) {
            db.prepare("UPDATE albums SET genre = ? WHERE id = ?").run(genre, id);
        },
        updateAlbumDownload(id, download) {
            db.prepare("UPDATE albums SET download = ? WHERE id = ?").run(download, id);
        },
        updateAlbumPrice(id, price, price_usdc, currency = 'ETH') {
            db.prepare("UPDATE albums SET price = ?, price_usdc = ?, currency = ? WHERE id = ?").run(price || 0, price_usdc || 0, currency, id);
        },
        updateAlbumLinks(id, links) {
            db.prepare("UPDATE albums SET external_links = ? WHERE id = ?").run(links, id);
        },
        promoteToRelease(id) {
            const album = db.prepare("SELECT * FROM albums WHERE id = ?").get(id);
            if (!album)
                return;
            db.transaction(() => {
                // 1. Insert into releases
                db.prepare(`
                    INSERT OR IGNORE INTO releases (id, title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, price, currency, external_links, visibility, published_at, published_to_gundb, published_to_ap, license, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(album.id, album.title, album.slug, album.artist_id, album.owner_id || album.artist_id, album.date, album.cover_path, album.genre, album.description, album.type, album.year, album.download, album.price, album.currency, album.external_links, album.visibility, album.published_at, album.published_to_gundb, album.published_to_ap, album.license, album.created_at);
                // 2. Migrate tracks
                const tracks = db.prepare("SELECT * FROM tracks WHERE album_id = ?").all(id);
                for (const track of tracks) {
                    db.prepare(`
                        INSERT OR IGNORE INTO release_tracks (release_id, track_id, title, artist_name, track_num, duration, file_path, price, currency, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(id, track.id, track.title, track.artist_name, track.track_num, track.duration, track.file_path, track.price, track.currency, track.created_at);
                }
                // 3. Mark as release in albums table
                db.prepare("UPDATE albums SET is_release = 1 WHERE id = ?").run(id);
            })();
        },
        deleteAlbum(id, keepTracks = false) {
            // Delete from release_tracks join table
            db.prepare("DELETE FROM release_tracks WHERE release_id = ?").run(id);
            // Delete associated unlock codes - VERY IMPORTANT to avoid FK constraint errors
            db.prepare("DELETE FROM unlock_codes WHERE release_id = ?").run(id);
            // Mark AP notes as deleted if they reference this album
            db.prepare("UPDATE ap_notes SET deleted_at = CURRENT_TIMESTAMP WHERE content_id = ? AND note_type = 'release'").run(id);
            if (keepTracks) {
                // Determine if we should unlink tracks or just nullify album_id
                // For now, nullify album_id (move to loose tracks)
                db.prepare("UPDATE tracks SET album_id = NULL WHERE album_id = ?").run(id);
            }
            else {
                // First delete associated tracks
                db.prepare("DELETE FROM tracks WHERE album_id = ?").run(id);
            }
            // Then delete the album
            db.prepare("DELETE FROM albums WHERE id = ?").run(id);
        },
        // Tracks
        getTracks(albumId, publicOnly = false) {
            if (albumId) {
                if (publicOnly) {
                    return getPublicTracksByAlbumStmt.all(albumId);
                }
                return getTracksByAlbumStmt.all(albumId);
            }
            if (publicOnly) {
                return getAllPublicTracksStmt.all();
            }
            return getAllTracksStmt.all();
        },
        getTracksByArtist(artistId, publicOnly = false) {
            if (publicOnly) {
                return getPublicTracksByArtistStmt.all(artistId, artistId);
            }
            return getTracksByArtistStmt.all(artistId, artistId);
        },
        getTracksByOwner(ownerId, publicOnly = false) {
            const sql = publicOnly
                ? `SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
                    COALESCE(ar_t.id, ar_a.id) as artist_id,
                    COALESCE(ar_t.name, ar_a.name) as artist_name, 
                    COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
                    COALESCE(t.owner_id, a.owner_id) as owner_id
                    FROM tracks t
                    LEFT JOIN albums a ON t.album_id = a.id
                    LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
                    LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
                    WHERE (t.owner_id = ? OR (t.owner_id IS NULL AND a.owner_id = ?)) AND (a.is_public = 1 OR t.album_id IS NULL)
                    ORDER BY a.title, t.track_num`
                : `SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
                    COALESCE(ar_t.id, ar_a.id) as artist_id,
                    COALESCE(ar_t.name, ar_a.name) as artist_name, 
                    COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
                    COALESCE(t.owner_id, a.owner_id) as owner_id
                    FROM tracks t
                    LEFT JOIN albums a ON t.album_id = a.id
                    LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
                    LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
                    WHERE (t.owner_id = ? OR (t.owner_id IS NULL AND a.owner_id = ?))
                    ORDER BY a.title, t.track_num`;
            return publicOnly ? db.prepare(sql).all(ownerId, ownerId) : db.prepare(sql).all(ownerId, ownerId);
        },
        getTracksByAlbumIds(albumIds) {
            if (albumIds.length === 0)
                return [];
            const CHUNK_SIZE = 900; // Safe limit for SQLite variables
            const allTracks = [];
            for (let i = 0; i < albumIds.length; i += CHUNK_SIZE) {
                const chunk = albumIds.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => '?').join(',');
                const tracks = db
                    .prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, 
                     COALESCE(ar_t.id, ar_a.id) as artist_id,
                     COALESCE(ar_t.name, ar_a.name) as artist_name, 
                     COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
                     COALESCE(t.owner_id, a.owner_id) as owner_id
             FROM tracks t
             LEFT JOIN albums a ON t.album_id = a.id
             LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
             LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
             WHERE t.album_id IN (${placeholders})
             ORDER BY t.album_id, t.track_num`)
                    .all(...chunk);
                allTracks.push(...tracks);
            }
            return allTracks;
        },
        getTrack(id) {
            return getTrackStmt.get(id);
        },
        getTracksByIds(ids) {
            if (ids.length === 0)
                return [];
            const CHUNK_SIZE = 900;
            const results = [];
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => "?").join(",");
                const rows = db.prepare(`SELECT t.*, a.title as album_title, a.download as album_download, a.visibility as album_visibility, a.price as album_price,
                    COALESCE(ar_t.id, ar_a.id) as artist_id,
                    COALESCE(ar_t.name, ar_a.name) as artist_name,
                    COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
                    COALESCE(t.owner_id, a.owner_id) as owner_id
                   FROM tracks t
                   LEFT JOIN albums a ON t.album_id = a.id
                   LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
                   LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
                   WHERE t.id IN (${placeholders})`).all(...chunk);
                results.push(...rows);
            }
            return results;
        },
        getTrackByPath(filePath) {
            return db
                .prepare(`SELECT t.*, a.title as album_title, 
                    COALESCE(ar_t.id, ar_a.id) as artist_id,
                    COALESCE(ar_t.name, ar_a.name) as artist_name,
                    COALESCE(t.owner_id, a.owner_id) as owner_id
                    FROM tracks t
                    LEFT JOIN albums a ON t.album_id = a.id
                    LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
                    LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
                    WHERE t.file_path = ?`)
                .get(filePath);
        },
        createTrack(track) {
            const result = db
                .prepare(`INSERT INTO tracks (title, album_id, artist_id, owner_id, track_num, duration, file_path, format, bitrate, sample_rate, price, currency, lossless_path, url, service, external_artwork, lyrics, hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(track.title, track.album_id, track.artist_id, track.owner_id || track.artist_id, // Backwards compatibility for single column
            track.track_num, track.duration, track.file_path, track.format, track.bitrate, track.sample_rate, track.price || 0, track.currency || 'ETH', track.lossless_path || null, track.url || null, track.service || null, track.external_artwork || null, track.lyrics || null, track.hash || null);
            const trackId = result.lastInsertRowid;
            const ownerId = track.owner_id || track.artist_id;
            if (ownerId) {
                this.addTrackOwner(trackId, ownerId);
            }
            return trackId;
        },
        updateTrackAlbum(id, albumId) {
            db.prepare("UPDATE tracks SET album_id = ? WHERE id = ?").run(albumId, id);
        },
        updateTrackOrder(id, trackNum) {
            db.prepare("UPDATE tracks SET track_num = ? WHERE id = ?").run(trackNum, id);
        },
        updateTrackArtist(id, artistId) {
            db.prepare("UPDATE tracks SET artist_id = ? WHERE id = ?").run(artistId, id);
        },
        getTrackByMetadata(title, artistId, albumId) {
            // Case-insensitive title match with artist/album check
            return db.prepare(`
                SELECT * FROM tracks 
                WHERE LOWER(title) = LOWER(?) 
                AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL))
                AND (album_id = ? OR (album_id IS NULL AND ? IS NULL))
            `).get(title, artistId, artistId, albumId, albumId);
        },
        updateTrackTitle(id, title) {
            db.prepare("UPDATE tracks SET title = ? WHERE id = ?").run(title, id);
        },
        updateTrackPath(id, filePath, albumId) {
            db.prepare("UPDATE tracks SET file_path = ?, album_id = ? WHERE id = ?").run(filePath, albumId, id);
        },
        updateTrackDuration(id, duration) {
            db.prepare("UPDATE tracks SET duration = ? WHERE id = ?").run(duration, id);
        },
        updateTrackPrice(id, price, price_usdc, currency = 'ETH') {
            db.prepare("UPDATE tracks SET price = ?, price_usdc = ?, currency = ? WHERE id = ?").run(price || 0, price_usdc || 0, currency, id);
        },
        updateTrackWaveform(id, waveform) {
            db.prepare("UPDATE tracks SET waveform = ? WHERE id = ?").run(waveform, id);
        },
        updateTrackLosslessPath(id, losslessPath) {
            db.prepare("UPDATE tracks SET lossless_path = ? WHERE id = ?").run(losslessPath, id);
        },
        updateTrackExternalArtwork(id, artworkPath) {
            db.prepare("UPDATE tracks SET external_artwork = ? WHERE id = ?").run(artworkPath, id);
        },
        updateTrackLyrics(id, lyrics) {
            db.prepare("UPDATE tracks SET lyrics = ? WHERE id = ?").run(lyrics, id);
        },
        updateTrackPathsPrefix(oldPrefix, newPrefix) {
            // Update file_path
            db.prepare(`
                UPDATE tracks 
                SET file_path = ? || SUBSTR(file_path, LENGTH(?) + 1)
                WHERE file_path = ? OR file_path LIKE ? || '/%'
            `).run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
            // Update lossless_path
            db.prepare(`
                UPDATE tracks 
                SET lossless_path = ? || SUBSTR(lossless_path, LENGTH(?) + 1)
                WHERE lossless_path = ? OR lossless_path LIKE ? || '/%'
            `).run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
        },
        deleteTrack(id, ownerId) {
            if (ownerId) {
                // If ownerId provided, only remove that owner's link
                this.removeTrackOwner(id, ownerId);
                // If owners still remain, don't delete the track record
                const remainingOwners = this.getTrackOwners(id);
                if (remainingOwners.length > 0)
                    return;
            }
            // Otherwise (no ownerId, or no remaining owners), delete everything
            db.prepare("DELETE FROM track_ownership WHERE track_id = ?").run(id);
            db.prepare("DELETE FROM release_tracks WHERE track_id = ?").run(id);
            db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
        },
        // Playlists
        getPlaylists(username, publicOnly = false) {
            if (username) {
                const sql = publicOnly
                    ? "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists WHERE username = ? AND is_public = 1 ORDER BY name"
                    : "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists WHERE username = ? ORDER BY name";
                return db.prepare(sql).all(username);
            }
            const sql = publicOnly
                ? "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists WHERE is_public = 1 ORDER BY name"
                : "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists ORDER BY name";
            return db.prepare(sql).all();
        },
        getPlaylist(id) {
            return db.prepare("SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at FROM playlists WHERE id = ?").get(id);
        },
        createPlaylist(name, username, description, isPublic = false) {
            const result = db
                .prepare("INSERT INTO playlists (name, username, description, is_public) VALUES (?, ?, ?, ?)")
                .run(name, username, description || null, isPublic ? 1 : 0);
            return result.lastInsertRowid;
        },
        updatePlaylistVisibility(id, isPublic) {
            db.prepare("UPDATE playlists SET is_public = ? WHERE id = ?").run(isPublic ? 1 : 0, id);
        },
        updatePlaylistCover(id, coverPath) {
            db.prepare("UPDATE playlists SET cover_path = ? WHERE id = ?").run(coverPath, id);
        },
        deletePlaylist(id) {
            db.prepare("DELETE FROM playlists WHERE id = ?").run(id);
        },
        getPlaylistTracks(playlistId) {
            return db
                .prepare(`SELECT t.*, a.title as album_title, 
                    COALESCE(ar_t.name, ar_a.name) as artist_name,
                    COALESCE(ar_t.id, ar_a.id) as artist_id
           FROM tracks t
           JOIN playlist_tracks pt ON t.id = pt.track_id
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           WHERE pt.playlist_id = ?
           ORDER BY pt.position`)
                .all(playlistId);
        },
        isTrackInPublicPlaylist(trackId) {
            const row = db.prepare(`
                SELECT count(*) as count 
                FROM playlist_tracks pt
                JOIN playlists p ON pt.playlist_id = p.id
                WHERE pt.track_id = ? AND p.is_public = 1
            `).get(trackId);
            return row.count > 0;
        },
        addTrackToPlaylist(playlistId, trackId) {
            const maxPos = db
                .prepare("SELECT MAX(position) as max FROM playlist_tracks WHERE playlist_id = ?")
                .get(playlistId);
            const position = (maxPos?.max || 0) + 1;
            db.prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)").run(playlistId, trackId, position);
        },
        removeTrackFromPlaylist(playlistId, trackId) {
            db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?").run(playlistId, trackId);
        },
        // Posts
        getPostsByArtist(artistId, publicOnly = false) {
            const sql = publicOnly
                ? `SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo
                FROM posts p
                JOIN artists a ON p.artist_id = a.id
                WHERE p.artist_id = ? AND p.visibility = 'public'
                ORDER BY p.created_at DESC`
                : `SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo
                FROM posts p
                JOIN artists a ON p.artist_id = a.id
                WHERE p.artist_id = ?
                ORDER BY p.created_at DESC`;
            return db.prepare(sql).all(artistId);
        },
        getPost(id) {
            return db.prepare(`
                SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo
                FROM posts p
                JOIN artists a ON p.artist_id = a.id
                WHERE p.id = ?
            `).get(id);
        },
        getPostBySlug(slug) {
            return db.prepare(`
                SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo
                FROM posts p
                JOIN artists a ON p.artist_id = a.id
                WHERE p.slug = ?
            `).get(slug);
        },
        createPost(artistId, content, visibility = 'public') {
            // Generate slug from content snippet or random
            const snippet = content.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const random = Math.random().toString(36).substring(2, 8);
            const slug = snippet ? `${snippet}-${random}` : `post-${random}`;
            const publishedAt = visibility === 'public' || visibility === 'unlisted' ? new Date().toISOString() : null;
            const result = db.prepare("INSERT INTO posts (artist_id, content, slug, visibility, published_at) VALUES (?, ?, ?, ?, ?)").run(artistId, content, slug, visibility, publishedAt);
            return result.lastInsertRowid;
        },
        deletePost(id) {
            db.prepare("DELETE FROM posts WHERE id = ?").run(id);
        },
        updatePostVisibility(id, visibility) {
            const publishedAt = visibility === 'public' || visibility === 'unlisted' ? new Date().toISOString() : null;
            if (publishedAt) {
                db.prepare("UPDATE posts SET visibility = ?, published_at = ? WHERE id = ?").run(visibility, publishedAt, id);
            }
            else {
                db.prepare("UPDATE posts SET visibility = ? WHERE id = ?").run(visibility, id);
            }
        },
        updatePost(id, content, visibility) {
            if (content !== undefined && visibility !== undefined) {
                const publishedAt = visibility === 'public' || visibility === 'unlisted' ? new Date().toISOString() : null;
                // Only update published_at if becoming public/unlisted, or if it was null? 
                // Simple logic: if setting to public/unlisted, update the timestamp to NOW to ensure unique AP ID.
                // If setting to private, it stays as is (or null? doesn't matter much as it won't be federated).
                // Let's explicitly update it if visibility is provided and matches public/unlisted.
                if (publishedAt) {
                    db.prepare("UPDATE posts SET content = ?, visibility = ?, published_at = ? WHERE id = ?").run(content, visibility, publishedAt, id);
                }
                else {
                    db.prepare("UPDATE posts SET content = ?, visibility = ? WHERE id = ?").run(content, visibility, id);
                }
            }
            else if (content !== undefined) {
                db.prepare("UPDATE posts SET content = ? WHERE id = ?").run(content, id);
            }
            else if (visibility !== undefined) {
                const publishedAt = visibility === 'public' || visibility === 'unlisted' ? new Date().toISOString() : null;
                if (publishedAt) {
                    db.prepare("UPDATE posts SET visibility = ?, published_at = ? WHERE id = ?").run(visibility, publishedAt, id);
                }
                else {
                    db.prepare("UPDATE posts SET visibility = ? WHERE id = ?").run(visibility, id);
                }
            }
        },
        // Stats
        async getStats(artistId) {
            const artistFilter = artistId ? `WHERE id = ${artistId}` : "";
            const albumFilter = artistId ? `WHERE artist_id = ${artistId}` : "";
            const trackFilter = artistId ? `WHERE artist_id = ${artistId}` : "";
            const publicAlbumFilter = artistId ? `WHERE artist_id = ${artistId} AND is_public = 1` : "WHERE is_public = 1";
            const artists = db.prepare(`SELECT COUNT(*) as count FROM artists ${artistFilter}`).get().count;
            const albums = db.prepare(`SELECT COUNT(*) as count FROM albums ${albumFilter}`).get().count;
            const tracks = db.prepare(`SELECT COUNT(*) as count FROM tracks ${trackFilter}`).get().count;
            const publicAlbums = db.prepare(`SELECT COUNT(*) as count FROM albums ${publicAlbumFilter}`).get().count;
            // Total users count is only relevant for global admin
            const totalUsers = artistId ? 0 : db.prepare("SELECT COUNT(*) as count FROM admin").get()?.count || 0;
            const storageStats = db.prepare(`SELECT SUM(duration) as total_duration FROM tracks ${trackFilter}`).get();
            const estimatedSize = (storageStats.total_duration || 0) * 40 * 1024; // Very rough estimate
            // Genre count
            const genreQuery = artistId
                ? `SELECT genre FROM albums WHERE artist_id = ${artistId} AND genre IS NOT NULL AND genre != ''`
                : `SELECT genre FROM albums WHERE genre IS NOT NULL AND genre != ''`;
            const allGenres = db.prepare(genreQuery).all();
            const genreSet = new Set();
            allGenres.forEach(row => {
                row.genre.split(',').forEach(g => {
                    const trimmed = g.trim();
                    if (trimmed)
                        genreSet.add(trimmed.toLowerCase());
                });
            });
            const genresCount = genreSet.size;
            return {
                artists,
                albums,
                tracks,
                totalTracks: tracks,
                publicAlbums,
                totalUsers,
                storageUsed: estimatedSize,
                networkSites: artistId ? 0 : db.prepare("SELECT COUNT(*) as count FROM remote_actors WHERE type = 'Service'").get().count,
                genresCount
            };
        },
        getPublicTracksCount() {
            const result = db.prepare(`
                SELECT COUNT(t.id) as count
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                WHERE a.visibility = 'public'
            `).get();
            return result.count;
        },
        // Search
        search(query, publicOnly = false) {
            const likeQuery = `%${query}%`;
            const artists = db
                .prepare("SELECT * FROM artists WHERE name LIKE ?")
                .all(likeQuery);
            const albumsSql = publicOnly
                ? `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.visibility IN ('public', 'unlisted') AND (a.title LIKE ? OR ar.name LIKE ?)`
                : `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.title LIKE ? OR ar.name LIKE ?`;
            const albums = db.prepare(albumsSql).all(likeQuery, likeQuery);
            const tracksSql = publicOnly
                ? `SELECT t.*, a.title as album_title, COALESCE(ar_t.name, ar_a.name) as artist_name, COALESCE(ar_t.id, ar_a.id) as artist_id
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           WHERE a.visibility IN ('public', 'unlisted') AND (t.title LIKE ? OR ar_t.name LIKE ? OR ar_a.name LIKE ?)`
                : `SELECT t.*, a.title as album_title, COALESCE(ar_t.name, ar_a.name) as artist_name, COALESCE(ar_t.id, ar_a.id) as artist_id
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           WHERE t.title LIKE ? OR ar_t.name LIKE ? OR ar_a.name LIKE ?`;
            const tracks = db.prepare(tracksSql).all(likeQuery, likeQuery, likeQuery);
            return { artists, albums, tracks };
        },
        // Settings
        getSetting(key) {
            const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
            return row?.value;
        },
        setSetting(key, value) {
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
        },
        getAllSettings() {
            const rows = db.prepare("SELECT key, value FROM settings").all();
            const settings = {};
            for (const row of rows) {
                settings[row.key] = row.value;
            }
            return settings;
        },
        // Play History
        recordPlay(trackId, playedAt) {
            if (playedAt) {
                db.prepare("INSERT INTO play_history (track_id, played_at) VALUES (?, ?)").run(trackId, playedAt);
            }
            else {
                db.prepare("INSERT INTO play_history (track_id) VALUES (?)").run(trackId);
            }
        },
        getRecentPlays(limit = 50) {
            return db.prepare(`
                SELECT 
                    ph.id,
                    ph.track_id,
                    t.title as track_title,
                    COALESCE(ar_t.name, ar_a.name) as artist_name,
                    al.title as album_title,
                    ph.played_at
                FROM play_history ph
                LEFT JOIN tracks t ON ph.track_id = t.id
                LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
                LEFT JOIN albums al ON t.album_id = al.id
                LEFT JOIN artists ar_a ON al.artist_id = ar_a.id
                ORDER BY ph.played_at DESC
                LIMIT ?
            `).all(limit);
        },
        getTopTracks(limit = 20, days = 30, filter = 'all') {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - days);
            const dateStr = dateLimit.toISOString();
            let filterClause = '';
            if (filter === 'releases')
                filterClause = 'AND al.is_release = 1';
            else if (filter === 'library')
                filterClause = 'AND (al.is_release = 0 OR al.id IS NULL)';
            // Bolt ⚡: Use CTE to aggregate plays from history table FIRST (filtering by date immediately).
            // This avoids joining the potentially large play_history table with tracks for every single track row.
            return db.prepare(`
                WITH RecentPlays AS (
                    SELECT track_id, COUNT(*) as play_count
                    FROM play_history ph
                    JOIN tracks t ON ph.track_id = t.id
                    LEFT JOIN albums al ON t.album_id = al.id
                    WHERE ph.played_at >= ?
                    ${filterClause}
                    GROUP BY track_id
                )
                SELECT 
                    t.*,
                    al.title as album_title,
                    COALESCE(ar_t.name, ar_a.name) as artist_name,
                    COALESCE(ar_t.id, ar_a.id) as artist_id,
                    rp.play_count
                FROM RecentPlays rp
                JOIN tracks t ON t.id = rp.track_id
                LEFT JOIN albums al ON t.album_id = al.id
                LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
                LEFT JOIN artists ar_a ON al.artist_id = ar_a.id
                ORDER BY rp.play_count DESC
                LIMIT ?
            `).all(dateStr, limit);
        },
        getTopArtists(limit = 10, days = 30, filter = 'all') {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - days);
            const dateStr = dateLimit.toISOString();
            let filterClause = '';
            if (filter === 'releases')
                filterClause = 'AND al.is_release = 1';
            else if (filter === 'library')
                filterClause = 'AND (al.is_release = 0 OR al.id IS NULL)';
            // Bolt ⚡: Optimization: Aggregate plays by artist from history table before joining artist details.
            return db.prepare(`
                WITH RecentPlays AS (
                    SELECT COALESCE(t.artist_id, al.artist_id) as final_artist_id, COUNT(*) as play_count
                    FROM play_history ph
                    JOIN tracks t ON ph.track_id = t.id
                    LEFT JOIN albums al ON t.album_id = al.id
                    WHERE ph.played_at >= ?
                    ${filterClause}
                    GROUP BY final_artist_id
                )
                SELECT 
                    ar.*,
                    SUM(rp.play_count) as play_count
                FROM RecentPlays rp
                JOIN artists ar ON ar.id = rp.final_artist_id
                GROUP BY ar.id
                ORDER BY play_count DESC
                LIMIT ?
            `).all(dateStr, limit);
        },
        getListeningStats() {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            // Bolt ⚡: Optimized to avoid full table scan on play_history.
            // Split into separate queries to use specific indexes for each metric.
            // 1. Total Plays (COUNT(*)) - Fast with index
            const totalPlays = db.prepare("SELECT COUNT(*) as count FROM play_history").get().count;
            // Bolt ⚡: Optimized to condense index scans.
            // 2, 3, 4. Plays Today/Week/Month (Range Scan Index) - Uses idx_play_history_played_at
            const playsStats = db.prepare(`
                SELECT
                    COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsToday,
                    COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsThisWeek,
                    COUNT(*) as playsThisMonth
                FROM play_history
                WHERE played_at >= ?
            `).get(todayStart, weekStart, monthStart, monthStart);
            const { playsToday, playsThisWeek, playsThisMonth } = playsStats;
            // 5. Unique Tracks (Index Scan) - Uses idx_play_history_track_id
            const uniqueTracks = db.prepare("SELECT COUNT(DISTINCT track_id) as count FROM play_history").get().count;
            // 6. Total Listening Time (Group By + Join)
            // Group by track_id first to reduce join cardinality from N (history) to M (unique tracks)
            const timeRow = db.prepare(`
                SELECT COALESCE(SUM(ph.cnt * t.duration), 0) as totalListeningTime
                FROM (
                    SELECT track_id, COUNT(*) as cnt
                    FROM play_history
                    GROUP BY track_id
                ) ph
                JOIN tracks t ON ph.track_id = t.id
            `).get();
            return {
                totalPlays,
                totalListeningTime: Math.round(timeRow.totalListeningTime),
                uniqueTracks,
                playsToday,
                playsThisWeek,
                playsThisMonth,
            };
        },
        // Unlock Codes
        createUnlockCode(code, releaseId) {
            db.prepare("INSERT INTO unlock_codes (code, release_id) VALUES (?, ?)").run(code, releaseId || null);
        },
        validateUnlockCode(code) {
            const row = db.prepare("SELECT * FROM unlock_codes WHERE code = ?").get(code);
            if (!row)
                return { valid: false, isUsed: false };
            return { valid: true, releaseId: row.release_id, isUsed: !!row.is_used };
        },
        redeemUnlockCode(code) {
            db.prepare("UPDATE unlock_codes SET is_used = 1, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?").run(code);
        },
        listUnlockCodes(releaseId) {
            if (releaseId) {
                return db.prepare("SELECT * FROM unlock_codes WHERE release_id = ? ORDER BY created_at DESC").all(releaseId);
            }
            return db.prepare("SELECT * FROM unlock_codes ORDER BY created_at DESC").all();
        },
        // ActivityPub Notes
        createApNote(artistId, noteId, noteType, contentId, contentSlug, contentTitle) {
            const result = db.prepare(`
                INSERT OR REPLACE INTO ap_notes (artist_id, note_id, note_type, content_id, content_slug, content_title, deleted_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL)
            `).run(artistId, noteId, noteType, contentId, contentSlug, contentTitle);
            return Number(result.lastInsertRowid);
        },
        getApNotes(artistId, includeDeleted = false) {
            const query = includeDeleted
                ? "SELECT * FROM ap_notes WHERE artist_id = ? ORDER BY published_at DESC"
                : "SELECT * FROM ap_notes WHERE artist_id = ? AND deleted_at IS NULL ORDER BY published_at DESC";
            return db.prepare(query).all(artistId);
        },
        getApNote(noteId) {
            return db.prepare("SELECT * FROM ap_notes WHERE note_id = ?").get(noteId);
        },
        markApNoteDeleted(noteId) {
            db.prepare("UPDATE ap_notes SET deleted_at = CURRENT_TIMESTAMP WHERE note_id = ?").run(noteId);
        },
        deleteApNote(noteId) {
            db.prepare("DELETE FROM ap_notes WHERE note_id = ?").run(noteId);
        },
        // Gun Users
        syncGunUser(pub, epub, alias, avatar) {
            db.prepare("INSERT OR REPLACE INTO gun_users (pub, epub, alias, avatar) VALUES (?, ?, ?, ?)").run(pub, epub, alias, avatar || null);
        },
        getGunUser(pub) {
            return db.prepare("SELECT pub, epub, alias, avatar FROM gun_users WHERE pub = ?").get(pub);
        },
        // ActivityPub Remote Items
        upsertRemoteActor(actor) {
            const b = (val) => {
                if (val === null || val === undefined)
                    return null;
                if (typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint' || Buffer.isBuffer(val))
                    return val;
                return String(val);
            };
            const existing = this.getRemoteActor(actor.uri);
            const isFollowed = actor.is_followed !== undefined ? (actor.is_followed ? 1 : 0) : (existing?.is_followed ? 1 : 0);
            db.prepare(`
                INSERT INTO remote_actors (uri, type, username, name, summary, icon_url, inbox_url, outbox_url, is_followed, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(uri) DO UPDATE SET
                    username=excluded.username,
                    name=excluded.name,
                    summary=excluded.summary,
                    icon_url=excluded.icon_url,
                    inbox_url=excluded.inbox_url,
                    outbox_url=excluded.outbox_url,
                    is_followed=excluded.is_followed,
                    last_seen=CURRENT_TIMESTAMP
            `).run(b(actor.uri), b(actor.type), b(actor.username), b(actor.name), b(actor.summary), b(actor.icon_url), b(actor.inbox_url), b(actor.outbox_url), isFollowed);
        },
        getRemoteActor(uri) {
            return db.prepare("SELECT * FROM remote_actors WHERE uri = ?").get(uri);
        },
        getRemoteActors() {
            const rows = db.prepare("SELECT * FROM remote_actors ORDER BY last_seen DESC").all();
            return rows.map(r => ({ ...r, is_followed: !!r.is_followed }));
        },
        getFollowedActors() {
            const rows = db.prepare("SELECT * FROM remote_actors WHERE is_followed = 1 ORDER BY last_seen DESC").all();
            return rows.map(r => ({ ...r, is_followed: !!r.is_followed }));
        },
        unfollowActor(uri) {
            db.prepare("UPDATE remote_actors SET is_followed = 0 WHERE uri = ?").run(uri);
        },
        upsertRemoteContent(content) {
            const b = (val) => {
                if (val === null || val === undefined)
                    return null;
                if (typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint' || Buffer.isBuffer(val))
                    return val;
                return String(val);
            };
            db.prepare(`
                INSERT INTO remote_content (ap_id, actor_uri, type, title, content, url, cover_url, stream_url, artist_name, album_name, duration, published_at, received_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(ap_id) DO UPDATE SET
                    title=excluded.title,
                    content=excluded.content,
                    url=excluded.url,
                    cover_url=excluded.cover_url,
                    stream_url=excluded.stream_url,
                    artist_name=excluded.artist_name,
                    album_name=excluded.album_name,
                    duration=excluded.duration,
                    published_at=excluded.published_at,
                    received_at=CURRENT_TIMESTAMP
            `).run(b(content.ap_id), b(content.actor_uri), b(content.type), b(content.title), b(content.content), b(b(content.url)), b(content.cover_url), b(content.stream_url), b(content.artist_name), b(content.album_name), b(content.duration), b(content.published_at));
        },
        saveRemoteActor(actor) {
            db.prepare(`
                INSERT INTO remote_actors (uri, type, username, name, summary, icon_url, inbox_url, outbox_url, is_followed, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(uri) DO UPDATE SET
                    type=excluded.type,
                    username=excluded.username,
                    name=excluded.name,
                    summary=excluded.summary,
                    icon_url=excluded.icon_url,
                    inbox_url=excluded.inbox_url,
                    outbox_url=excluded.outbox_url,
                    last_seen=CURRENT_TIMESTAMP
            `).run(actor.uri, actor.type || 'Person', actor.username || null, actor.name || null, actor.summary || null, actor.icon_url || null, actor.inbox_url || null, actor.outbox_url || null, actor.is_followed ? 1 : 0);
        },
        getRemoteTracks() {
            const rows = db.prepare(`
                SELECT rc.*
                FROM remote_content rc
                JOIN remote_actors ra ON rc.actor_uri = ra.uri
                WHERE rc.type = \'release\' AND ra.is_followed = 1
                ORDER BY rc.published_at DESC
            `).all();
            return rows;
        },
        getRemotePosts() {
            const rows = db.prepare(`
                SELECT rc.*
                FROM remote_content rc
                JOIN remote_actors ra ON rc.actor_uri = ra.uri
                WHERE rc.type = \'post\' AND ra.is_followed = 1
                ORDER BY rc.published_at DESC
            `).all();
            return rows;
        },
        getRemoteTrack(apIdOrSlug) {
            return db.prepare("SELECT * FROM remote_content WHERE ap_id = ? OR url LIKE ?").get(apIdOrSlug, `%${apIdOrSlug}`);
        },
        getRemoteContent(apId) {
            return db.prepare("SELECT * FROM remote_content WHERE ap_id = ?").get(apId);
        },
        saveRemotePost(post) {
            db.prepare(`
                INSERT INTO remote_content (ap_id, actor_uri, type, title, content, url, cover_url, stream_url, artist_name, album_name, duration, published_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ap_id) DO UPDATE SET
                    title=excluded.title,
                    content=excluded.content,
                    url=excluded.url,
                    cover_url=excluded.cover_url,
                    stream_url=excluded.stream_url,
                    artist_name=excluded.artist_name,
                    album_name=excluded.album_name,
                    duration=excluded.duration
            `).run(post.ap_id, post.actor_uri, post.type, post.title || null, post.content || null, post.url || null, post.cover_url || null, post.stream_url || null, post.artist_name || null, post.album_name || null, post.duration || null, post.published_at || null);
        },
        deleteRemotePost(apId) {
            db.prepare("DELETE FROM remote_content WHERE ap_id = ?").run(apId);
        },
        deleteRemoteContent(apId) {
            db.prepare("DELETE FROM remote_content WHERE ap_id = ?").run(apId);
        },
        // Starred Items (Subsonic)
        starItem(username, itemType, itemId) {
            db.prepare(`
                INSERT OR IGNORE INTO starred_items (username, item_type, item_id)
                VALUES (?, ?, ?)
            `).run(username, itemType, itemId);
        },
        unstarItem(username, itemType, itemId) {
            db.prepare("DELETE FROM starred_items WHERE username = ? AND item_type = ? AND item_id = ?").run(username, itemType, itemId);
        },
        getStarredItems(username, itemType) {
            if (itemType) {
                return db.prepare("SELECT item_type, item_id, created_at FROM starred_items WHERE username = ? AND item_type = ?").all(username, itemType);
            }
            return db.prepare("SELECT item_type, item_id, created_at FROM starred_items WHERE username = ?").all(username);
        },
        isStarred(username, itemType, itemId) {
            const row = db.prepare("SELECT 1 FROM starred_items WHERE username = ? AND item_type = ? AND item_id = ?").get(username, itemType, itemId);
            return !!row;
        },
        // Likes
        addLike(actorUri, objectType, objectId) {
            db.prepare(`
                INSERT OR IGNORE INTO likes (remote_actor_fid, object_type, object_id)
                VALUES (?, ?, ?)
            `).run(actorUri, objectType, objectId);
        },
        removeLike(actorUri, objectType, objectId) {
            db.prepare(`
                DELETE FROM likes WHERE remote_actor_fid = ? AND object_type = ? AND object_id = ?
            `).run(actorUri, objectType, objectId);
        },
        getLikesCount(objectType, objectId) {
            const row = db.prepare(`
                SELECT COUNT(*) as count FROM likes WHERE object_type = ? AND object_id = ?
            `).get(objectType, objectId);
            return row ? row.count : 0;
        },
        hasLiked(actorUri, objectType, objectId) {
            const row = db.prepare(`
                SELECT 1 FROM likes WHERE remote_actor_fid = ? AND object_type = ? AND object_id = ?
            `).get(actorUri, objectType, objectId);
            return !!row;
        },
        // Play Queue (Subsonic)
        savePlayQueue(username, trackIds, current, positionMs) {
            db.transaction(() => {
                db.prepare("INSERT OR REPLACE INTO play_queue_state (username, current_track_id, position_ms, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)")
                    .run(username, current || null, positionMs || 0);
                db.prepare("DELETE FROM play_queue_tracks WHERE username = ?").run(username);
                const insertTrack = db.prepare("INSERT INTO play_queue_tracks (username, track_id, position) VALUES (?, ?, ?)");
                for (let i = 0; i < trackIds.length; i++) {
                    insertTrack.run(username, trackIds[i], i);
                }
            })();
        },
        getPlayQueue(username) {
            const state = db.prepare("SELECT current_track_id, position_ms FROM play_queue_state WHERE username = ?").get(username);
            if (!state)
                return { trackIds: [], current: null, positionMs: 0 };
            const tracks = db.prepare("SELECT track_id FROM play_queue_tracks WHERE username = ? ORDER BY position ASC").all(username);
            return {
                trackIds: tracks.map(t => t.track_id),
                current: state.current_track_id,
                positionMs: state.position_ms
            };
        },
        // Ratings & Bookmarks
        setItemRating(username, itemType, itemId, rating) {
            db.prepare(`
                INSERT INTO item_ratings (username, item_type, item_id, rating)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(username, item_type, item_id) DO UPDATE SET rating = excluded.rating
            `).run(username, itemType, itemId, rating);
        },
        getItemRating(username, itemType, itemId) {
            const row = db.prepare("SELECT rating FROM item_ratings WHERE username = ? AND item_type = ? AND item_id = ?").get(username, itemType, itemId);
            return row?.rating || 0;
        },
        createBookmark(username, trackId, positionMs, comment) {
            // Subsonic: Only one bookmark per track per user? 
            // Actually, spec says "Retrieves all bookmarks for this user".
            // Some implementations use one per track.
            db.prepare(`
                INSERT INTO bookmarks (username, track_id, position_ms, comment, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(username, trackId, positionMs, comment || null);
        },
        getBookmarks(username) {
            return db.prepare("SELECT * FROM bookmarks WHERE username = ? ORDER BY updated_at DESC").all(username);
        },
        deleteBookmark(username, trackId) {
            db.prepare("DELETE FROM bookmarks WHERE username = ? AND track_id = ?").run(username, trackId);
        },
        getBookmark(username, trackId) {
            return db.prepare("SELECT * FROM bookmarks WHERE username = ? AND track_id = ?").get(username, trackId);
        },
        // Ownership & Deduplication
        addTrackOwner(trackId, ownerId) {
            db.prepare("INSERT OR IGNORE INTO track_ownership (track_id, owner_id) VALUES (?, ?)").run(trackId, ownerId);
        },
        removeTrackOwner(trackId, ownerId) {
            db.prepare("DELETE FROM track_ownership WHERE track_id = ? AND owner_id = ?").run(trackId, ownerId);
        },
        addAlbumOwner(albumId, ownerId) {
            db.prepare("INSERT OR IGNORE INTO album_ownership (album_id, owner_id) VALUES (?, ?)").run(albumId, ownerId);
        },
        removeAlbumOwner(albumId, ownerId) {
            db.prepare("DELETE FROM album_ownership WHERE album_id = ? AND owner_id = ?").run(albumId, ownerId);
        },
        getTrackByHash(hash) {
            return db.prepare("SELECT * FROM tracks WHERE hash = ?").get(hash);
        },
        getTrackOwners(trackId) {
            const rows = db.prepare("SELECT owner_id FROM track_ownership WHERE track_id = ?").all(trackId);
            return rows.map(r => r.owner_id);
        },
        getAlbumOwners(albumId) {
            const rows = db.prepare("SELECT owner_id FROM album_ownership WHERE album_id = ?").all(albumId);
            return rows.map(r => r.owner_id);
        },
    };
}
