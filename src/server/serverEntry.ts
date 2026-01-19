/**
 * Entry point for Tunecamp Server Mode
 * Run with: npm run server
 */

import 'dotenv/config';
import { TunecampServer } from './server.js';

const server = new TunecampServer({
  port: parseInt(process.env.PORT || '3000'),
  storagePath: process.env.STORAGE_PATH || './storage',
  serverTitle: process.env.SERVER_TITLE || 'Tunecamp Server',
  serverDescription: process.env.SERVER_DESCRIPTION || 'Multi-artist music platform',
  gunPeers: process.env.GUN_PEERS ? process.env.GUN_PEERS.split(',').filter(p => p.trim()).length > 0 ? process.env.GUN_PEERS.split(',').filter(p => p.trim()) : undefined : undefined, // undefined = use defaults
  relayUrl: process.env.RELAY_URL || '',
  relayApiKey: process.env.RELAY_API_KEY || '',
  useRelayStorage: !!process.env.RELAY_URL,
});

server.start().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
