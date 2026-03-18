const fs = require('fs');

const path = 'src/server/database.ts';
let code = fs.readFileSync(path, 'utf8');

const target = `        updateAlbumArtist(id: number, artistId: number): void {
            db.prepare("UPDATE albums SET artist_id = ? WHERE id = ?").run(artistId, id);
        },`;
const replacement = `        updateAlbumArtist(id: number, artistId: number): void {
            db.prepare("UPDATE albums SET artist_id = ? WHERE id = ?").run(artistId, id);
        },

        updateAlbumOwner(id: number, ownerId: number): void {
            db.prepare("UPDATE albums SET owner_id = ? WHERE id = ?").run(ownerId, id);
        },`;

code = code.replace(target, replacement);
fs.writeFileSync(path, code);
