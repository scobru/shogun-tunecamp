#!/usr/bin/env node

/**
 * Tunecamp SEA Pair Generator
 * Generates a GunDB SEA (Secure Encryption Algorithm) key pair for authentication
 * 
 * Usage:
 *   npx ts-node src/tools/generate-sea-pair.ts [options]
 * 
 * Examples:
 *   npx ts-node src/tools/generate-sea-pair.ts
 *   npx ts-node src/tools/generate-sea-pair.ts --output ./gundb-keypair.json
 */

import Gun from 'gun';
import SEA from 'gun/sea.js';
import fs from 'fs';
import path from 'path';

const DEFAULT_OUTPUT_FILE = './gundb-keypair.json';

interface SEAKeyPair {
  pub: string;
  priv: string;
  epub: string;
  epriv: string;
}

/**
 * Generate SEA key pair
 */
async function generateSEAPair(): Promise<SEAKeyPair> {
  // Initialize Gun to get SEA
  const gun = Gun();
  
  // Wait for SEA to be ready
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Generate pair
  return new Promise((resolve, reject) => {
    
    
    SEA.pair((data: SEAKeyPair) => {
      if (!data || !data.pub || !data.priv || !data.epub || !data.epriv) {
        reject(new Error('Failed to generate SEA pair'));
        return;
      }
      resolve(data);
    });
  });
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Tunecamp SEA Pair Generator

Generates a GunDB SEA (Secure Encryption Algorithm) key pair for secure authentication.
This pair allows you to write to your private GunDB space instead of public space.

Usage:
  npx ts-node src/tools/generate-sea-pair.ts [options]

Options:
  --output <file>   Output file path (default: ./gundb-keypair.json)
  --help, -h        Show this help message

Examples:
  npx ts-node src/tools/generate-sea-pair.ts
  npx ts-node src/tools/generate-sea-pair.ts --output ./my-keypair.json

Security Notes:
  - Keep this file secure and never commit it to version control
  - Add gundb-keypair.json to your .gitignore
  - This pair gives full access to your private GunDB space
  - If compromised, generate a new pair and update your configuration
`);
    process.exit(0);
  }
  
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex >= 0 && args[outputIndex + 1]
    ? args[outputIndex + 1]
    : DEFAULT_OUTPUT_FILE;
  
  try {
    console.log('\n🔑 Tunecamp SEA Pair Generator');
    console.log('================================\n');
    console.log('Generating SEA key pair...');
    
    const pair = await generateSEAPair();
    
    // Create output object with metadata
    const output = {
      generated: new Date().toISOString(),
      pub: pair.pub,
      priv: pair.priv,
      epub: pair.epub,
      epriv: pair.epriv,
      note: 'Keep this file secure! Never commit it to version control.',
    };
    
    // Ensure directory exists
    const outputDir = path.dirname(outputFile);
    if (outputDir !== '.' && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write to file
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    
    console.log(`\n✅ SEA pair generated successfully!`);
    console.log(`\n📁 Saved to: ${path.resolve(outputFile)}`);
    console.log(`\n📋 Public Key (pub): ${pair.pub.substring(0, 20)}...`);
    console.log(`\n⚠️  Security Reminders:`);
    console.log(`   - Add ${path.basename(outputFile)} to your .gitignore`);
    console.log(`   - Keep this file secure and private`);
    console.log(`   - Use this pair with generate-codes.ts for private code storage`);
    console.log(`\n💡 Next steps:`);
    console.log(`   Use this pair with generate-codes.ts:`);
    console.log(`   npx ts-node src/tools/generate-codes.ts <release-slug> --keypair ${outputFile}`);
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error generating SEA pair:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
