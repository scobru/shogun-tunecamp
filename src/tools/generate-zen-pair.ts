#!/usr/bin/env node

/**
 * Tunecamp ZEN Pair Generator
 * Generates a secp256k1 key pair for ZEN authentication
 * 
 * Usage:
 *   npx ts-node src/tools/generate-zen-pair.ts [options]
 * 
 * Examples:
 *   npx ts-node src/tools/generate-zen-pair.ts
 *   npx ts-node src/tools/generate-zen-pair.ts --output ./zen-keypair.json
 */

// @ts-ignore
import Gun from 'zen';
import fs from 'fs';
import path from 'path';

const DEFAULT_OUTPUT_FILE = './zen-keypair.json';

interface ZENKeyPair {
  pub: string;
  priv: string;
  epub: string;
  epriv: string;
  curve: string;
}

/**
 * Generate ZEN key pair
 */
async function generateZENPair(): Promise<ZENKeyPair> {
  // @ts-ignore
  return await Gun.pair();
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Tunecamp ZEN Pair Generator

Generates a secp256k1 key pair for ZEN authentication.
This pair allows you to write to your private ZEN graph space.

Usage:
  npx ts-node src/tools/generate-zen-pair.ts [options]

Options:
  --output <file>   Output file path (default: ./zen-keypair.json)
  --help, -h        Show this help message

Examples:
  npx ts-node src/tools/generate-zen-pair.ts
  npx ts-node src/tools/generate-zen-pair.ts --output ./my-keypair.json

Security Notes:
  - Keep this file secure and never commit it to version control
  - Add zen-keypair.json to your .gitignore
  - This pair gives full access to your private ZEN space
  - If compromised, generate a new pair and update your configuration
`);
    process.exit(0);
  }
  
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex >= 0 && args[outputIndex + 1]
    ? args[outputIndex + 1]
    : DEFAULT_OUTPUT_FILE;
  
  try {
    console.log('\n🔑 Tunecamp ZEN Pair Generator');
    console.log('================================\n');
    console.log('Generating ZEN key pair (secp256k1)...');
    
    const pair = await generateZENPair();
    
    // Create output object with metadata
    const output = {
      generated: new Date().toISOString(),
      pub: pair.pub,
      priv: pair.priv,
      epub: pair.epub,
      epriv: pair.epriv,
      curve: pair.curve,
      note: 'Keep this file secure! Never commit it to version control.',
    };
    
    // Ensure directory exists
    const outputDir = path.dirname(outputFile);
    if (outputDir !== '.' && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write to file
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    
    console.log(`\n✅ ZEN pair generated successfully!`);
    console.log(`\n📁 Saved to: ${path.resolve(outputFile)}`);
    console.log(`\n📋 Public Key (pub): ${pair.pub.substring(0, 20)}...`);
    console.log(`\n⚠️  Security Reminders:`);
    console.log(`   - Add ${path.basename(outputFile)} to your .gitignore`);
    console.log(`   - Keep this file secure and private`);
    console.log(`\n💡 Next steps:`);
    console.log(`   Use this pair in your configuration or tools.`);
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error generating ZEN pair:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
