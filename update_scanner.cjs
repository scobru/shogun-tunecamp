const fs = require('fs');

const path = 'src/server/scanner.ts';
let code = fs.readFileSync(path, 'utf8');

const target = `                if (tracks.length === 0) continue;

                // Collect unique artist IDs from tracks
                const artistIds = [...new Set(tracks.map(t => t.artist_id).filter(id => id !== null))];

                if (artistIds.length === 1) {
                    const artistId = artistIds[0];
                    if (artistId !== null) { // Type check, though filter ensures it
                        console.log(\`  [Scanner] Fixing orphan album "\${orphan.title}" (ID \${orphan.id}) -> Setting artist to ID \${artistId}\`);
                        this.database.updateAlbumArtist(orphan.id, artistId);
                    }
                }`;

const replacement = `                if (tracks.length === 0) {
                    if (!orphan.is_release) {
                        console.log(\`  [Scanner] Deleting empty implicit library album "\${orphan.title}" (ID \${orphan.id})\`);
                        this.database.deleteAlbum(orphan.id);
                    }
                    continue;
                }

                // Collect unique artist IDs from tracks
                const artistIds = [...new Set(tracks.map(t => t.artist_id).filter(id => id !== null))];

                if (artistIds.length === 1) {
                    const artistId = artistIds[0];
                    if (artistId !== null) { // Type check, though filter ensures it
                        console.log(\`  [Scanner] Fixing orphan album "\${orphan.title}" (ID \${orphan.id}) -> Setting artist to ID \${artistId}\`);
                        this.database.updateAlbumArtist(orphan.id, artistId);
                        this.database.updateAlbumOwner(orphan.id, artistId);
                        this.database.addAlbumOwner(orphan.id, artistId);
                    }
                }`;

if (!code.includes(target)) {
    console.error("Target not found!");
}

code = code.replace(target, replacement);
fs.writeFileSync(path, code);
