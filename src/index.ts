#!/usr/bin/env node

/**
 * Tunecamp Server Entry Point
 * Consistently loads configuration and starts the streaming server.
 */

import { loadConfig } from './server/config.js';
import { startServer } from './server/server.js';

process.on('uncaughtException', (err) => {
  console.error('\n🚨 FATAL UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n🚨 FATAL UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

async function main() {
  try {
    const config = loadConfig();
    
    console.log('🎶 Starting Tunecamp Server...');
    console.log(`📡 Port: ${config.port}`);
    console.log(`📂 Music Directory: ${config.musicDir}`);
    console.log(`🗄️  Database Path: ${config.dbPath}`);
    console.log('');

    await startServer(config);
  } catch (error) {
    console.error('❌ Error starting Tunecamp:', error);
    process.exit(1);
  }
}

main();
