
import { Router } from 'express';
import { create } from 'xmlbuilder2';
import md5 from 'md5';
import path from 'path';
import fs from 'fs-extra';
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

    const sendResponse = (res: any, req: any, data: object, status = 'ok') => {
        const isJson = req.query.f === 'json';
        const version = '1.16.1';

        if (isJson) {
            res.json({
                'subsonic-response': {
                    status,
                    version,
                    xmlns: 'http://subsonic.org/restapi',
                    ...data
                }
            });
            return;
        }

        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', { xmlns: 'http://subsonic.org/restapi', status, version });

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
        const isJson = req.query.f === 'json';
        const status = 'failed';
        const version = '1.16.1';

        if (isJson) {
            res.json({
                'subsonic-response': {
                    status,
                    version,
                    xmlns: 'http://subsonic.org/restapi',
                    error: { code: String(code), message }
                }
            });
            return;
        }

        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', { xmlns: 'http://subsonic.org/restapi', status, version })
            .ele('error', { code: String(code), message }).up();

        const xml = doc.end({ prettyPrint: true });
        res.set('Content-Type', 'text/xml');
        res.send(xml);
    };

    // --- Middleware ---

    router.use(async (req, res, next) => {
        // Handle discovery at root /rest (empty path since it's mounted at /rest)
        if (req.path === '/') {
            return sendResponse(res, req, { message: 'Tunecamp Subsonic API' });
        }

        const { u, p, t, s } = req.query as any;

        // Skip auth for cover art and stream if needed? 
        // Subsonic spec usually REQUIRES auth for everything.

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
            // Note: Token auth is currently not supported for bcrypt hashes.
            // We return error 40 below if not authorized.
        }

        if (!authorized) {
            // Log for debug
            // console.log(`[Subsonic] Auth failed for user: ${u}`);
            return sendError(res, req, 40, 'Wrong username or password');
        }

        (req as any).user = { username: u };
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
        const artists = db.getArtists();
        const indexes: Record<string, any[]> = {};

        // Group by first letter
        artists.forEach(artist => {
            let char = artist.name.charAt(0).toUpperCase();
            if (!/[A-Z]/.test(char)) char = '#';
            if (!indexes[char]) indexes[char] = [];

            indexes[char].push({
                '@id': `ar_${artist.id}`,
                '@name': artist.name,
                '@coverArt': `ar_${artist.id}`,
                '@artistImageUrl': `/api/artists/${artist.id}/cover`
            });
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
        const { id } = req.query as any;
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
                child: albums.map(album => ({
                    '@id': `al_${album.id}`,
                    '@title': album.title,
                    '@parent': id,
                    '@artist': artist.name,
                    '@isDir': 'true',
                    '@coverArt': `al_${album.id}`,
                    '@album': album.title,
                    '@year': album.date ? new Date(album.date).getFullYear() : undefined
                }))
            };
            return sendResponse(res, req, { directory });
        }

        // Handle Album -> Return Tracks
        if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            const album = db.getAlbum(albumId);
            if (!album) return sendError(res, req, 70, 'Album not found');

            const tracks = db.getTracks(albumId);

            const directory = {
                '@id': id,
                '@name': album.title,
                '@parent': `ar_${album.artist_id}`,
                child: tracks.map((track: any) => ({
                    '@id': `tr_${track.id}`,
                    '@title': track.title,
                    '@album': album.title,
                    '@artist': track.artist_name || album.artist_name,
                    '@track': track.track_num,
                    '@year': album.date ? new Date(album.date).getFullYear() : undefined,
                    '@genre': album.genre,
                    '@coverArt': `al_${albumId}`,
                    '@size': 0,
                    '@contentType': 'audio/mpeg',
                    '@suffix': track.format || 'mp3',
                    '@duration': Math.floor(track.duration || 0),
                    '@bitRate': track.bitrate ? Math.round(track.bitrate / 1000) : 128,
                    '@path': track.file_path,
                    '@isDir': 'false'
                }))
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
        const { id } = req.query as any;
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        let imagePath: string | null = null;

        if (id.startsWith('ar_')) {
            const artist = db.getArtist(parseInt(id.substring(3)));
            if (artist?.photo_path) imagePath = artist.photo_path;
        } else if (id.startsWith('al_')) {
            const album = db.getAlbum(parseInt(id.substring(3)));
            if (album?.cover_path) imagePath = album.cover_path;
        }

        if (imagePath) {
            const fullPath = path.resolve(context.musicDir, imagePath);
            if (await fs.pathExists(fullPath)) {
                return res.sendFile(fullPath);
            }
        }

        // Return 404 or a placeholder? Subsonic spec says generic image or 404.
        // Let's return 404 for now, client handles fallback.
        // Or send empty?
        return sendError(res, req, 70, 'Cover art not found'); // Code 70 = Data not found
    };

    const stream = async (req: any, res: any) => {
        const { id } = req.query as any;
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        if (id.startsWith('tr_')) {
            const track = db.getTrack(parseInt(id.substring(3)));
            if (track && track.file_path) {
                const fullPath = path.resolve(context.musicDir, track.file_path);
                if (await fs.pathExists(fullPath)) {
                    // res.sendFile handles Range headers automatically
                    return res.sendFile(fullPath);
                }
            }
        }

        return sendError(res, req, 70, 'File not found');
    };

    const scrobble = async (req: any, res: any) => {
        const { id, submission, timestamp } = req.query as any;
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
        const { id } = req.query as any;
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        if (id.startsWith('ar_')) {
            const artistId = parseInt(id.substring(3));
            const artist = db.getArtist(artistId);
            if (artist) {
                const albums = db.getAlbumsByArtist(artistId);
                sendResponse(res, req, {
                    artist: {
                        '@id': id,
                        '@name': artist.name,
                        '@coverArt': `ar_${artist.id}`,
                        '@albumCount': albums.length,
                        '@artistImageUrl': `/api/artists/${artist.id}/cover`,
                        album: albums.map(a => ({
                            '@id': `al_${a.id}`,
                            '@name': a.title,
                            '@coverArt': `al_${a.id}`,
                            '@artistId': id,
                            '@artist': artist.name,
                            '@year': a.date ? new Date(a.date).getFullYear() : undefined
                        }))
                    }
                });
                return;
            }
        }
        return sendError(res, req, 70, 'Artist not found');
    };

    const getAlbum = (req: any, res: any) => {
        const { id } = req.query as any;
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            const album = db.getAlbum(albumId);
            if (album) {
                const tracks = db.getTracks(albumId);
                sendResponse(res, req, {
                    album: {
                        '@id': id,
                        '@name': album.title,
                        '@artist': album.artist_name,
                        '@artistId': `ar_${album.artist_id}`,
                        '@coverArt': `al_${album.id}`,
                        '@songCount': tracks.length,
                        '@duration': tracks.reduce((acc, t) => acc + (t.duration || 0), 0),
                        '@created': album.created_at,
                        '@year': album.date ? new Date(album.date).getFullYear() : undefined,
                        song: tracks.map((track: any) => ({
                            '@id': `tr_${track.id}`,
                            '@title': track.title,
                            '@isDir': 'false',
                            '@album': album.title,
                            '@artist': track.artist_name || album.artist_name,
                            '@track': track.track_num,
                            '@coverArt': `al_${album.id}`,
                            '@artistId': `ar_${album.artist_id}`,
                            '@albumId': id,
                            '@path': track.file_path || '',
                            '@suffix': track.format || 'mp3',
                            '@contentType': 'audio/mpeg',
                            '@duration': Math.floor(track.duration || 0),
                            '@bitRate': track.bitrate ? Math.round(track.bitrate / 1000) : 128
                        }))
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

    // Catch-all for unmatched .view requests
    router.use((req, res) => {
        sendError(res, req, 0, `Unknown Subsonic request: ${req.path}`);
    });

    return router;
};
