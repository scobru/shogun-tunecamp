const fs = require('fs');

const file = 'webapp/src/pages/ArtistDetails.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\/\/ @ts-ignore\s+if \(artistData\.albums\) \{\s+\/\/ @ts-ignore\s+setAlbums\(artistData\.albums\);\s+\} else \{\s+\/\/ Fallback to fetching all \(deprecated logic, but keeping for safety if backend older\)\s+API\.getAlbums\(\)\.then\(allAlbums => \{\s+setAlbums\(allAlbums\.filter\(a => a\.artistId === artistData\.id\)\);\s+\}\);\s+\}/, 'if (artistData.albums) {\n                    setAlbums(artistData.albums);\n                }');

fs.writeFileSync(file, content);
