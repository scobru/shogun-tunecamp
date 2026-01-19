/**
 * Public Routes - No authentication required
 */

import express from 'express';
import path from 'path';
import { GunDBStorage } from '../storage/gunDBStorage.js';
import { TemplateEngine } from '../../generator/templateEngine.js';
import { ServerOptions } from '../server.js';
import { createSlug } from '../../utils/fileUtils.js';
import { readAudioMetadata } from '../../utils/audioUtils.js';

export function setupPublicRoutes(
  app: express.Application,
  storage: GunDBStorage,
  templateEngine: TemplateEngine,
  options: Required<ServerOptions>
): void {
  /**
   * Homepage - List all artists
   */
  app.get('/', async (req, res) => {
    try {
      const artists = await storage.getAllArtists();
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
        artists: artists.map(a => ({
          ...a.profile,
          slug: a.profile.slug || createSlug(a.profile.name || a.publicKey),
          publicKey: a.publicKey,
        })),
        releases: [], // Homepage shows artists, not releases
        isServerMode: true, // Flag to show auth links in layout
      };

      const html = templateEngine.renderWithLayout('index', data);
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering homepage:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * Artist page - Show artist profile and releases
   */
  app.get('/artists/:slug', async (req, res) => {
    try {
      const { slug } = req.params;

      // Find artist by slug OR public key (client-side uses pub key in URL)
      const artists = await storage.getAllArtists();
      let artist = artists.find(a => {
        const artistSlug = a.profile.slug || createSlug(a.profile.name || a.publicKey);
        return artistSlug === slug || a.publicKey === slug;
      });

      // Fallback: if slug looks like a public key (long string), create temporary artist
      if (!artist && slug.length > 40) {
        artist = {
          publicKey: slug,
          profile: {
            name: 'Artist',
            slug: slug,
          }
        };
      }

      if (!artist) {
        res.status(404).send('Artist not found');
        return;
      }

      // Get artist releases
      const releases = await storage.getArtistReleases(artist.publicKey);
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
        artist: {
          ...artist.profile,
          slug,
          publicKey: artist.publicKey,
        },
        releases: releases.map(r => ({
          config: r.config,
          slug: r.slug,
          coverUrl: r.config.cover ? `/storage/${artist.publicKey}/releases/${r.slug}/${path.basename(r.config.cover)}` : null,
          url: `/artists/${slug}/${r.slug}`,
        })),
      };

      const html = templateEngine.renderWithLayout('index', data);
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering artist page:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * Release page - Show release details
   */
  app.get('/artists/:slug/:release', async (req, res) => {
    try {
      const { slug, release: releaseSlug } = req.params;

      // Find artist by slug OR public key (client-side uses pub key in URL)
      const artists = await storage.getAllArtists();
      let artist = artists.find(a => {
        const artistSlug = a.profile.slug || createSlug(a.profile.name || a.publicKey);
        return artistSlug === slug || a.publicKey === slug;
      });

      // Fallback: if slug looks like a public key (long string), create temporary artist
      if (!artist && slug.length > 40) {
        // Treat slug as public key directly (for client-side created artists)
        artist = {
          publicKey: slug,
          profile: {
            name: 'Artist',
            slug: slug,
          }
        };
      }

      if (!artist) {
        res.status(404).send('Artist not found');
        return;
      }

      // Get release config
      const releaseConfig = await storage.getRelease(artist.publicKey, releaseSlug);
      if (!releaseConfig) {
        res.status(404).send('Release not found');
        return;
      }

      // Get release tracks
      const tracks = await storage.getReleaseTracks(artist.publicKey, releaseSlug);

      const catalog = {
        title: options.serverTitle,
        description: options.serverDescription,
        url: req.protocol + '://' + req.get('host'),
        basePath: '',
        theme: 'default',
        language: 'en',
      };

      const baseUrl = req.protocol + '://' + req.get('host');
      const releasePath = `/artists/${slug}/${releaseSlug}`;

      const data = {
        basePath: '',
        catalog,
        artist: {
          ...artist.profile,
          slug,
        },
        release: {
          config: releaseConfig,
          slug: releaseSlug,
          coverUrl: releaseConfig.cover
            ? `/storage/${artist.publicKey}/releases/${releaseSlug}/${path.basename(releaseConfig.cover)}`
            : null,
          tracks: tracks.map(track => ({
            ...track,
            url: `/storage/${artist.publicKey}/releases/${releaseSlug}/tracks/${path.basename(track.file)}`,
          })),
        },
        backUrl: `/artists/${slug}`,
        releaseUrl: `${baseUrl}${releasePath}`,
        embedCodePath: `${releasePath}/embed-code.txt`,
        embedCompactPath: `${releasePath}/embed-compact.txt`,
      };

      const html = templateEngine.renderWithLayout('release', data, releaseConfig.title);
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering release page:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * Serve audio files
   */
  app.get('/storage/:artistPublicKey/releases/:releaseSlug/tracks/:filename', (req, res) => {
    const { artistPublicKey, releaseSlug, filename } = req.params;
    const filePath = path.join(
      storage.getReleaseStoragePath(artistPublicKey, releaseSlug),
      'tracks',
      filename
    );

    console.log('📁 Serving audio file:', { artistPublicKey, releaseSlug, filename, filePath });

    res.sendFile(path.resolve(filePath), (err) => {
      if (err) {
        console.error('Error serving audio file:', err);
        res.status(404).send('File not found');
      }
    });
  });

  /**
   * Serve cover images
   */
  app.get('/storage/:artistPublicKey/releases/:releaseSlug/:filename', (req, res) => {
    const { artistPublicKey, releaseSlug, filename } = req.params;
    const filePath = path.join(
      storage.getReleaseStoragePath(artistPublicKey, releaseSlug),
      filename
    );

    res.sendFile(path.resolve(filePath), (err) => {
      if (err) {
        console.error('Error serving cover image:', err);
        res.status(404).send('File not found');
      }
    });
  });

  /**
   * API: Get all artists (JSON)
   */
  app.get('/api/artists', async (req, res) => {
    try {
      const artists = await storage.getAllArtists();
      res.json(artists.map(a => ({
        publicKey: a.publicKey,
        ...a.profile,
        slug: a.profile.slug || createSlug(a.profile.name || a.publicKey),
      })));
    } catch (error: any) {
      console.error('Error getting artists:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  /**
   * API: Get artist releases (JSON)
   */
  app.get('/api/artists/:slug/releases', async (req, res) => {
    try {
      const { slug } = req.params;
      const artists = await storage.getAllArtists();
      const artist = artists.find(a => {
        const artistSlug = a.profile.slug || createSlug(a.profile.name || a.publicKey);
        return artistSlug === slug;
      });

      if (!artist) {
        res.status(404).json({ error: 'Artist not found' });
        return;
      }

      const releases = await storage.getArtistReleases(artist.publicKey);
      res.json(releases);
    } catch (error: any) {
      console.error('Error getting releases:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  /**
   * Auth pages - Login and Register
   */
  app.get('/auth/login', async (req, res) => {
    try {
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
        isLogin: true,
        error: req.query.error as string || null,
      };

      const html = templateEngine.renderWithLayout('auth', data, 'Login');
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering login page:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  app.get('/auth/register', async (req, res) => {
    try {
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
        isLogin: false,
        error: req.query.error as string || null,
      };

      const html = templateEngine.renderWithLayout('auth', data, 'Register');
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering register page:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * Redirect shortcuts
   */
  app.get('/login', (req, res) => {
    res.redirect('/auth/login');
  });

  app.get('/register', (req, res) => {
    res.redirect('/auth/register');
  });

  /**
   * Dashboard page
   */
  app.get('/dashboard', async (req, res) => {
    try {
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
        basePath: '',
      };

      const html = templateEngine.renderWithLayout('dashboard', data, 'Dashboard');
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering dashboard page:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * Release management page
   */
  app.get('/dashboard/releases/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
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
        basePath: '',
        slug, // Pass slug to template for client-side loading
      };

      const html = templateEngine.renderWithLayout('release-manage', data, 'Manage Release');
      res.send(html);
    } catch (error: any) {
      console.error('Error rendering release management page:', error);
      res.status(500).send('Internal Server Error');
    }
  });
}
