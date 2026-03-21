
import { Router } from 'express';
import { create } from 'xmlbuilder2';
import md5 from 'md5';
import path from 'path';
import fs from 'fs-extra';
import { resolveSafePath } from '../../utils/fileUtils.js';
import type { DatabaseService } from '../database';
import type { AuthService } from '../auth';
import type { GunDBService } from '../gundb';

// Types for Subsonic
interface SubsonicContext {
    db: DatabaseService;
    auth: AuthService;
    musicDir: string;
    gundbService?: GunDBService;
}

export const createSubsonicRouter = (context: SubsonicContext): Router => {
    const router = Router();
    const { db, auth } = context;

    // --- Helpers ---

    /**
     * Ensures that a query parameter is a string, even if multiple values were provided as an array.
     */
    const ensureString = (val: any): string | undefined => {
        if (typeof val === 'string') return val;
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val[0];
        return undefined;
    };

    const sanitizeJsonKeys = (obj: any): any => {
        if (Array.isArray(obj)) {
            return obj.map(item => sanitizeJsonKeys(item));
        } else if (obj !== null && typeof obj === 'object') {
            const newObj: any = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const newKey = key.startsWith('@') ? key.substring(1) : key;
                    newObj[newKey] = sanitizeJsonKeys(obj[key]);
                }
            }
            return newObj;
        }
        return obj;
    };

    const getContentType = (format?: string | null): string => {
        if (!format) return 'audio/mpeg';
        const f = format.toLowerCase();
        if (f === 'flac') return 'audio/flac';
        if (f === 'ogg') return 'audio/ogg';
        if (f === 'wav') return 'audio/wav';
        if (f === 'm4a' || f === 'mp4') return 'audio/mp4';
        return 'audio/mpeg';
    };

    const sendResponse = (res: any, req: any, data: object, status = 'ok') => {
        const isJson = ensureString(req.query.f) === 'json';
        const version = '1.16.1';

        // OpenSubsonic: Add header to identify as compatible server
        res.set('X-OpenSubsonic-Server', 'Tunecamp/2.0');

        if (isJson) {
            res.json({
                'subsonic-response': {
                    status,
                    version,
                    openSubsonic: true,
                    ...sanitizeJsonKeys(data) // Remove XML attribute decorators
                }
            });
            return;
        }

        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', { 
                xmlns: 'http://subsonic.org/restapi', 
                status, 
                version,
                openSubsonic: 'true' 
            });

        if (Object.keys(data).length > 0) {
            doc.ele(data);
        }

        const xml = doc.end({ prettyPrint: true });
        res.set('Content-Type', 'text/xml');
        res.send(xml);
    };

    const sendXML = (res: any, data: object) => {
        // Legacy helper, now redirects to sendResponse with default req (XML)
        sendResponse(res, { query: {} }, data);
    };

    const sendError = (res: any, req: any, code: number, message: string) => {
        const isJson = ensureString(req.query.f) === 'json';
        const status = 'failed';
        const version = '1.16.1';

        // OpenSubsonic: Add header even on errors
        res.set('X-OpenSubsonic-Server', 'Tunecamp/2.0');

        if (isJson) {
            res.json({
                'subsonic-response': {
                    status,
                    version,
                    openSubsonic: true,
                    error: { code: String(code), message }
                }
            });
            return;
        }

        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', { 
                xmlns: 'http://subsonic.org/restapi', 
                status, 
                version,
                openSubsonic: 'true' 
            })
            .ele('error', { code: String(code), message }).up();

        const xml = doc.end({ prettyPrint: true });
        res.set('Content-Type', 'text/xml');
        res.send(xml);
    };

    // --- Formatters ---

    const formatTrack = (track: any, username: string) => {
        const id = `tr_${track.id}`;
        return {
            '@id': id,
            '@parent': track.album_id ? `al_${track.album_id}` : undefined,
            '@isDir': 'false',
            '@title': track.title,
            '@album': track.album_title,
            '@artist': track.artist_name,
            '@track': track.track_num,
            '@year': track.year,
            '@genre': track.genre,
            '@coverArt': track.album_id ? `al_${track.album_id}` : id,
            '@size': 0,
            '@contentType': getContentType(track.format),
            '@suffix': track.format || 'mp3',
            '@duration': Math.floor(track.duration || 0),
            '@bitRate': track.bitrate ? Math.round(track.bitrate / 1000) : 128,
            '@path': track.file_path,
            '@albumId': track.album_id ? `al_${track.album_id}` : undefined,
            '@artistId': track.artist_id ? `ar_${track.artist_id}` : undefined,
            '@type': 'music',
            '@starred': db.isStarred(username, 'track', id) ? track.created_at || new Date().toISOString() : undefined,
            '@userRating': db.getItemRating(username, 'track', id) || undefined,
            '@averageRating': db.getItemRating(username, 'track', id) || undefined // Simplified
        };
    };

    const formatAlbum = (album: any, username: string) => {
        const id = `al_${album.id}`;
        const artistId = album.artist_id ? `ar_${album.artist_id}` : undefined;
        return {
            '@id': id,
            '@name': album.title,
            '@artist': album.artist_name || 'Unknown Artist',
            '@artistId': artistId,
            '@isDir': 'true',
            '@coverArt': id,
            '@songCount': undefined as number | undefined,
            '@duration': undefined as number | undefined,
            '@created': album.created_at,
            '@year': album.date ? new Date(album.date).getFullYear() : undefined,
            '@genre': album.genre,
            '@starred': db.isStarred(username, 'album', id) ? album.created_at || new Date().toISOString() : undefined,
            '@userRating': db.getItemRating(username, 'album', id) || undefined
        };
    };

    const formatArtist = (artist: any, username: string) => {
        const id = `ar_${artist.id}`;
        return {
            '@id': id,
            '@name': artist.name,
            '@coverArt': id,
            '@artistImageUrl': `/rest/getCoverArt.view?id=${id}`,
            '@albumCount': undefined as number | undefined,
            '@starred': db.isStarred(username, 'artist', id) ? artist.created_at || new Date().toISOString() : undefined,
            '@userRating': db.getItemRating(username, 'artist', id) || undefined
        };
    };

    // --- Middleware ---

    router.use(async (req, res, next) => {
        // Handle discovery at root /rest (empty path since it's mounted at /rest)
        if (req.path === '/') {
            return sendResponse(res, req, { message: 'Tunecamp Subsonic API' });
        }

        const u = ensureString(req.query.u);
        const p = ensureString(req.query.p);
        const t = ensureString(req.query.t);
        const s = ensureString(req.query.s);

        if (!u) return sendError(res, req, 10, 'Parameter u is missing');

        let authorized = false;

        // 1. Password Auth (Legacy)
        if (p) {
            let password = p;
            if (p.startsWith('enc:')) {
                const hex = p.substring(4);
                password = Buffer.from(hex, 'hex').toString('utf8');
            }

            const result = await auth.authenticateUser(u, password);
            if (result && result.success) authorized = true;
        }

        // 2. Token Auth (s = salt, t = md5(password + salt))
        if (!authorized && t && s) {
            const tokenValid = await auth.verifySubsonicToken(u, t, s);
            if (tokenValid) authorized = true;
        }

        if (!authorized) {
            return sendError(res, req, 40, 'Wrong username or password');
        }

        (req as any).user = { username: u };
        console.log(`[Subsonic Request] ${req.method} ${req.path} ?`, req.query);
        next();
    });

    // --- Endpoints ---

    router.get('/ping.view', (req, res) => {
        sendResponse(res, req, {});
    });

    router.get('/getLicense.view', (req, res) => {
        sendResponse(res, req, {
            license: {
                '@valid': 'true',
                '@email': 'user@example.com',
                '@licenseExpires': '2099-01-01T00:00:00'
            }
        });
    });

    // Compatibility for clients checking API
    // DSub often checks these
    router.post('/ping.view', (req, res) => { sendResponse(res, req, {}); });
    router.post('/getLicense.view', (req, res) => {
        sendResponse(res, req, {
            license: {
                '@valid': 'true',
                '@email': 'user@example.com',
                '@licenseExpires': '2099-01-01T00:00:00'
            }
        });
    });

    // --- Browsing ---

    const getMusicFolders = (req: any, res: any) => {
        sendResponse(res, req, {
            musicFolders: {
                musicFolder: [
                    { '@id': 1, '@name': 'Music' }
                ]
            }
        });
    };

    const getIndexes = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const artists = db.getArtists();
        const indexes: Record<string, any[]> = {};

        // Group by first letter
        artists.forEach(artist => {
            let char = artist.name.charAt(0).toUpperCase();
            if (!/[A-Z]/.test(char)) char = '#';
            if (!indexes[char]) indexes[char] = [];

            indexes[char].push(formatArtist(artist, username));
        });

        const sortedKeys = Object.keys(indexes).sort();
        const indexNodes = sortedKeys.map(key => ({
            '@name': key,
            artist: indexes[key]
        }));

        sendResponse(res, req, {
            indexes: {
                '@lastModified': new Date().getTime(),
                '@ignoredArticles': 'The El La Los Las Le Les',
                index: indexNodes
            }
        });
    };

    const getMusicDirectory = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        // Handle Artist -> Return Albums
        if (id.startsWith('ar_')) {
            const artistId = parseInt(id.substring(3));
            const artist = db.getArtist(artistId);
            if (!artist) return sendError(res, req, 70, 'Artist not found');

            const albums = db.getAlbumsByArtist(artistId);

            const directory = {
                '@id': id,
                '@name': artist.name,
                '@parent': '1',
                child: albums.map(album => formatAlbum(album, username))
            };
            return sendResponse(res, req, { directory });
        }

        if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            const album = db.getAlbum(albumId);
            if (!album) return sendError(res, req, 70, 'Album not found');

            const tracks = db.getTracks(albumId);

            const directory = {
                '@id': id,
                '@name': album.title,
                '@parent': album.artist_id ? `ar_${album.artist_id}` : '1',
                child: tracks.map((track: any) => formatTrack(track, username))
            };
            return sendResponse(res, req, { directory });
        }

        return sendError(res, req, 70, 'Directory not found');
    };

    router.get('/getMusicFolders.view', getMusicFolders);
    router.post('/getMusicFolders.view', getMusicFolders);

    router.get('/getIndexes.view', getIndexes);
    router.post('/getIndexes.view', getIndexes);

    router.get('/getMusicDirectory.view', getMusicDirectory);
    router.post('/getMusicDirectory.view', getMusicDirectory);

    // --- Media ---

    const getCoverArt = async (req: any, res: any) => {
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        let imagePath: string | null = null;

        if (id.startsWith('ar_')) {
            const artistId = parseInt(id.substring(3));
            const artist = db.getArtist(artistId);
            if (artist?.photo_path) {
                imagePath = artist.photo_path;
            } else if (artist) {
                // Fallback to first album cover
                const albums = db.getAlbumsByArtist(artistId, false);
                for (const album of albums) {
                    if (album.cover_path) {
                        imagePath = album.cover_path;
                        break;
                    }
                }
            }
        } else if (id.startsWith('al_')) {
            const album = db.getAlbum(parseInt(id.substring(3)));
            if (album?.cover_path) imagePath = album.cover_path;
        } else if (id.startsWith('tr_')) {
            const track = db.getTrack(parseInt(id.substring(3)));
            if (track) {
                if (track.external_artwork) {
                    if (track.external_artwork.startsWith('http')) {
                        return res.redirect(track.external_artwork);
                    }
                    imagePath = track.external_artwork;
                } else if (track.album_id) {
                    const album = db.getAlbum(track.album_id);
                    if (album?.cover_path) imagePath = album.cover_path;
                }
            }
        }

        if (imagePath) {
            const fullPath = resolveSafePath(context.musicDir, imagePath);
            if (fullPath) {
                if (await fs.pathExists(fullPath)) {
                    return res.sendFile(fullPath);
                }
            } else {
                 return sendError(res, req, 70, 'Cover art not found'); // Prevent fallback logic
            }
        }

        // Return 404 or a placeholder? Subsonic spec says generic image or 404.
        // Let's return 404 for now, client handles fallback.
        // Or send empty?
        return sendError(res, req, 70, 'Cover art not found'); // Code 70 = Data not found
    };

    const stream = async (req: any, res: any) => {
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        if (id.startsWith('tr_')) {
            const track = db.getTrack(parseInt(id.substring(3)));
            if (track && track.file_path) {
                const fullPath = resolveSafePath(context.musicDir, track.file_path);
                if (fullPath && await fs.pathExists(fullPath)) {
                    // res.sendFile handles Range headers automatically
                    return res.sendFile(fullPath);
                }
            }
        }

        return sendError(res, req, 70, 'File not found');
    };

    const scrobble = async (req: any, res: any) => {
        const { id, submission: subRaw, timestamp } = req.query as any;
        const submission = ensureString(subRaw);
        const ids = Array.isArray(id) ? id : [id];
        const timestamps = Array.isArray(timestamp) ? timestamp : [timestamp];

        // Subsonic spec: submission defaults to true if not provided
        const isSubmission = submission !== 'false';

        for (let i = 0; i < ids.length; i++) {
            const currentId = ids[i];
            if (!currentId || !currentId.startsWith('tr_')) continue;

            const trackId = parseInt(currentId.substring(3));
            if (isNaN(trackId)) continue;

            if (isSubmission) {
                // Actual Scrobble
                // Subsonic spec defines timestamp as epoch seconds
                const ts = parseInt(timestamps[i]);
                const timestampMs = !isNaN(ts) ? ts * 1000 : Date.now();

                let playedAt;
                try {
                    playedAt = new Date(timestampMs).toISOString();
                } catch (e) {
                    playedAt = new Date().toISOString();
                }

                console.log(`[Subsonic] Scrobbling track ${trackId} at ${playedAt}`);
                db.recordPlay(trackId, playedAt);

                // Increment GunDB play count if it's a public release
                try {
                    const track = db.getTrack(trackId);
                    if (track && track.album_id) {
                        const album = db.getAlbum(track.album_id);
                        if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                            // GunDB uses slug-based tracking for releases
                            if (context.gundbService) {
                                context.gundbService.incrementTrackPlayCount(album.slug, String(track.id));
                            }
                        }
                    }
                } catch (e) {
                    console.error('[Subsonic] Failed to increment GunDB play count:', e);
                }
            } else {
                // Now Playing notification
                console.log(`[Subsonic] Now playing track ${trackId}`);
            }
        }

        sendResponse(res, req, {});
    };

    router.get('/getCoverArt.view', getCoverArt);
    router.post('/getCoverArt.view', getCoverArt);

    router.get('/stream.view', stream);
    router.post('/stream.view', stream);

    router.get('/scrobble.view', scrobble);
    router.post('/scrobble.view', scrobble);

    const getArtist = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        const artistIdStr = id.startsWith('ar_') ? id.substring(3) : id;
        const artistId = parseInt(artistIdStr);
        if (!isNaN(artistId)) {
            const artist = db.getArtist(artistId);
            if (artist) {
                const albums = db.getAlbumsByArtist(artistId);
                const artistData = formatArtist(artist, username);
                artistData['@albumCount'] = albums.length;
                
                sendResponse(res, req, {
                    artist: {
                        ...artistData,
                        album: albums.map(a => formatAlbum(a, username))
                    }
                });
                return;
            }
        }
        return sendError(res, req, 70, 'Artist not found');
    };

    const getAlbum = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        const albumId = parseInt(id.startsWith('al_') ? id.substring(3) : id);
        if (!isNaN(albumId)) {
            const album = db.getAlbum(albumId);
            if (album) {
                const tracks = db.getTracks(albumId);
                const albumData = formatAlbum(album, username);
                albumData['@songCount'] = tracks.length;
                albumData['@duration'] = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

                sendResponse(res, req, {
                    album: {
                        ...albumData,
                        song: tracks.map((track: any) => formatTrack(track, username))
                    }
                });
                return;
            }
        }
        return sendError(res, req, 70, 'Album not found');
    };

    router.get('/getArtist.view', getArtist);
    router.post('/getArtist.view', getArtist);

    router.get('/getAlbum.view', getAlbum);
    router.post('/getAlbum.view', getAlbum);

    const getGenres = (req: any, res: any) => {
        const albums = db.getAlbums(false);
        const genreMap: Record<string, { count: number, songCount: number }> = {};

        albums.forEach(album => {
            if (album.genre) {
                const genres = album.genre.split(',').map(g => g.trim());
                genres.forEach(g => {
                    if (!genreMap[g]) genreMap[g] = { count: 0, songCount: 0 };
                    genreMap[g].count++;
                    // Estimate song count per genre
                    const tracks = db.getTracks(album.id);
                    genreMap[g].songCount += tracks.length;
                });
            }
        });

        const genres = Object.keys(genreMap).sort().map(name => ({
            '@value': name,
            '@songCount': genreMap[name].songCount,
            '@albumCount': genreMap[name].count
        }));

        sendResponse(res, req, {
            genres: {
                genre: genres
            }
        });
    };

    router.get('/getGenres.view', getGenres);
    router.post('/getGenres.view', getGenres);

    // Helper to build starred data
    const buildStarredData = (username: string) => {
        const starred = db.getStarredItems(username);

        const artistIds: number[] = [];
        const albumIds: number[] = [];
        const trackIds: number[] = [];

        for (const item of starred) {
            if (item.item_type === 'artist') {
                artistIds.push(parseInt(item.item_id.startsWith('ar_') ? item.item_id.substring(3) : item.item_id));
            } else if (item.item_type === 'album') {
                albumIds.push(parseInt(item.item_id.startsWith('al_') ? item.item_id.substring(3) : item.item_id));
            } else if (item.item_type === 'track') {
                trackIds.push(parseInt(item.item_id.startsWith('tr_') ? item.item_id.substring(3) : item.item_id));
            }
        }

        const artistsList = db.getArtistsByIds([...new Set(artistIds)]);
        const albumsList = db.getAlbumsByIds([...new Set(albumIds)]);
        const tracksList = db.getTracksByIds([...new Set(trackIds)]);

        const artistMap = new Map(artistsList.map(a => [a.id, a]));
        const albumMap = new Map(albumsList.map(a => [a.id, a]));
        const trackMap = new Map(tracksList.map(t => [t.id, t]));

        const artists: any[] = [];
        const albums: any[] = [];
        const songs: any[] = [];

        for (const item of starred) {
            const id = parseInt(item.item_id.startsWith(item.item_type.substring(0, 2) + '_') ? item.item_id.substring(3) : item.item_id);
            if (item.item_type === 'artist') {
                const artist = artistMap.get(id);
                if (artist) artists.push(formatArtist(artist, username));
            } else if (item.item_type === 'album') {
                const album = albumMap.get(id);
                if (album) albums.push(formatAlbum(album, username));
            } else if (item.item_type === 'track') {
                const track = trackMap.get(id);
                if (track) songs.push(formatTrack(track, username));
            }
        }
        return { artists, albums, songs };
    };

    const getStarred = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const { artists, albums, songs } = buildStarredData(username);
        sendResponse(res, req, {
            starred: { artist: artists, album: albums, song: songs }
        });
    };

    const getStarred2 = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const { artists, albums, songs } = buildStarredData(username);
        sendResponse(res, req, {
            starred2: { artist: artists, album: albums, song: songs }
        });
    };

    router.get('/getStarred.view', getStarred);
    router.get('/getStarred2.view', getStarred2);
    router.post('/getStarred.view', getStarred);
    router.post('/getStarred2.view', getStarred2);

    const getSong = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        const trackId = parseInt(id.startsWith('tr_') ? id.substring(3) : id);
        const track = db.getTrack(trackId);

        if (!track) return sendError(res, req, 70, 'Song not found');

        sendResponse(res, req, {
            song: formatTrack(track, username)
        });
    };

    router.get('/getSong.view', getSong);
    router.post('/getSong.view', getSong);

    const getArtists = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const artists = db.getArtists();
        const indexes: Record<string, any[]> = {};

        artists.forEach(artist => {
            let char = artist.name.charAt(0).toUpperCase();
            if (!/[A-Z]/.test(char)) char = '#';
            if (!indexes[char]) indexes[char] = [];

            const artistAlbums = db.getAlbumsByArtist(artist.id);

            const artistData = formatArtist(artist, username);
            (artistData as any)['@albumCount'] = artistAlbums.length;
            indexes[char].push(artistData);
        });

        const sortedKeys = Object.keys(indexes).sort();
        const indexNodes = sortedKeys.map(key => ({
            '@name': key,
            artist: indexes[key]
        }));

        sendResponse(res, req, {
            artists: {
                '@ignoredArticles': 'The El La Los Las Le Les',
                index: indexNodes
            }
        });
    };

    router.get('/getArtists.view', getArtists);
    router.post('/getArtists.view', getArtists);

    const getAlbumList = (req: any, res: any) => {
        const type = ensureString(req.query.type);
        const size = ensureString(req.query.size);
        const offset = ensureString(req.query.offset);
        const genre = ensureString(req.query.genre);
        const limit = parseInt(size || '') || 10;
        const skip = parseInt(offset || '') || 0;
        const isV2 = req.path.includes('getAlbumList2');

        let albums = db.getAlbums(false);

        if (type === 'random') {
            albums = albums.sort(() => Math.random() - 0.5);
        } else if (type === 'newest') {
            albums = albums.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } else if (type === 'alphabeticalByArtist') {
            albums = albums.sort((a, b) => (a.artist_name || '').localeCompare(b.artist_name || ''));
        } else if (type === 'alphabeticalByName') {
            albums = albums.sort((a, b) => a.title.localeCompare(b.title));
        } else if (type === 'frequent' || type === 'recent') {
            albums = albums.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } else if (type === 'starred') {
            const username = (req as any).user?.username || 'admin';
            const starredItems = db.getStarredItems(username, 'album');
            const starredIds = new Set(starredItems.map(s => s.item_id));
            albums = albums.filter(a => starredIds.has(`al_${a.id}`));
        } else if (type === 'byGenre' && genre) {
            albums = albums.filter(a => a.genre && a.genre.toLowerCase().includes(genre.toLowerCase()));
        } else if (type === 'byYear') {
            const fromYear = ensureString(req.query.fromYear);
            const toYear = ensureString(req.query.toYear);
            const from = parseInt(fromYear || '') || 0;
            const to = parseInt(toYear || '') || 9999;
            albums = albums.filter(a => {
                const year = a.date ? new Date(a.date).getFullYear() : 0;
                return year >= from && year <= to;
            }).sort((a, b) => {
                const ya = a.date ? new Date(a.date).getFullYear() : 0;
                const yb = b.date ? new Date(b.date).getFullYear() : 0;
                return ya - yb;
            });
        }

        const username = (req as any).user?.username || 'admin';
        const paginated = albums.slice(skip, skip + limit);

        const wrapperKey = isV2 ? 'albumList2' : 'albumList';
        sendResponse(res, req, {
            [wrapperKey]: {
                album: paginated.map(album => formatAlbum(album, username))
            }
        });
    };

    router.get('/getAlbumList.view', getAlbumList);
    router.get('/getAlbumList2.view', getAlbumList);
    router.post('/getAlbumList.view', getAlbumList);
    router.post('/getAlbumList2.view', getAlbumList);

    const getRandomSongs = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const size = ensureString(req.query.size);
        const limit = parseInt(size || '') || 10;

        const allTracks = db.getTracks(undefined, true);
        const randomTracks = allTracks.sort(() => Math.random() - 0.5).slice(0, limit);

        sendResponse(res, req, {
            randomSongs: {
                song: randomTracks.map(track => formatTrack(track, username))
            }
        });
    };

    router.get('/getRandomSongs.view', getRandomSongs);
    router.post('/getRandomSongs.view', getRandomSongs);

    const search = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const query = ensureString(req.query.query);
        const artistCount = ensureString(req.query.artistCount);
        const albumCount = ensureString(req.query.albumCount);
        const songCount = ensureString(req.query.songCount);
        if (!query) return sendError(res, req, 10, 'Missing query parameter');

        const results = db.search(query, true);

        const aLimit = parseInt(artistCount || '') || 20;
        const alLimit = parseInt(albumCount || '') || 20;
        const sLimit = parseInt(songCount || '') || 50;

        const responseData: any = {
            searchResult2: {
                artist: results.artists.slice(0, aLimit).map(a => formatArtist(a, username)),
                album: results.albums.slice(0, alLimit).map(a => formatAlbum(a, username)),
                song: results.tracks.slice(0, sLimit).map(t => formatTrack(t, username))
            }
        };

        // For search3, just change the root element name if needed
        if (req.path.includes('search3')) {
            responseData.searchResult3 = responseData.searchResult2;
            delete responseData.searchResult2;
        }

        sendResponse(res, req, responseData);
    };

    router.get('/search.view', search);
    router.get('/search2.view', search);
    router.get('/search3.view', search);
    router.post('/search.view', search);
    router.post('/search2.view', search);
    router.post('/search3.view', search);

    const getPlaylists = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const playlists = db.getPlaylists(username);
        sendResponse(res, req, {
            playlists: {
                playlist: playlists.map(p => ({
                    '@id': `pl_${p.id}`,
                    '@name': p.name,
                    '@owner': p.username,
                    '@public': p.isPublic ? 'true' : 'false',
                    '@created': p.created_at,
                    '@songCount': db.getPlaylistTracks(p.id).length
                }))
            }
        });
    };

    router.get('/getPlaylists.view', getPlaylists);
    router.post('/getPlaylists.view', getPlaylists);

    const getPlaylist = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing id parameter');

        const playlistId = parseInt(id.startsWith('pl_') ? id.substring(3) : id);
        const playlist = db.getPlaylist(playlistId);
        if (!playlist) return sendError(res, req, 70, 'Playlist not found');

        const tracks = db.getPlaylistTracks(playlistId);

        sendResponse(res, req, {
            playlist: {
                '@id': `pl_${playlist.id}`,
                '@name': playlist.name,
                '@owner': playlist.username,
                '@public': playlist.isPublic ? 'true' : 'false',
                '@created': playlist.created_at,
                '@songCount': tracks.length,
                entry: tracks.map(t => formatTrack(t, username))
            }
        });
    };

    router.get('/getPlaylist.view', getPlaylist);
    router.post('/getPlaylist.view', getPlaylist);

    const getUser = (req: any, res: any) => {
        const username = ensureString(req.query.username);
        const requestedUser = username || (req as any).user.username;
        sendResponse(res, req, {
            user: {
                username: requestedUser,
                email: 'admin@tunecamp.local',
                scrobblingEnabled: true,
                adminRole: true,
                settingsRole: true,
                downloadRole: true,
                uploadRole: true,
                playlistRole: true,
                coverArtRole: true,
                commentRole: true,
                podcastRole: true,
                streamRole: true,
                jukeboxRole: true,
                shareRole: true,
                videoConversionRole: true,
                avatarLastChanged: new Date().toISOString()
            }
        });
    };

    router.get('/getUser.view', getUser);
    router.post('/getUser.view', getUser);

    const getAvatar = async (req: any, res: any) => {
        return sendError(res, req, 70, 'Avatar not found');
    };

    router.get('/getAvatar.view', getAvatar);
    router.post('/getAvatar.view', getAvatar);

    // Alias getTopSongs to getRandomSongs for now
    router.get('/getTopSongs.view', getRandomSongs);
    router.post('/getTopSongs.view', getRandomSongs);



    const getPlayQueue = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const pq = db.getPlayQueue(username);
        
        const entry: any[] = [];
        for (const trackId of pq.trackIds) {
            const track = db.getTrack(parseInt(trackId));
            if (track) {
                entry.push(formatTrack(track, username));
            }
        }
        
        const response: any = {
            playQueue: {
                entry
            }
        };
        
        if (pq.current) response.playQueue['@current'] = `tr_${pq.current}`;
        if (pq.positionMs) response.playQueue['@position'] = pq.positionMs;
        
        sendResponse(res, req, response);
    };
    
    router.get('/getPlayQueue.view', getPlayQueue);
    router.post('/getPlayQueue.view', getPlayQueue);

    // --- Star / Unstar ---

    const incrementGunDBLikeCount = (trackIdStr: string) => {
        if (!context.gundbService) return;
        try {
            const trackId = parseInt(trackIdStr.startsWith('tr_') ? trackIdStr.substring(3) : trackIdStr);
            if (isNaN(trackId)) return;
            const track = db.getTrack(trackId);
            if (track && track.album_id) {
                const album = db.getAlbum(track.album_id);
                if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                    context.gundbService.incrementTrackLikeCount(album.slug, String(track.id));
                }
            }
        } catch (e) {
            console.error('[Subsonic] Failed to increment GunDB like count:', e);
        }
    };

    const decrementGunDBLikeCount = (trackIdStr: string) => {
        if (!context.gundbService) return;
        try {
            const trackId = parseInt(trackIdStr.startsWith('tr_') ? trackIdStr.substring(3) : trackIdStr);
            if (isNaN(trackId)) return;
            const track = db.getTrack(trackId);
            if (track && track.album_id) {
                const album = db.getAlbum(track.album_id);
                if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                    context.gundbService.decrementTrackLikeCount(album.slug, String(track.id));
                }
            }
        } catch (e) {
            console.error('[Subsonic] Failed to decrement GunDB like count:', e);
        }
    };

    const setGunDBRating = (trackIdStr: string, rating: number) => {
        if (!context.gundbService) return;
        try {
            const trackId = parseInt(trackIdStr.startsWith('tr_') ? trackIdStr.substring(3) : trackIdStr);
            if (isNaN(trackId)) return;
            const track = db.getTrack(trackId);
            if (track && track.album_id) {
                const album = db.getAlbum(track.album_id);
                if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                    context.gundbService.setTrackRating(album.slug, String(track.id), rating);
                }
            }
        } catch (e) {
            console.error('[Subsonic] Failed to set GunDB rating:', e);
        }
    };

    const star = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const { id, albumId, artistId } = req.query as any;

        const ids = id ? (Array.isArray(id) ? id : [id]) : [];
        const albumIds = albumId ? (Array.isArray(albumId) ? albumId : [albumId]) : [];
        const artistIds = artistId ? (Array.isArray(artistId) ? artistId : [artistId]) : [];

        for (const i of ids) {
            db.starItem(username, 'track', i);
            incrementGunDBLikeCount(i);
        }
        for (const i of albumIds) db.starItem(username, 'album', i);
        for (const i of artistIds) db.starItem(username, 'artist', i);

        sendResponse(res, req, {});
    };

    const unstar = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const { id, albumId, artistId } = req.query as any;

        const ids = id ? (Array.isArray(id) ? id : [id]) : [];
        const albumIds = albumId ? (Array.isArray(albumId) ? albumId : [albumId]) : [];
        const artistIds = artistId ? (Array.isArray(artistId) ? artistId : [artistId]) : [];

        for (const i of ids) {
            db.unstarItem(username, 'track', i);
            decrementGunDBLikeCount(i);
        }
        for (const i of albumIds) db.unstarItem(username, 'album', i);
        for (const i of artistIds) db.unstarItem(username, 'artist', i);

        sendResponse(res, req, {});
    };

    router.get('/star.view', star);
    router.post('/star.view', star);
    router.get('/unstar.view', unstar);
    router.post('/unstar.view', unstar);

    const setRating = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        const rating = ensureString(req.query.rating);
        if (!id) return sendError(res, req, 10, 'Missing id');
        
        const r = parseInt(rating || '');
        if (isNaN(r) || r < 0 || r > 5) return sendError(res, req, 10, 'Invalid rating (0-5)');

        let type = 'track';
        if (id.startsWith('al_')) type = 'album';
        if (id.startsWith('ar_')) type = 'artist';

        db.setItemRating(username, type, id, r);

        if (type === 'track') {
            setGunDBRating(id, r);
        }

        sendResponse(res, req, {});
    };

    router.get('/setRating.view', setRating);
    router.post('/setRating.view', setRating);

    // --- Playlist Management ---

    const createPlaylistEndpoint = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const playlistId = ensureString(req.query.playlistId);
        const name = ensureString(req.query.name);
        const { songId } = req.query as any;

        let plId: number;

        if (playlistId) {
            // Update existing playlist
            plId = parseInt(playlistId.startsWith('pl_') ? playlistId.substring(3) : playlistId);
            const existing = db.getPlaylist(plId);
            if (!existing) return sendError(res, req, 70, 'Playlist not found');
            if (existing.username !== username && username !== 'admin') return sendError(res, req, 50, 'User is not being authorized for the given operation');
        } else if (name) {
            // Create new
            plId = db.createPlaylist(name, username);
        } else {
            return sendError(res, req, 10, 'Missing name or playlistId');
        }

        // Add songs if provided
        if (songId) {
            const songIds = Array.isArray(songId) ? songId : [songId];
            for (const sid of songIds) {
                const trackId = parseInt(sid.startsWith('tr_') ? sid.substring(3) : sid);
                if (!isNaN(trackId)) {
                    try { db.addTrackToPlaylist(plId, trackId); } catch (e) { /* ignore duplicates */ }
                }
            }
        }

        // Return the playlist
        const playlist = db.getPlaylist(plId);
        const tracks = db.getPlaylistTracks(plId);

        sendResponse(res, req, {
            playlist: {
                '@id': `pl_${plId}`,
                '@name': playlist?.name || name,
                '@owner': playlist?.username || username,
                '@public': playlist?.isPublic ? 'true' : 'false',
                '@songCount': tracks.length,
                '@created': playlist?.created_at,
                entry: tracks.map(t => formatTrack(t, username))
            }
        });
    };

    router.get('/createPlaylist.view', createPlaylistEndpoint);
    router.post('/createPlaylist.view', createPlaylistEndpoint);

    const updatePlaylistEndpoint = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const playlistId = ensureString(req.query.playlistId);
        const name = ensureString(req.query.name);
        const isPublicStr = ensureString(req.query.public);
        const { songIdToAdd, songIndexToRemove } = req.query as any;
        if (!playlistId) return sendError(res, req, 10, 'Missing playlistId');

        const plId = parseInt(playlistId.startsWith('pl_') ? playlistId.substring(3) : playlistId);
        const existing = db.getPlaylist(plId);
        if (!existing) return sendError(res, req, 70, 'Playlist not found');
        if (existing.username !== username && username !== 'admin') return sendError(res, req, 50, 'User is not being authorized for the given operation');

        // Rename if specified (direct SQL since no dedicated method)
        if (name) {
            db.db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, plId);
        }

        // Update visibility
        if (isPublicStr !== undefined) {
            db.updatePlaylistVisibility(plId, isPublicStr === 'true');
        }

        // Add songs
        if (songIdToAdd) {
            const toAdd = Array.isArray(songIdToAdd) ? songIdToAdd : [songIdToAdd];
            for (const sid of toAdd) {
                const trackId = parseInt(sid.startsWith('tr_') ? sid.substring(3) : sid);
                if (!isNaN(trackId)) {
                    try { db.addTrackToPlaylist(plId, trackId); } catch (e) { /* ignore */ }
                }
            }
        }

        // Remove songs by index
        if (songIndexToRemove !== undefined) {
            const indices = Array.isArray(songIndexToRemove) ? songIndexToRemove.map(Number) : [Number(songIndexToRemove)];
            const currentTracks = db.getPlaylistTracks(plId);
            // Remove in reverse order to maintain indices
            const sorted = indices.sort((a, b) => b - a);
            for (const idx of sorted) {
                if (idx >= 0 && idx < currentTracks.length) {
                    db.removeTrackFromPlaylist(plId, currentTracks[idx].id);
                }
            }
        }

        sendResponse(res, req, {});
    };

    router.get('/updatePlaylist.view', updatePlaylistEndpoint);
    router.post('/updatePlaylist.view', updatePlaylistEndpoint);

    const deletePlaylistEndpoint = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing id');

        const plId = parseInt(id.startsWith('pl_') ? id.substring(3) : id);
        const existing = db.getPlaylist(plId);
        if (!existing) return sendError(res, req, 70, 'Playlist not found');
        if (existing.username !== username && username !== 'admin') return sendError(res, req, 50, 'User is not being authorized for the given operation');

        db.deletePlaylist(plId);
        sendResponse(res, req, {});
    };

    router.get('/deletePlaylist.view', deletePlaylistEndpoint);
    router.post('/deletePlaylist.view', deletePlaylistEndpoint);

    // --- Download ---

    const download = async (req: any, res: any) => {
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        if (id.startsWith('tr_')) {
            const track = db.getTrack(parseInt(id.substring(3)));
            if (track && track.file_path) {
                const fullPath = resolveSafePath(context.musicDir, track.file_path);
                if (fullPath && await fs.pathExists(fullPath)) {
                    const filename = path.basename(track.file_path);
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    return res.sendFile(fullPath);
                }
            }
        }

        return sendError(res, req, 70, 'File not found');
    };

    router.get('/download.view', download);
    router.post('/download.view', download);

    // --- Now Playing ---

    const getNowPlaying = (req: any, res: any) => {
        sendResponse(res, req, { nowPlaying: { entry: [] } });
    };

    router.get('/getNowPlaying.view', getNowPlaying);
    router.post('/getNowPlaying.view', getNowPlaying);

    // --- Artist Info ---

    const getArtistInfo = (req: any, res: any) => {
        const id = ensureString(req.query.id);
        const count = ensureString(req.query.count);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        const isV2 = req.path.includes('getArtistInfo2');
        let artistId: number | undefined;

        if (id.startsWith('ar_')) {
            artistId = parseInt(id.substring(3));
        } else {
            artistId = parseInt(id);
        }

        const artist = artistId ? db.getArtist(artistId) : undefined;
        if (!artist) return sendError(res, req, 70, 'Artist not found');

        const wrapperKey = isV2 ? 'artistInfo2' : 'artistInfo';
        sendResponse(res, req, {
            [wrapperKey]: {
                '@biography': artist.bio || '',
                '@musicBrainzId': '',
                '@lastFmUrl': '',
                '@smallImageUrl': `/api/artists/${artist.id}/cover`,
                '@mediumImageUrl': `/api/artists/${artist.id}/cover`,
                '@largeImageUrl': `/api/artists/${artist.id}/cover`,
                similarArtist: []
            }
        });
    };

    router.get('/getArtistInfo.view', getArtistInfo);
    router.get('/getArtistInfo2.view', getArtistInfo);
    router.post('/getArtistInfo.view', getArtistInfo);
    router.post('/getArtistInfo2.view', getArtistInfo);

    // --- Album Info ---

    const getAlbumInfo = (req: any, res: any) => {
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        const isV2 = req.path.includes('getAlbumInfo2');
        let albumId: number | undefined;

        if (id.startsWith('al_')) {
            albumId = parseInt(id.substring(3));
        } else {
            albumId = parseInt(id);
        }

        const album = albumId ? db.getAlbum(albumId) : undefined;
        if (!album) return sendError(res, req, 70, 'Album not found');

        const wrapperKey = isV2 ? 'albumInfo2' : 'albumInfo';
        sendResponse(res, req, {
            [wrapperKey]: {
                '@notes': album.description || '',
                '@musicBrainzId': '',
                '@lastFmUrl': '',
                '@smallImageUrl': `/api/albums/${album.id}/cover`,
                '@mediumImageUrl': `/api/albums/${album.id}/cover`,
                '@largeImageUrl': `/api/albums/${album.id}/cover`
            }
        });
    };

    router.get('/getAlbumInfo.view', getAlbumInfo);
    router.get('/getAlbumInfo2.view', getAlbumInfo);
    router.post('/getAlbumInfo.view', getAlbumInfo);
    router.post('/getAlbumInfo2.view', getAlbumInfo);

    // --- Similar Songs ---

    const getSimilarSongs = (req: any, res: any) => {
        const id = ensureString(req.query.id);
        const count = ensureString(req.query.count);
        const limit = parseInt(count || '') || 10;
        const isV2 = req.path.includes('getSimilarSongs2');

        let similarTracks: any[] = [];
        
        if (id) {
            const trackId = parseInt(id.startsWith('tr_') ? id.substring(3) : id);
            const track = db.getTrack(trackId);
            if (track && track.album_id) {
                const album = db.getAlbum(track.album_id);
                if (album && album.genre) {
                    // Find other public albums with the same genre
                    const genre = album.genre.split(',')[0].trim().toLowerCase();
                    const allAlbums = db.getAlbums(true);
                    const similarAlbums = allAlbums.filter(a => 
                        a.id !== album.id && 
                        a.genre && 
                        a.genre.toLowerCase().includes(genre)
                    );
                    
                    // Get some tracks from these albums
                    for (const simAlbum of similarAlbums.sort(() => Math.random() - 0.5).slice(0, 5)) {
                        const albumTracks = db.getTracks(simAlbum.id);
                        if (albumTracks.length > 0) {
                            // Take a random track from this similar album
                            similarTracks.push(albumTracks[Math.floor(Math.random() * albumTracks.length)]);
                        }
                    }
                }
            }
        }
        
        // Return random songs as a fallback for similar songs if we didn't find enough
        if (similarTracks.length < limit) {
            const allTracks = db.getTracks(undefined, true);
            const existingIds = new Set(similarTracks.map(t => t.id));
            const randomTracks = allTracks.filter(t => !existingIds.has(t.id)).sort(() => Math.random() - 0.5).slice(0, limit - similarTracks.length);
            similarTracks = [...similarTracks, ...randomTracks];
        } else {
            similarTracks = similarTracks.slice(0, limit);
        }

        const wrapperKey = isV2 ? 'similarSongs2' : 'similarSongs';
        sendResponse(res, req, {
            [wrapperKey]: {
                song: similarTracks.map(track => ({
                    '@id': `tr_${track.id}`,
                    '@title': track.title,
                    '@album': track.album_title,
                    '@artist': track.artist_name,
                    '@duration': Math.floor(track.duration || 0),
                    '@coverArt': `al_${track.album_id}`,
                    '@albumId': `al_${track.album_id}`,
                    '@artistId': `ar_${track.artist_id}`,
                    '@suffix': track.format || 'mp3',
                    '@contentType': getContentType(track.format),
                    '@bitRate': track.bitrate ? Math.round(track.bitrate / 1000) : 128
                }))
            }
        });
    };

    router.get('/getSimilarSongs.view', getSimilarSongs);
    router.get('/getSimilarSongs2.view', getSimilarSongs);
    router.post('/getSimilarSongs.view', getSimilarSongs);
    router.post('/getSimilarSongs2.view', getSimilarSongs);

    // --- Lyrics ---

    const getLyrics = (req: any, res: any) => {
        const artist = ensureString(req.query.artist);
        const title = ensureString(req.query.title);

        // Try to find the track by artist and title
        if (artist && title) {
            const results = db.search(title, false);
            const match = results.tracks.find(t =>
                t.title.toLowerCase() === title.toLowerCase() &&
                (t.artist_name || '').toLowerCase() === artist.toLowerCase()
            );
            if (match && match.lyrics) {
                sendResponse(res, req, {
                    lyrics: {
                        '@artist': artist,
                        '@title': title,
                        '#': match.lyrics
                    }
                });
                return;
            }
        }

        // No lyrics found
        sendResponse(res, req, { lyrics: {} });
    };

    router.get('/getLyrics.view', getLyrics);
    router.post('/getLyrics.view', getLyrics);

    // --- Save/Get Play Queue ---

    const savePlayQueue = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const current = ensureString(req.query.current);
        const position = ensureString(req.query.position);
        const { id } = req.query as any;

        const ids = id ? (Array.isArray(id) ? id : [id]) : [];
        const trackIds = [];
        for (const i of ids) {
            if (i.startsWith('tr_')) {
                trackIds.push(i.substring(3));
            } else {
                trackIds.push(i);
            }
        }
        
        let currentId = current;
        if (current && current.startsWith('tr_')) {
            currentId = current.substring(3);
        }

        db.savePlayQueue(username, trackIds, currentId || null, parseInt(position || "0") || 0);

        sendResponse(res, req, {});
    };

    router.get('/savePlayQueue.view', savePlayQueue);
    router.post('/savePlayQueue.view', savePlayQueue);

    // --- OpenSubsonic Extensions ---

    const getOpenSubsonicExtensions = (req: any, res: any) => {
        sendResponse(res, req, {
            openSubsonicExtensions: [
                { name: 'transcodeOffset', versions: [1] },
                { name: 'songId', versions: [1] }
            ]
        });
    };

    router.get('/getOpenSubsonicExtensions.view', getOpenSubsonicExtensions);
    router.post('/getOpenSubsonicExtensions.view', getOpenSubsonicExtensions);

    // --- Songs By Genre ---

    const getSongsByGenre = (req: any, res: any) => {
        const genre = ensureString(req.query.genre);
        const count = ensureString(req.query.count);
        const offset = ensureString(req.query.offset);
        if (!genre) return sendError(res, req, 10, 'Missing genre parameter');

        const limit = parseInt(count || '') || 10;
        const skip = parseInt(offset || '') || 0;

        const allAlbums = db.getAlbums(false);
        const matchingAlbums = allAlbums.filter(a => a.genre && a.genre.toLowerCase().includes(genre.toLowerCase()));

        const songs: any[] = [];
        for (const album of matchingAlbums) {
            const tracks = db.getTracks(album.id);
            for (const track of tracks) {
                songs.push({
                    '@id': `tr_${track.id}`,
                    '@title': track.title,
                    '@album': album.title,
                    '@artist': track.artist_name || album.artist_name,
                    '@track': track.track_num,
                    '@year': album.date ? new Date(album.date).getFullYear() : undefined,
                    '@genre': album.genre,
                    '@coverArt': `al_${album.id}`,
                    '@duration': Math.floor(track.duration || 0),
                    '@bitRate': track.bitrate ? Math.round(track.bitrate / 1000) : 128,
                    '@suffix': track.format || 'mp3',
                    '@contentType': getContentType(track.format),
                    '@albumId': `al_${album.id}`,
                    '@artistId': `ar_${album.artist_id}`
                });
            }
        }

        const paginated = songs.slice(skip, skip + limit);
        sendResponse(res, req, {
            songsByGenre: { song: paginated }
        });
    };

    router.get('/getSongsByGenre.view', getSongsByGenre);
    router.post('/getSongsByGenre.view', getSongsByGenre);

    // --- Get Shares (stub) ---
    const getShares = (req: any, res: any) => sendResponse(res, req, { shares: { share: [] } });
    router.get('/getShares.view', getShares);
    router.post('/getShares.view', getShares);

    // --- Get Scan Status (Navidrome requests this) ---
    const getScanStatus = (req: any, res: any) => {
        sendResponse(res, req, {
            scanStatus: { '@scanning': 'false', '@count': 0 }
        });
    };
    router.get('/getScanStatus.view', getScanStatus);
    router.post('/getScanStatus.view', getScanStatus);

    // --- Start Scan (stub) ---
    const startScan = (req: any, res: any) => {
        sendResponse(res, req, {
            scanStatus: { '@scanning': 'false', '@count': 0 }
        });
    };
    router.get('/startScan.view', startScan);
    router.post('/startScan.view', startScan);



    // --- Get Users (Navidrome) ---
    const getUsers = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        sendResponse(res, req, {
            users: {
                user: [{
                    '@username': username,
                    '@email': 'admin@tunecamp.local',
                    '@scrobblingEnabled': 'true',
                    '@adminRole': 'true',
                    '@settingsRole': 'true',
                    '@downloadRole': 'true',
                    '@uploadRole': 'true',
                    '@playlistRole': 'true',
                    '@coverArtRole': 'true',
                    '@commentRole': 'true',
                    '@podcastRole': 'true',
                    '@streamRole': 'true',
                    '@jukeboxRole': 'true',
                    '@shareRole': 'true'
                }]
            }
        });
    };
    router.get('/getUsers.view', getUsers);
    router.post('/getUsers.view', getUsers);

    const getBookmarksEndpoint = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const bookmarks = db.getBookmarks(username);
        
        sendResponse(res, req, {
            bookmarks: {
                bookmark: bookmarks.map(b => {
                    const track = db.getTrack(parseInt(b.track_id.startsWith('tr_') ? b.track_id.substring(3) : b.track_id));
                    return {
                        entry: track ? formatTrack(track, username) : undefined,
                        '@position': b.position_ms,
                        '@comment': b.comment,
                        '@created': b.created_at,
                        '@changed': b.updated_at
                    };
                }).filter(b => b.entry !== undefined)
            }
        });
    };
    router.get('/getBookmarks.view', getBookmarksEndpoint);
    router.post('/getBookmarks.view', getBookmarksEndpoint);

    const createBookmarkEndpoint = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        const position = ensureString(req.query.position);
        const comment = ensureString(req.query.comment);
        if (!id || !position) return sendError(res, req, 10, 'Missing id or position');

        db.createBookmark(username, id, parseInt(position), comment);
        sendResponse(res, req, {});
    };
    router.get('/createBookmark.view', createBookmarkEndpoint);
    router.post('/createBookmark.view', createBookmarkEndpoint);

    const deleteBookmarkEndpoint = (req: any, res: any) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing id');

        db.deleteBookmark(username, id);
        sendResponse(res, req, {});
    };
    router.get('/deleteBookmark.view', deleteBookmarkEndpoint);
    router.post('/deleteBookmark.view', deleteBookmarkEndpoint);

    // --- Jukebox Control (stub) ---
    const jukeboxControl = (req: any, res: any) => {
        sendResponse(res, req, {
            jukeboxStatus: {
                '@currentIndex': '0',
                '@playing': 'false',
                '@gain': '0.5',
                '@position': '0'
            }
        });
    };
    router.get('/jukeboxControl.view', jukeboxControl);
    router.post('/jukeboxControl.view', jukeboxControl);

    // Catch-all for unmatched .view requests
    router.use((req, res) => {
        console.warn(`[Subsonic] Unknown request: ${req.method} ${req.path}`);
        sendError(res, req, 0, `Unknown Subsonic request: ${req.path}`);
    });

    return router;
};
