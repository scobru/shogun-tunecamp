/**
 * Tunecamp Server Mode
 * Multi-artist self-hosted music platform
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { GunDBStorage } from './storage/gunDBStorage.js';
import { setupPublicRoutes } from './routes/public.js';
import { setupAuthRoutes } from './routes/auth.js';
import { setupArtistRoutes } from './routes/artists.js';
import { setupReleaseRoutes } from './routes/releases.js';
import { TemplateEngine } from '../generator/templateEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  port?: number;
  storagePath?: string; // Local storage path for files
  gunPeers?: string[];
  serverTitle?: string;
  serverDescription?: string;
}

export class TunecampServer {
  private app: express.Application;
  private storage: GunDBStorage;
  private templateEngine: TemplateEngine;
  private options: Required<ServerOptions>;
  private templateDir: string;

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port || 3000,
      storagePath: options.storagePath || './storage',
      gunPeers: options.gunPeers || [], // Empty array = use defaults from GUN_PEERS constant in gunDBStorage
      serverTitle: options.serverTitle || 'Tunecamp Server',
      serverDescription: options.serverDescription || 'Multi-artist music platform',
    };

    this.app = express();
    this.storage = new GunDBStorage({
      peers: this.options.gunPeers,
      storagePath: this.options.storagePath,
    });

    this.templateEngine = new TemplateEngine();
    // Get template directory - in dist, __dirname is dist/server, so go up to project root
    this.templateDir = path.join(__dirname, '../../templates/default');

    this.setupMiddleware();
    this.setupRoutes();
    // Templates will be loaded in start() method before server starts
  }

  private setupMiddleware(): void {
    // Body parser
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Static files (storage)
    this.app.use('/storage', express.static(this.options.storagePath));

    // Static assets from templates (CSS, JS, etc.)
    const assetsPath = path.join(this.templateDir, 'assets');
    this.app.use('/assets', express.static(assetsPath));

    // Serve logo.svg from root
    const logoPath = path.join(__dirname, '../../logo.svg');
    this.app.get('/logo.svg', (req, res) => {
      res.sendFile(path.resolve(logoPath));
    });

    // CORS (opzionale, per sviluppo)
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
  }

  private async loadTemplates(): Promise<void> {
    const templates = ['layout', 'index', 'release', 'auth', 'dashboard', 'release-manage'];

    for (const templateName of templates) {
      const templatePath = path.join(this.templateDir, `${templateName}.hbs`);

      if (await fs.pathExists(templatePath)) {
        await this.templateEngine.loadTemplate(templatePath, templateName);
      } else {
        console.warn(`⚠️  Template ${templateName}.hbs not found`);
      }
    }
  }

  private setupRoutes(): void {
    // Public routes
    setupPublicRoutes(this.app, this.storage, this.templateEngine, this.options);

    // Auth routes
    setupAuthRoutes(this.app, this.storage);

    // Artist routes (authenticated)
    setupArtistRoutes(this.app, this.storage, this.templateEngine, this.options);

    // Release routes (authenticated)
    setupReleaseRoutes(this.app, this.storage, this.templateEngine, this.options);
  }

  async start(): Promise<void> {
    // Ensure storage directory exists
    await fs.ensureDir(this.options.storagePath);

    // Wait for templates to be loaded
    await this.loadTemplates();

    this.app.listen(this.options.port, () => {
      console.log('\n🎵 Tunecamp Server Mode');
      console.log('========================');
      console.log(`🚀 Server running on http://localhost:${this.options.port}`);
      console.log(`📂 Storage: ${path.resolve(this.options.storagePath)}`);
      const gunInstance = (this.storage as any).gun;
      const peersCount = gunInstance?.opt?.peers?.length || gunInstance?._?.opt?.peers?.length || 0;
      console.log(`🌐 GunDB peers: ${peersCount}`);
      console.log('');
      console.log('📖 Quick Start:');
      console.log('  1. Register: /auth/register');
      console.log('  2. Login: /auth/login');
      console.log('  3. Dashboard: /dashboard');
      console.log('  4. Create release: POST /api/me/releases');
      console.log('  5. Upload files: POST /api/me/releases/:slug/cover');
      console.log('');
      console.log('📚 Docs: ./docs/SERVER_MODE_QUICKSTART.md');
      console.log('');
    });
  }
}
