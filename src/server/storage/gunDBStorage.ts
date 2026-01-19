/**
 * GunDB Storage Layer for Tunecamp Server Mode
 * Handles all database operations using GunDB
 */

import Gun from 'gun';
import SEA from 'gun/sea';
import { ArtistConfig, ReleaseConfig, TrackMetadata } from '../../types/index.js';
import {
  serializeReleaseConfig,
  deserializeReleaseConfig,
  serializeArtistConfig,
  deserializeArtistConfig,
  serializeTrackMetadata,
  deserializeTrackMetadata,
} from './gunSerializer.js';

const GUN_PEERS = [
  'https://shogun-relay.scobrudot.dev/gun',
  'https://gun.defucc.me/gun',
  'https://gun.o8.is/gun',
  'https://relay.peer.ooo/gun',
];

const STORAGE_ROOT = 'shogun';
const STORAGE_NAMESPACE = 'tunecamp-server';

export interface GunDBStorageOptions {
  peers?: string[];
  storagePath?: string; // For file storage (audio files, covers)
}

export interface UserCredentials {
  alias: string;
  pub: string;
  // SEA keypair (optional - only returned on login/register)
  priv?: string;
  epub?: string;
  epriv?: string;
}

export class GunDBStorage {
  private gun: any;
  private storagePath: string;
  private initialized: boolean = false;

  constructor(options: GunDBStorageOptions = {}) {
    // Use provided peers, or empty array means use defaults
    const peers = (options.peers && options.peers.length > 0) ? options.peers : GUN_PEERS;
    this.storagePath = options.storagePath || './storage';

    this.gun = Gun({
      peers,
      localStorage: false, // Server-side, no localStorage
      radisk: false, // Disable radisk for server
    });

    this.initialized = true;
    // Verify peers are set
    const actualPeers = this.gun.opt?.peers || peers;
    console.log(`🔐 GunDB Storage initialized with ${actualPeers.length} peer(s)`);
    if (actualPeers.length > 0) {
      console.log(`   Peers: ${actualPeers.slice(0, 2).join(', ')}${actualPeers.length > 2 ? '...' : ''}`);
    }
  }

  /**
   * Get root node for storage
   */
  private getRoot() {
    return this.gun.get(STORAGE_ROOT).get(STORAGE_NAMESPACE);
  }

  /**
   * Get artists collection
   */
  private getArtists() {
    return this.getRoot().get('artists');
  }

  /**
   * Get artist node by public key
   */
  private getArtistNode(publicKey: string) {
    return this.getArtists().get(publicKey);
  }

  /**
   * User authentication and registration
   */
  async register(alias: string, password: string): Promise<UserCredentials> {
    return new Promise((resolve, reject) => {
      this.gun.user().create(alias, password, (ack: any) => {
        if (ack.err) {
          reject(new Error(ack.err));
          return;
        }
        // Extract full keypair from gun.user()._
        const user = this.gun.user();
        const sea = user._.sea;
        const pub = (user.is?.pub as string) || '';

        resolve({
          alias,
          pub,
          priv: sea?.priv,
          epub: sea?.epub,
          epriv: sea?.epriv,
        });
      });
    });
  }

  async login(alias: string, password: string): Promise<UserCredentials> {
    return new Promise(async (resolve, reject) => {
      // First, ensure main instance is logged out
      try {
        this.gun.user().leave();
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        // Continue even if logout fails
      }

      // Use main Gun instance for login
      const user = this.gun.user();

      // Helper to extract credentials
      const extractCredentials = (): UserCredentials => {
        const sea = user._.sea;
        const pub = (user.is?.pub as string) || '';
        return {
          alias,
          pub,
          priv: sea?.priv,
          epub: sea?.epub,
          epriv: sea?.epriv,
        };
      };

      // Attempt login
      user.auth(alias, password, (ack: any) => {
        if (ack.err) {
          // If error mentions "already authenticated" or "being created", 
          // it means GunDB SEA is in a conflicting state
          if (ack.err.includes('already') || ack.err.includes('being created') || ack.err.includes('authenticated')) {
            // Try to clear state and retry once
            this.gun.user().leave();
            setTimeout(() => {
              user.auth(alias, password, (retryAck: any) => {
                if (retryAck.err) {
                  reject(new Error(`Authentication failed: ${retryAck.err}`));
                } else {
                  setTimeout(() => {
                    const creds = extractCredentials();
                    if (!creds.pub) {
                      reject(new Error('Authentication failed: No public key received'));
                      return;
                    }
                    resolve(creds);
                  }, 400);
                }
              });
            }, 500);
            return;
          }
          reject(new Error(ack.err));
          return;
        }

        // Wait for authentication to complete
        setTimeout(() => {
          const creds = extractCredentials();
          if (!creds.pub) {
            reject(new Error('Authentication failed: No public key received'));
            return;
          }
          resolve(creds);
        }, 400);
      });
    });
  }

