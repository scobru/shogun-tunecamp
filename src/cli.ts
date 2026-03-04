#!/usr/bin/env node

/**
 * Command-line interface for Tunecamp
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('tunecamp')
  .description('A decentralized music platform for artists and labels')
  .version('2.0.0');

// Server mode - streaming music server with API
program
  .command('server')
  .description('Start TuneCamp as a music streaming server')
  .argument('[music-dir]', 'Directory containing music files', './music')
  .option('-p, --port <port>', 'Port number', '1970')
  .option('-d, --db <path>', 'Database file path', './tunecamp.db')
  .action(async (musicDir: string, options: any) => {
    try {
      const { loadConfig } = await import('./server/config.js');
      const { startServer } = await import('./server/server.js');

      const config = loadConfig({
        port: parseInt(options.port, 10),
        musicDir: path.resolve(musicDir),
        dbPath: path.resolve(options.db),
      });

      console.log(chalk.blue('🎶 Starting TuneCamp Server...'));
      console.log('');

      await startServer(config);
    } catch (error) {
      console.error(chalk.red('Error starting server:'), error);
      process.exit(1);
    }

  });

program
  .command('backup')
  .description('Backup the database')
  .argument('[target-dir]', 'Directory to store backup', './backups')
  .option('-d, --db <path>', 'Database file path', './tunecamp.db')
  .action(async (targetDir: string, options: any) => {
    try {
      const dbPath = path.resolve(options.db);
      const backupDir = path.resolve(targetDir);

      if (!await fs.pathExists(dbPath)) {
        console.error(chalk.red(`Error: Database file not found at ${dbPath}`));
        process.exit(1);
      }

      await fs.ensureDir(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `tunecamp-${timestamp}.db`;
      const backupPath = path.join(backupDir, backupName);

      await fs.copy(dbPath, backupPath);

      console.log(chalk.green(`✅ Database backed up manually to:`));
      console.log(chalk.blue(backupPath));
    } catch (error) {
      console.error(chalk.red('Error creating backup:'), error);
      process.exit(1);
    }
  });

program
  .command('restore')
  .description('Restore the database from a backup')
  .argument('<backup-file>', 'Backup file to restore from')
  .option('-d, --db <path>', 'Database file path', './tunecamp.db')
  .option('-f, --force', 'Force overwrite existing database', false)
  .action(async (backupFile: string, options: any) => {
    try {
      const sourcePath = path.resolve(backupFile);
      const dbPath = path.resolve(options.db);

      if (!await fs.pathExists(sourcePath)) {
        console.error(chalk.red(`Error: Backup file not found at ${sourcePath}`));
        process.exit(1);
      }

      if (await fs.pathExists(dbPath) && !options.force) {
        console.error(chalk.yellow(`Warning: Database already exists at ${dbPath}`));
        console.error(chalk.yellow(`Use -f or --force to overwrite.`));
        process.exit(1);
      }

      if (await fs.pathExists(dbPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safetyPath = `${dbPath}.pre-restore-${timestamp}.bak`;
        await fs.copy(dbPath, safetyPath);
        console.log(chalk.gray(`Created safety backup at ${safetyPath}`));
      }

      await fs.copy(sourcePath, dbPath);
      console.log(chalk.green(`✅ Database restored successfully to:`));
      console.log(chalk.blue(dbPath));

    } catch (error) {
      console.error(chalk.red('Error restoring backup:'), error);
      process.exit(1);
    }
  });

program.parse();
