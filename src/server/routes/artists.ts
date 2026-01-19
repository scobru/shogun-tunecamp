/**
 * Artist Routes - Authenticated
 */

import express from 'express';
import { GunDBStorage } from '../storage/gunDBStorage.js';
import { TemplateEngine } from '../../generator/templateEngine.js';
import { ServerOptions } from '../server.js';
import { ArtistConfig } from '../../types/index.js';

/**
 * Middleware to check authentication
 */
function requireAuth(storage: GunDBStorage) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Check Authorization header for publicKey
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const publicKey = authHeader.substring(7);
      // Verify user exists
      const profile = await storage.getArtist(publicKey);
      if (profile) {
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

export function setupArtistRoutes(
  app: express.Application,
  storage: GunDBStorage,
  templateEngine: TemplateEngine,
  options: Required<ServerOptions>
): void {
  const auth = requireAuth(storage);

  /**
   * Update artist profile
   * PUT /api/me
   * Body: { name: string, bio: string, photo: string, links: [], donationLinks: [] }
   */
  app.put('/api/me', auth, async (req, res) => {
    try {
      const user = (req as any).user;
      const profile: ArtistConfig = req.body;

      // Update profile
      await storage.saveArtist(user.pub, {
        ...profile,
        slug: profile.slug || user.alias.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });

      res.json({ success: true, profile });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  /**
   * Get artist releases (authenticated)
   * GET /api/me/releases
   */
  app.get('/api/me/releases', auth, async (req, res) => {
    try {
      const user = (req as any).user;
      const releases = await storage.getArtistReleases(user.pub);
      res.json(releases);
    } catch (error: any) {
      console.error('Error getting releases:', error);
      res.status(500).json({ error: 'Failed to get releases' });
    }
  });

  /**
   * Dashboard page - Check auth via token from localStorage
   * GET /dashboard
   */
  app.get('/dashboard', async (req, res) => {
    try {
      // Check auth from header (for frontend)
      const authHeader = req.headers.authorization;
      let publicKey: string | null = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        publicKey = authHeader.substring(7);
      } else {
        // Fallback: check GunDB session
        const user = storage.getCurrentUser();
        if (user) {
          publicKey = user.pub;
        }
      }

      if (!publicKey) {
        // Render login page if not authenticated
        res.redirect('/auth/login');
        return;
      }

      const profile = await storage.getArtist(publicKey);
      const releases = await storage.getArtistReleases(publicKey);

      const catalog = {
        title: options.serverTitle,
        description: options.serverDescription,
        url: req.protocol + '://' + req.get('host'),
        basePath: '',
        theme: 'default',
        language: 'en',
      };

      const data = {
        catalog,
        basePath: '', // Ensure basePath is set for assetPath helper
        artist: profile,
        releases: releases.map(r => ({
          config: r.config,
          slug: r.slug,
        })),
      };

      const html = templateEngine.renderWithLayout('dashboard', data, 'Dashboard');
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering dashboard:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * Release management page
   * GET /dashboard/releases/:slug
   */
  app.get('/dashboard/releases/:slug', async (req, res) => {
    try {
      // Check auth
      const authHeader = req.headers.authorization;
      let publicKey: string | null = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        publicKey = authHeader.substring(7);
      } else {
        const user = storage.getCurrentUser();
        if (user) {
          publicKey = user.pub;
        }
      }

      if (!publicKey) {
        res.redirect('/auth/login');
        return;
      }

      const { slug } = req.params;
      const config = await storage.getRelease(publicKey, slug);
      if (!config) {
        res.status(404).send('Release not found');
        return;
      }

      const tracks = await storage.getReleaseTracks(publicKey, slug);
      const profile = await storage.getArtist(publicKey);

      const catalog = {
        title: options.serverTitle,
        description: options.serverDescription,
        url: req.protocol + '://' + req.get('host'),
        basePath: '',
        theme: 'default',
        language: 'en',
      };

      const data = {
        catalog,
        basePath: '', // Ensure basePath is set for assetPath helper
        artist: profile,
        release: {
          config,
          slug,
          tracks,
        },
      };

      const html = templateEngine.renderWithLayout('release-manage', data, `Manage: ${config.title}`);
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering release manage page:', error);
      res.status(500).send('Internal Server Error');
    }
  });
}