  async logout(): Promise<void> {
    return new Promise((resolve) => {
      const user = this.gun.user();
      if (user.is) {
        // Leave current session
        user.leave();
        // Wait longer for GunDB to fully clean up
        setTimeout(() => {
          resolve();
        }, 500);
      } else {
        resolve();
      }
    });
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): UserCredentials | null {
    const user = this.gun.user();
    if (!user || !user.is) return null;
    return {
      alias: (user.is.alias as string) || '',
      pub: (user.is.pub as string) || '',
    };
  }

  /**
   * Artist operations
   */
  async getArtist(publicKey: string): Promise<ArtistConfig | null> {
    return new Promise((resolve) => {
      const artistNode = this.getArtistNode(publicKey);
      artistNode.get('profile').once((data: any) => {
        if (!data || data === null) {
          resolve(null);
          return;
        }
        resolve(deserializeArtistConfig(data));
      });
    });
  }

  async saveArtist(publicKey: string, profile: ArtistConfig): Promise<void> {
    return new Promise((resolve) => {
      const serialized = serializeArtistConfig(profile);
      this.getArtistNode(publicKey).get('profile').put(serialized, (ack: any) => {
        resolve();
      });
    });
  }

  /**
   * Get all artists (public data only)
   */
  async getAllArtists(): Promise<Array<{ publicKey: string; profile: ArtistConfig }>> {
    return new Promise((resolve) => {
      const artists: Array<{ publicKey: string; profile: ArtistConfig }> = [];
      let count = 0;
      let finished = false;

      this.getArtists().map().once((data: any, key: string) => {
        if (data === null || finished) {
          count++;
          if (count >= 100) { // Safety limit
            finished = true;
            resolve(artists);
          }
          return;
        }

        this.getArtistNode(key).get('profile').once((profile: any) => {
          if (profile) {
            artists.push({ publicKey: key, profile: deserializeArtistConfig(profile) });
          }
          count++;
          if (count >= 100) {
            finished = true;
            resolve(artists);
          }
        });
      });

      // Timeout fallback
      setTimeout(() => {
        if (!finished) {
          finished = true;
          resolve(artists);
        }
      }, 5000);
    });
  }

  /**
   * Release operations
   */
  async getRelease(artistPublicKey: string, releaseSlug: string): Promise<ReleaseConfig | null> {
    return new Promise((resolve) => {
      this.getArtistNode(artistPublicKey)
        .get('releases')
        .get(releaseSlug)
        .get('config')
        .once((data: any) => {
          if (!data || data === null) {
            resolve(null);
            return;
          }
          resolve(deserializeReleaseConfig(data));
        });
    });
  }

