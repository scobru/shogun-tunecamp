/**
 * Authentication Routes
 */

import express from 'express';
import { GunDBStorage } from '../storage/gunDBStorage.js';

export function setupAuthRoutes(
  app: express.Application,
  storage: GunDBStorage
): void {
  /**
   * Register new artist
   * POST /api/auth/register
   * Body: { alias: string, password: string, profile: ArtistConfig }
   */
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { alias, password, profile } = req.body;

      if (!alias || !password) {
        res.status(400).json({ error: 'Alias and password are required' });
        return;
      }

      // Register user in GunDB
      const credentials = await storage.register(alias, password);

      // Save profile
      if (profile) {
        await storage.saveArtist(credentials.pub, {
          ...profile,
          slug: profile.slug || alias.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        });
      }

      res.json({
        success: true,
        token: credentials.pub,
        publicKey: credentials.pub,
        alias: credentials.alias,
        // SEA keypair for client-side operations
        sea: {
          pub: credentials.pub,
          priv: credentials.priv,
          epub: credentials.epub,
          epriv: credentials.epriv,
        },
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(400).json({ error: error.message || 'Registration failed' });
    }
  });

  /**
   * Login artist
   * POST /api/auth/login
   * Body: { alias: string, password: string }
   */
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { alias, password } = req.body;

      if (!alias || !password) {
        res.status(400).json({ error: 'Alias and password are required' });
        return;
      }

      // Check if user is already authenticated with the same alias
      const currentUser = storage.getCurrentUser();
      if (currentUser && currentUser.alias === alias) {
        // User is already logged in with this alias
        const profile = await storage.getArtist(currentUser.pub);
        res.json({
          success: true,
          token: currentUser.pub,
          publicKey: currentUser.pub,
          alias: currentUser.alias,
          profile,
        });
        return;
      }

      // Logout any existing user with different alias to avoid conflicts
      if (currentUser && currentUser.alias !== alias) {
        try {
          await storage.logout();
          // Wait longer for GunDB to clean up properly
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          // Continue even if logout fails
        }
      }

      // Now attempt login (handles logout internally if needed)
      const credentials = await storage.login(alias, password);
      const profile = await storage.getArtist(credentials.pub);

      // Return token and keypair
      res.json({
        success: true,
        token: credentials.pub,
        publicKey: credentials.pub,
        alias: credentials.alias,
        profile,
        // SEA keypair for client-side operations
        sea: {
          pub: credentials.pub,
          priv: credentials.priv,
          epub: credentials.epub,
          epriv: credentials.epriv,
        },
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(401).json({ error: error.message || 'Login failed' });
    }
  });

  /**
   * Logout artist
   * POST /api/auth/logout
   */
  app.post('/api/auth/logout', async (req, res) => {
    try {
      await storage.logout();
      res.json({ success: true });
    } catch (error: any) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  /**
   * Get current user
   * GET /api/auth/me
   */
  app.get('/api/auth/me', async (req, res) => {
    try {
      const user = storage.getCurrentUser();
      if (!user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const profile = await storage.getArtist(user.pub);
      res.json({
        publicKey: user.pub,
        alias: user.alias,
        profile,
      });
    } catch (error: any) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

}
