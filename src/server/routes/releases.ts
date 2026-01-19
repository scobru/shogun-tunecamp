/**
 * Release Routes - Authenticated
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { GunDBStorage } from '../storage/gunDBStorage.js';
import { TemplateEngine } from '../../generator/templateEngine.js';
import { ServerOptions } from '../server.js';
import { ReleaseConfig, TrackMetadata } from '../../types/index.js';
import { readAudioMetadata } from '../../utils/audioUtils.js';
import { createSlug } from '../../utils/fileUtils.js';

/**
 * Middleware to check authentication
 * Accepts Bearer token with GunDB public key (stateless)
 * With client-side auth, we trust the public key format
 */
function requireAuth(storage: GunDBStorage) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Check Authorization header for publicKey
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const publicKey = authHeader.substring(7);

      // Validate public key format (GunDB public keys are long base64 strings)
      if (publicKey && publicKey.length > 40) {
        (req as any).user = { pub: publicKey, alias: '' };
        next();
        return;
      }
    }

    // Fallback: check GunDB session (for server-side requests)
    const user = storage.getCurrentUser();
    if (user) {
      (req as any).user = user;
      next();
      return;
    }

    res.status(401).json({ error: 'Authentication required' });
  };
}

/**
 * Setup multer for file uploads
 */
function setupMulter(storagePath: string) {
  return multer({
    dest: storagePath,
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB max
    },
    fileFilter: (req, file, cb) => {
      // Allow audio files and images
      const allowedMimes = [
        'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/ogg', 'audio/wav',
        'audio/x-m4a', 'audio/aac', 'audio/opus',
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      ];

      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type'));
      }
    },
  });
}