  async saveRelease(artistPublicKey: string, releaseSlug: string, config: ReleaseConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const releaseNode = this.getArtistNode(artistPublicKey)
        .get('releases')
        .get(releaseSlug);

      const serialized = serializeReleaseConfig(config);

      // Timeout fallback - GunDB sometimes doesn't call callback
      const timeout = setTimeout(() => {
        console.log('saveRelease: timeout reached, resolving anyway');
        resolve();
      }, 3000);

      releaseNode.get('config').put(serialized, (ack: any) => {
        clearTimeout(timeout);
        if (ack && ack.err) {
          console.error('GunDB saveRelease error:', ack.err);
          reject(new Error(ack.err));
          return;
        }
        releaseNode.get('updatedAt').put(Date.now());
        resolve();
      });
    });
  }

  async getReleaseTracks(artistPublicKey: string, releaseSlug: string): Promise<TrackMetadata[]> {
    return new Promise((resolve) => {
      const tracks: TrackMetadata[] = [];
      let count = 0;
      let finished = false;

      this.getArtistNode(artistPublicKey)
        .get('releases')
        .get(releaseSlug)
        .get('tracks')
        .map()
        .once((data: any) => {
          if (data === null || finished) {
            count++;
            if (count >= 50) {
              finished = true;
              resolve(tracks.sort((a, b) => (a.track || 0) - (b.track || 0)));
            }
            return;
          }

          tracks.push(deserializeTrackMetadata(data));
          count++;
          if (count >= 50) {
            finished = true;
            resolve(tracks.sort((a, b) => (a.track || 0) - (b.track || 0)));
          }
        });

      // Timeout fallback
      setTimeout(() => {
        if (!finished) {
          finished = true;
          resolve(tracks.sort((a, b) => (a.track || 0) - (b.track || 0)));
        }
      }, 3000);
    });
  }

  async saveReleaseTrack(artistPublicKey: string, releaseSlug: string, track: TrackMetadata): Promise<void> {
    return new Promise((resolve) => {
      const serialized = serializeTrackMetadata(track);
      this.getArtistNode(artistPublicKey)
        .get('releases')
        .get(releaseSlug)
        .get('tracks')
        .get(track.filename)
        .put(serialized, (ack: any) => {
          resolve();
        });
    });
  }

  async deleteReleaseTrack(artistPublicKey: string, releaseSlug: string, filename: string): Promise<void> {
    return new Promise((resolve) => {
      this.getArtistNode(artistPublicKey)
        .get('releases')
        .get(releaseSlug)
        .get('tracks')
        .get(filename)
        .put(null, (ack: any) => {
          resolve();
        });
    });
  }

  async getArtistReleases(artistPublicKey: string): Promise<Array<{ slug: string; config: ReleaseConfig }>> {
    return new Promise((resolve) => {
      const releases: Array<{ slug: string; config: ReleaseConfig }> = [];
      let count = 0;
      let finished = false;

      this.getArtistNode(artistPublicKey)
        .get('releases')
        .map()
        .once((data: any, slug: string) => {
          if (data === null || finished) {
            count++;
            if (count >= 100) {
              finished = true;
              resolve(releases);
            }
            return;
          }

          this.getArtistNode(artistPublicKey)
            .get('releases')
            .get(slug)
            .get('config')
            .once((config: any) => {
              if (config) {
                releases.push({ slug, config: deserializeReleaseConfig(config) });
              }
              count++;
              if (count >= 100) {
                finished = true;
                resolve(releases.sort((a, b) => {
                  const dateA = new Date(a.config.date).getTime();
                  const dateB = new Date(b.config.date).getTime();
                  return dateB - dateA; // Newest first
                }));
              }
            });
        });

      // Timeout fallback
      setTimeout(() => {
        if (!finished) {
          finished = true;
          resolve(releases.sort((a, b) => {
            const dateA = new Date(a.config.date).getTime();
            const dateB = new Date(b.config.date).getTime();
            return dateB - dateA;
          }));
        }
      }, 5000);
    });
  }

  /**
   * Delete release
   */
  async deleteRelease(artistPublicKey: string, releaseSlug: string): Promise<void> {
    return new Promise((resolve) => {
      this.getArtistNode(artistPublicKey)
        .get('releases')
        .get(releaseSlug)
        .put(null, (ack: any) => {
          resolve();
        });
    });
  }

  /**
   * Get storage path for files (local fallback)
   */
  getStoragePath(): string {
    return this.storagePath;
  }

  /**
   * Get file path for artist (local fallback)
   */
  getArtistStoragePath(publicKey: string): string {
    return `${this.storagePath}/${publicKey}`;
  }

  /**
   * Get file path for release (local fallback)
   */
  getReleaseStoragePath(publicKey: string, releaseSlug: string): string {
    return `${this.getArtistStoragePath(publicKey)}/releases/${releaseSlug}`;
  }

  /**
   * Get file URL (local storage only)
   */
  getFileUrl(filePath: string): string {
    // Local file path
    return `/storage/${filePath}`;
  }

  /**
   * Check if using relay storage (always false - using local storage)
   */
  isUsingRelayStorage(): boolean {
    return false;
  }
}

