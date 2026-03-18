const fs = require('fs');

const file = 'webapp/src/pages/ArtistDetails.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldCode = `                // Use albums directly from artist response if available
                // @ts-ignore
                if (artistData.albums) {
                    // @ts-ignore
                    setAlbums(artistData.albums);
                } else {
                    // Fallback to fetching all (deprecated logic, but keeping for safety if backend older)
                    API.getAlbums().then(allAlbums => {
                         setAlbums(allAlbums.filter(a => a.artistId === artistData.id));
                    });
                }`;

const newCode = `                // Use albums directly from artist response if available
                if (artistData.albums) {
                    setAlbums(artistData.albums);
                }`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(file, content);