export function setupReleaseRoutes(
  app: express.Application,
  storage: GunDBStorage,
  templateEngine: TemplateEngine,
  options: Required<ServerOptions>
): void {
  const auth = requireAuth(storage);
  const upload = setupMulter(options.storagePath);

  /**
   * Create new release
   * POST /api/me/releases
   * Body: { title: string, date: string, description: string, ... }
   */
  app.post('/api/me/releases', auth, async (req, res) => {
    try {
      const user = (req as any).user;
      const config: ReleaseConfig = req.body;

      if (!config.title || !config.date) {
        res.status(400).json({ error: 'Title and date are required' });
        return;
      }

      const releaseSlug = createSlug(config.title);
      const releasePath = storage.getReleaseStoragePath(user.pub, releaseSlug);
      await fs.ensureDir(releasePath);
      await fs.ensureDir(path.join(releasePath, 'tracks'));

      // Save release config
      await storage.saveRelease(user.pub, releaseSlug, {
        ...config,
        date: config.date,
      });

      res.json({ success: true, slug: releaseSlug, config });
    } catch (error: any) {
      console.error('Error creating release:', error);
      res.status(500).json({ error: 'Failed to create release' });
    }
  });

  /**
   * Get release details
   * GET /api/me/releases/:slug
   */
  app.get('/api/me/releases/:slug', auth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { slug } = req.params;

      const config = await storage.getRelease(user.pub, slug);
      if (!config) {
        res.status(404).json({ error: 'Release not found' });
        return;
      }

      const tracks = await storage.getReleaseTracks(user.pub, slug);

      res.json({ config, tracks, slug });
    } catch (error: any) {
      console.error('Error getting release:', error);
      res.status(500).json({ error: 'Failed to get release' });
    }
  });

  /**
   * Update release
   * PUT /api/me/releases/:slug
   * Body: { title: string, date: string, description: string, ... }
   */
  app.put('/api/me/releases/:slug', auth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { slug } = req.params;
      const config: ReleaseConfig = req.body;

      // Check if release exists
      const existing = await storage.getRelease(user.pub, slug);
      if (!existing) {
        res.status(404).json({ error: 'Release not found' });
        return;
      }

      // Update release config
      await storage.saveRelease(user.pub, slug, {
        ...existing,
        ...config,
      });

      res.json({ success: true, slug, config });
    } catch (error: any) {
      console.error('Error updating release:', error);
      res.status(500).json({ error: 'Failed to update release' });
    }
  });

  /**
   * Delete release
   * DELETE /api/me/releases/:slug
   */
  app.delete('/api/me/releases/:slug', auth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { slug } = req.params;

      // Delete from GunDB
      await storage.deleteRelease(user.pub, slug);

      // Delete files (optional - could keep for backup)
      // const releasePath = storage.getReleaseStoragePath(user.pub, slug);
      // await fs.remove(releasePath);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting release:', error);
      res.status(500).json({ error: 'Failed to delete release' });
    }
  });

  /**
   * Upload cover art
   * POST /api/me/releases/:slug/cover
   * Body: file (multipart/form-data)
   */
  app.post('/api/me/releases/:slug/cover', auth, upload.single('cover') as unknown as express.RequestHandler, async (req, res) => {
    try {
      const user = (req as any).user;
      const { slug } = req.params;

      console.log('📷 Cover upload request:', { user: user.pub?.substring(0, 20), slug });

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      // Check if using relay storage
      if (storage.isUsingRelayStorage()) {
        // Upload to relay (IPFS)
        const fileBuffer = await fs.readFile(req.file.path);
        const result = await storage.uploadFile(
          fileBuffer,
          `cover${path.extname(req.file.originalname)}`,
          req.file.mimetype,
          user.pub
        );

        // Clean up temp file
        await fs.remove(req.file.path);

        if (!result.success) {
          res.status(500).json({ error: result.error || 'Failed to upload cover to relay' });
          return;
        }

        // Update release config with CID
        const config = await storage.getRelease(user.pub, slug);
        if (config) {
          await storage.saveRelease(user.pub, slug, {
            ...config,
            cover: result.cid, // Store CID instead of filename
            coverUrl: result.url, // Store URL for easy access
          });
        }

        res.json({ success: true, cid: result.cid, url: result.url });
      } else {
        // Fallback to local storage
        const releasePath = storage.getReleaseStoragePath(user.pub, slug);
        
        // Ensure directory exists
        await fs.ensureDir(releasePath);
        
        const coverFilename = `cover${path.extname(req.file.originalname)}`;
        const coverPath = path.join(releasePath, coverFilename);

        console.log('📷 Saving cover to:', coverPath);

        // Move uploaded file to release directory (overwrite existing)
        await fs.move(req.file.path, coverPath, { overwrite: true });

        // Try to update release config (might not exist in server GunDB)
        try {
          const config = await storage.getRelease(user.pub, slug);
          if (config) {
            await storage.saveRelease(user.pub, slug, {
              ...config,
              cover: coverFilename,
            });
          } else {
            // Config doesn't exist in server GunDB, create minimal one
            await storage.saveRelease(user.pub, slug, {
              title: slug,
              date: new Date().toISOString().split('T')[0],
              cover: coverFilename,
            } as any);
          }
        } catch (configErr) {
          console.warn('Could not update GunDB config for cover:', configErr);
          // Continue anyway - file is saved
        }

        res.json({ success: true, coverPath: `/storage/${user.pub}/releases/${slug}/${coverFilename}` });
      }
    } catch (error: any) {
      console.error('Error uploading cover:', error);
      res.status(500).json({ error: error.message || 'Failed to upload cover' });
    }
  });

  /**
   * Get release tracks
   * GET /api/me/releases/:slug/tracks
   */
  app.get('/api/me/releases/:slug/tracks', auth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { slug } = req.params;

      const tracks = await storage.getReleaseTracks(user.pub, slug);
      res.json(tracks);
    } catch (error: any) {
      console.error('Error getting tracks:', error);
      res.status(500).json({ error: 'Failed to get tracks' });
    }
  });

  /**
   * Upload track
   * POST /api/me/releases/:slug/tracks
   * Body: file (multipart/form-data)
   */
  app.post('/api/me/releases/:slug/tracks', auth, upload.single('track') as unknown as express.RequestHandler, async (req, res) => {
    try {
      const user = (req as any).user;
      const { slug } = req.params;

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      // Check if using relay storage
      if (storage.isUsingRelayStorage()) {
        // Upload to relay (IPFS)
        const fileBuffer = await fs.readFile(req.file.path);
        const result = await storage.uploadFile(
          fileBuffer,
          req.file.originalname,
          req.file.mimetype,
          user.pub
        );

        // Clean up temp file
        await fs.remove(req.file.path);

        if (!result.success) {
          res.status(500).json({ error: result.error || 'Failed to upload track to relay' });
          return;
        }

        // Read metadata from buffer (we'll need to implement this)
        // For now, use basic metadata
        const track: TrackMetadata = {
          file: result.cid!, // Store CID instead of path
          filename: req.file.originalname,
          title: req.file.originalname.replace(/\.[^.]+$/, ''),
          url: result.url, // Store URL for playback
        };

        // Save track metadata to GunDB
        await storage.saveReleaseTrack(user.pub, slug, track);

        res.json({ success: true, track, cid: result.cid, url: result.url });
      } else {
        // Fallback to local storage
        const releasePath = storage.getReleaseStoragePath(user.pub, slug);
        const tracksDir = path.join(releasePath, 'tracks');
        const trackPath = path.join(tracksDir, req.file.originalname);

        // Move uploaded file to tracks directory (overwrite existing)
        await fs.move(req.file.path, trackPath, { overwrite: true });

        // Read metadata
        const metadata = await readAudioMetadata(trackPath);

        // Create track metadata
        const track: TrackMetadata = {
          file: trackPath,
          filename: req.file.originalname,
          title: metadata.title || req.file.originalname.replace(/\.[^.]+$/, ''),
          artist: metadata.artist,
          album: metadata.album,
          year: metadata.year,
          track: metadata.track,
          duration: metadata.duration,
          format: metadata.format,
          bitrate: metadata.bitrate,
          sampleRate: metadata.sampleRate,
          genre: metadata.genre,
        };

        // Save track metadata to GunDB
        await storage.saveReleaseTrack(user.pub, slug, track);

        res.json({ success: true, track });
      }
    } catch (error: any) {
      console.error('Error uploading track:', error);
      res.status(500).json({ error: 'Failed to upload track' });
    }
  });

  /**
   * Delete track
   * DELETE /api/me/releases/:slug/tracks/:filename
   */
  app.delete('/api/me/releases/:slug/tracks/:filename', auth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { slug, filename } = req.params;

      // Delete from GunDB (TODO: implement delete track method)
      // For now, just return success
      // await storage.deleteReleaseTrack(user.pub, slug, filename);

      // Delete file (optional)
      // const trackPath = path.join(
      //   storage.getReleaseStoragePath(user.pub, slug),
      //   'tracks',
      //   filename
      // );
      // await fs.remove(trackPath);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting track:', error);
      res.status(500).json({ error: 'Failed to delete track' });
    }
  });
}
