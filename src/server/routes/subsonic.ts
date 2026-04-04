
import { Router, Request, Response } from 'express';
import { create } from 'xmlbuilder2';
import path from 'path';
import fs from 'fs-extra';
import { resolveSafePath } from '../../utils/fileUtils.js';
import { getPlaceholderSVG } from '../../utils/audioUtils.js';
import { transcode } from '../ffmpeg.js';
import type { DatabaseService, Track } from '../database';
import type { AuthService } from '../auth';
import type { GunDBService } from '../gundb';

// Types for Subsonic
interface SubsonicContext {
    db: DatabaseService;
    auth: AuthService;
    musicDir: string;
    gundbService?: GunDBService;
}

// In-memory cache for "Now Playing" to support Subsonic clients
const nowPlayingCache = new Map<string, { trackId: number, timestamp: number }>();

export const createSubsonicRouter = (context: SubsonicContext): Router => {
    const router = Router();
    const { db, auth } = context;

    // --- Helpers ---

    const ensureString = (val: unknown): string | undefined => {
        if (typeof val === 'string') return val;
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val[0];
        return undefined;
    };

    const sanitizeJsonKeys = (obj: unknown): unknown => {
        if (Array.isArray(obj)) {
            return obj.map(item => sanitizeJsonKeys(item));
        } else if (obj !== null && typeof obj === 'object') {
            const newObj: Record<string, unknown> = {};
            const record = obj as Record<string, unknown>;
            for (const key in record) {
                if (Object.prototype.hasOwnProperty.call(record, key)) {
                    const newKey = key.startsWith('@') ? key.substring(1) : key;
                    newObj[newKey] = sanitizeJsonKeys(record[key]);
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
        if (f === 'ogg' || f === 'opus') return 'audio/ogg';
        if (f === 'wav') return 'audio/wav';
        if (f === 'm4a' || f === 'mp4') return 'audio/mp4';
        return 'audio/mpeg';
    };

    const sendResponse = (res: Response, req: Request, data: object, status = 'ok') => {
        const isJson = ensureString(req.query.f) === 'json';
        const version = '1.16.1';

        res.set('X-OpenSubsonic-Server', 'Tunecamp/2.0');

        if (isJson) {
            res.json({
                'subsonic-response': {
                    status,
                    version,
                    openSubsonic: true,
                    ...(sanitizeJsonKeys(data) as Record<string, unknown>)
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

    const sendError = (res: Response, req: Request, code: number, message: string) => {
        const isJson = ensureString(req.query.f) === 'json';
        const status = 'failed';
        const version = '1.16.1';

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

    const formatTrack = (track: Track, username: string) => {
        const id = `tr_${track.id}`;
        return {
            '@id': id,
            '@parent': track.album_id ? `al_${track.album_id}` : undefined,
            '@isDir': false,
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
            '@created': track.created_at,
            '@starred': db.isStarred(username, 'track', id) ? track.created_at || new Date().toISOString() : undefined,
            '@userRating': db.getItemRating(username, 'track', id) || undefined,
            '@averageRating': db.getItemRating(username, 'track', id) || undefined,
            '@discNumber': (track as any).disc_number || 1,
            '@samplingRate': track.sample_rate || 44100,
            '@bitDepth': (track as any).bit_depth || 16
        };
    };

    const formatAlbum = (album: any, username: string) => {
        const id = `al_${album.id}`;
        const artistId = album.artist_id ? `ar_${album.artist_id}` : undefined;
        return {
            '@id': id,
            '@name': album.title,
            '@title': album.title,
            '@artist': album.artist_name || 'Unknown Artist',
            '@artistId': artistId,
            '@isDir': true,
            '@coverArt': id,
            '@songCount': album.songCount || 0,
            '@duration': Math.floor(album.duration || 0),
            '@created': album.created_at,
            '@year': album.year || (album.date ? new Date(album.date).getFullYear() : undefined),
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
            '@artistImageUrl': `getCoverArt.view?id=${id}`,
            '@albumCount': artist.albumCount || 0,
            '@starred': db.isStarred(username, 'artist', id) ? artist.created_at || new Date().toISOString() : undefined,
            '@userRating': db.getItemRating(username, 'artist', id) || undefined
        };
    };

    // --- Middleware ---

    router.use(async (req, res, next) => {
        if (req.path === '/') {
            return sendResponse(res, req, { message: 'Tunecamp Subsonic API' });
        }

        const u = ensureString(req.query.u);
        const p = ensureString(req.query.p);
        const t = ensureString(req.query.t);
        const s = ensureString(req.query.s);

        if (!u) return sendError(res, req, 10, 'Parameter u is missing');

        let authorized = false;
        let isAdmin = false;
        let artistId: number | null = null;

        if (p) {
            let password = p;
            if (p.startsWith('enc:')) {
                const hex = p.substring(4);
                password = Buffer.from(hex, 'hex').toString('utf8');
            }

            const result = await auth.authenticateUser(u, password);
            if (result && result.success) {
                authorized = true;
                isAdmin = result.isAdmin;
                artistId = result.artistId;
            }
        }

        if (!authorized && t && s) {
            const tokenValid = await auth.verifySubsonicToken(u, t, s);
            if (tokenValid) {
                authorized = true;
                const user = (db as any).db.prepare("SELECT role, artist_id FROM admin WHERE username = ?").get(u);
                if (user) {
                    isAdmin = user.role === 'admin';
                    artistId = user.artist_id;
                }
            }
        }

        if (!authorized) return sendError(res, req, 40, 'Wrong username or password');

        (req as any).user = { username: u, isAdmin, artistId };
        next();
    });

    // --- Core Endpoints ---

    router.all('/ping.view', (req, res) => sendResponse(res, req, {}));
    
    router.all('/getLicense.view', (req, res) => {
        sendResponse(res, req, {
            license: {
                '@valid': true,
                '@email': 'admin@tunecamp.local',
                '@licenseExpires': '2099-01-01T00:00:00'
            }
        });
    });

    router.all('/getMusicFolders.view', (req, res) => {
        sendResponse(res, req, {
            musicFolders: { musicFolder: [{ '@id': 1, '@name': 'Music' }] }
        });
    });

    router.all('/getIndexes.view', (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const artists = db.getArtists();
        const indexes: Record<string, any[]> = {};

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
                '@lastModified': Date.now(),
                '@ignoredArticles': 'The El La Los Las Le Les',
                index: indexNodes
            }
        });
    });

    router.all('/getMusicDirectory.view', (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        if (id.startsWith('ar_')) {
            const artistId = parseInt(id.substring(3));
            const artist = db.getArtist(artistId);
            if (!artist) return sendError(res, req, 70, 'Artist not found');

            const libraryAlbums = db.getAlbumsByArtist(artistId, false);
            const allAlbums = libraryAlbums.map(album => {
                const tracks = db.getTracks(album.id);
                return {
                    ...album,
                    songCount: tracks.length,
                    duration: tracks.reduce((acc, t) => acc + (t.duration || 0), 0)
                };
            });

            return sendResponse(res, req, {
                directory: {
                    '@id': id,
                    '@name': artist.name,
                    '@parent': '1',
                    child: allAlbums.map(album => formatAlbum(album, username))
                }
            });
        }

        if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            const album = db.getAlbum(albumId) as any;
            if (!album) return sendError(res, req, 70, 'Album not found');

            const tracks = db.getTracks(albumId);
            return sendResponse(res, req, {
                directory: {
                    '@id': id,
                    '@name': album.title,
                    '@parent': album.artist_id ? `ar_${album.artist_id}` : '1',
                    child: tracks.map((track: any) => formatTrack(track, username))
                }
            });
        }

        return sendError(res, req, 70, 'Directory not found');
    });

    // --- Media Endpoints ---

    router.all('/getCoverArt.view', async (req, res) => {
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        let imagePath: string | null = null;
        let artistName: string | null = null;

        if (id.startsWith('ar_')) {
            const artistId = parseInt(id.substring(3));
            const artist = db.getArtist(artistId);
            if (artist) {
                artistName = artist.name;
                if (artist.photo_path) imagePath = artist.photo_path;
                else {
                    const albums = db.getAlbumsByArtist(artistId, false);
                    for (const album of albums) {
                        if (album.cover_path) { imagePath = album.cover_path; break; }
                    }
                }
            }
        } else if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            const album = db.getAlbum(albumId);
            if (album?.cover_path) imagePath = album.cover_path;
        } else if (id.startsWith('tr_')) {
            const track = db.getTrack(parseInt(id.substring(3)));
            if (track) {
                if (track.external_artwork) imagePath = track.external_artwork;
                else if (track.album_id) {
                    const album = db.getAlbum(track.album_id);
                    if (album?.cover_path) imagePath = album.cover_path;
                }
            }
        }

        if (imagePath) {
            if (imagePath.startsWith('http')) {
                try {
                    const response = await fetch(imagePath);
                    if (response.ok) {
                        const contentType = response.headers.get('content-type');
                        if (contentType) res.setHeader('Content-Type', contentType);
                        res.setHeader('Cache-Control', 'public, max-age=86400');
                        if (response.body) {
                            (response.body as any).pipe(res);
                            return;
                        }
                    }
                } catch (error) { console.error('Error proxying image:', error); }
            }

            let fullPath = resolveSafePath(context.musicDir, imagePath);
            if (!fullPath || !await fs.pathExists(fullPath)) {
                const projectRoot = path.dirname(context.musicDir);
                const altPath = resolveSafePath(projectRoot, imagePath);
                if (altPath && await fs.pathExists(altPath)) fullPath = altPath;
            }

            if (fullPath && await fs.pathExists(fullPath)) {
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.sendFile(fullPath);
            }
        }

        if (artistName) {
            const svg = getPlaceholderSVG(artistName);
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=86400");
            return res.send(svg);
        }

        return sendError(res, req, 70, 'Cover art not found');
    });

    router.all('/stream.view', async (req, res) => {
        const id = ensureString(req.query.id);
        const format = ensureString(req.query.format);
        const maxBitRate = ensureString(req.query.maxBitRate);
        const timeOffset = ensureString(req.query.timeOffset);

        if (!id || !id.startsWith('tr_')) return sendError(res, req, 10, 'Invalid id');

        const track = db.getTrack(parseInt(id.substring(3)));
        if (!track || !track.file_path) return sendError(res, req, 70, 'File not found');

        const fullPath = resolveSafePath(context.musicDir, track.file_path);
        if (!fullPath || !await fs.pathExists(fullPath)) return sendError(res, req, 70, 'File not found');

        const targetFormat = format || 'mp3';
        const targetBitrate = maxBitRate ? parseInt(maxBitRate) : undefined;
        const offset = timeOffset ? parseInt(timeOffset) : 0;

        res.set('Content-Type', getContentType(targetFormat));
        res.set('Accept-Ranges', 'bytes');

        const sourceFormat = (track.format || 'mp3').toLowerCase();
        const needsTranscode = offset > 0 || (targetFormat && sourceFormat !== targetFormat) || (targetBitrate && (track.bitrate || 0) / 1000 > targetBitrate);

        if (!needsTranscode) {
            return res.sendFile(fullPath);
        }

        console.log(`[Subsonic] Streaming ${track.id} (${targetFormat}) from offset ${offset}s`);
        const transcodeStream = transcode(fullPath, targetFormat, targetBitrate, offset);
        
        transcodeStream.on('error', (err: any) => {
            console.error('[Subsonic] Streaming error:', err);
            if (!res.headersSent) sendError(res, req, 80, 'Streaming failed');
        });

        transcodeStream.pipe(res);
    });

    // --- Selection & Lists ---

    router.all(['/getAlbumList.view', '/getAlbumList2.view'], (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const type = ensureString(req.query.type) || 'newest';
        const size = parseInt(ensureString(req.query.size) || '10');
        const offset = parseInt(ensureString(req.query.offset) || '0');
        const isV2 = req.path.includes('getAlbumList2');

        const allAlbums = db.getAlbums(false).map(a => {
            const tracks = db.getTracks(a.id);
            return { ...a, songCount: tracks.length, duration: tracks.reduce((acc, t) => acc + (t.duration || 0), 0) };
        });

        let albums = [...allAlbums];
        if (type === 'random') albums.sort(() => Math.random() - 0.5);
        else if (type === 'newest' || type === 'recent') albums.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        else if (type === 'alphabeticalByName') albums.sort((a, b) => a.title.localeCompare(b.title));
        else if (type === 'alphabeticalByArtist') albums.sort((a, b) => (a.artist_name || '').localeCompare(b.artist_name || ''));

        const paginated = albums.slice(offset, offset + size);
        const wrapperKey = isV2 ? 'albumList2' : 'albumList';
        sendResponse(res, req, { [wrapperKey]: { album: paginated.map(a => formatAlbum(a, username)) } });
    });

    router.all('/getRandomSongs.view', (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const size = parseInt(ensureString(req.query.size) || '10');
        const tracks = db.getTracks().sort(() => Math.random() - 0.5).slice(0, size);
        sendResponse(res, req, { randomSongs: { song: tracks.map(t => formatTrack(t, username)) } });
    });

    router.all(['/search.view', '/search2.view', '/search3.view'], (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const query = ensureString(req.query.query);
        if (!query) return sendError(res, req, 10, 'Missing query');

        const results = db.search(query, false);
        const artist = results.artists.map(a => formatArtist(a, username));
        const album = results.albums.map(a => {
            const tracks = db.getTracks(a.id);
            return formatAlbum({ ...a, songCount: tracks.length, duration: tracks.reduce((acc, t) => acc + (t.duration || 0), 0) }, username);
        });
        const song = results.tracks.map(t => formatTrack(t, username));

        const resName = req.path.includes('search3') ? 'searchResult3' : (req.path.includes('search2') ? 'searchResult2' : 'searchResult');
        sendResponse(res, req, { [resName]: { artist, album, song } });
    });

    // --- User & Social ---

    router.all('/scrobble.view', async (req, res) => {
        const { id, submission: subRaw } = req.query as any;
        const submission = ensureString(subRaw) !== 'false';
        const ids = Array.isArray(id) ? id : [id];
        const username = (req as any).user.username;

        for (const tid of ids) {
            if (!tid?.startsWith('tr_')) continue;
            const trackId = parseInt(tid.substring(3));
            if (submission) {
                db.recordPlay(trackId, new Date().toISOString());
                nowPlayingCache.set(username, { trackId, timestamp: Date.now() });
            }
        }
        sendResponse(res, req, {});
    });

    router.all('/getNowPlaying.view', (req, res) => {
        const entries: any[] = [];
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        for (const [user, data] of nowPlayingCache.entries()) {
            if (now - data.timestamp < fiveMinutes) {
                const track = db.getTrack(data.trackId);
                if (track) {
                    const formatted = formatTrack(track, 'admin');
                    entries.push({ ...formatted, '@username': user, '@minutesAgo': Math.floor((now - data.timestamp) / 60000) });
                }
            } else {
                nowPlayingCache.delete(user);
            }
        }
        sendResponse(res, req, { nowPlaying: { entry: entries } });
    });

    router.all('/getArtist.view', (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        const artistId = parseInt(id?.startsWith('ar_') ? id.substring(3) : (id || ''));
        
        const artist = db.getArtist(artistId);
        if (!artist) return sendError(res, req, 70, 'Artist not found');

        const albums = db.getAlbumsByArtist(artistId, false).map(a => {
            const tracks = db.getTracks(a.id);
            return { ...a, songCount: tracks.length, duration: tracks.reduce((acc, t) => acc + (t.duration || 0), 0) };
        });

        sendResponse(res, req, {
            artist: {
                ...formatArtist(artist, username),
                album: albums.map(a => formatAlbum(a, username))
            }
        });
    });

    router.all('/getAlbum.view', (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        const albumId = parseInt(id?.startsWith('al_') ? id.substring(3) : (id || ''));
        
        const album = db.getAlbum(albumId) as any;
        if (!album) return sendError(res, req, 70, 'Album not found');

        const tracks = db.getTracks(albumId);
        sendResponse(res, req, {
            album: {
                ...formatAlbum({ ...album, songCount: tracks.length, duration: tracks.reduce((acc, t) => acc + (t.duration || 0), 0) }, username),
                song: tracks.map((track: any) => formatTrack(track, username))
            }
        });
    });

    router.all('/getGenres.view', (req, res) => {
        const albums = db.getAlbums(false);
        const genreMap = new Map<string, { count: number, songCount: number }>();

        albums.forEach(album => {
            if (!album.genre) return;
            album.genre.split(',').forEach(g => {
                const name = g.trim();
                const data = genreMap.get(name) || { count: 0, songCount: 0 };
                data.count++;
                data.songCount += db.getTracks(album.id).length;
                genreMap.set(name, data);
            });
        });

        const genres = Array.from(genreMap.entries()).sort().map(([name, data]) => ({
            '@value': name,
            '@songCount': data.songCount,
            '@albumCount': data.count
        }));

        sendResponse(res, req, { genres: { genre: genres } });
    });

    router.all(['/getStarred.view', '/getStarred2.view'], (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const starred = db.getStarredItems(username);
        
        const response: any = { artist: [], album: [], song: [] };
        starred.forEach(item => {
            const id = parseInt(item.item_id.split('_')[1]);
            if (item.item_type === 'artist') {
                const a = db.getArtist(id);
                if (a) response.artist.push(formatArtist(a, username));
            } else if (item.item_type === 'album') {
                const a = db.getAlbum(id);
                if (a) response.album.push(formatAlbum(a, username));
            } else if (item.item_type === 'track') {
                const t = db.getTrack(id);
                if (t) response.song.push(formatTrack(t, username));
            }
        });

        const wrapper = req.path.includes('Starred2') ? 'starred2' : 'starred';
        sendResponse(res, req, { [wrapper]: response });
    });

    router.all('/getPlaylists.view', (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const playlists = db.getPlaylists();
        sendResponse(res, req, {
            playlists: {
                playlist: playlists.map(p => ({
                    '@id': `pl_${p.id}`, '@name': p.name, '@owner': p.username, '@public': p.isPublic ? 'true' : 'false',
                    '@created': p.created_at, '@songCount': db.getPlaylistTracks(p.id).length
                }))
            }
        });
    });

    router.all('/getPlaylist.view', (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const id = parseInt(ensureString(req.query.id)?.split('_')[1] || '');
        const playlist = db.getPlaylist(id);
        if (!playlist) return sendError(res, req, 70, 'Playlist not found');

        const tracks = db.getPlaylistTracks(id);
        sendResponse(res, req, {
            playlist: {
                '@id': `pl_${playlist.id}`, '@name': playlist.name, '@owner': playlist.username,
                '@songCount': tracks.length, entry: tracks.map(t => formatTrack(t, username))
            }
        });
    });

    router.all('/getUser.view', (req, res) => {
        const requestedUser = ensureString(req.query.username) || (req as any).user.username;
        sendResponse(res, req, {
            user: {
                '@username': requestedUser, '@email': 'admin@tunecamp.local', '@scrobblingEnabled': true,
                '@adminRole': true, '@settingsRole': true, '@downloadRole': true, '@uploadRole': true,
                '@playlistRole': true, '@coverArtRole': true, '@commentRole': true, '@podcastRole': true,
                '@streamRole': true, '@jukeboxRole': true, '@shareRole': true, '@videoConversionRole': true
            }
        });
    });

    router.all('/getScanStatus.view', (req, res) => {
        sendResponse(res, req, { scanStatus: { '@scanning': 'false', '@count': 0 } });
    });

    // Catch-all
    router.use((req, res) => {
        console.warn(`[Subsonic] Unknown request: ${req.method} ${req.path}`);
        sendError(res, req, 0, `Unknown Subsonic request: ${req.path}`);
    });

    return router;
};
