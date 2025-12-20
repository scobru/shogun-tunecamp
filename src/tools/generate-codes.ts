#!/usr/bin/env node

/**
 * Tunecamp Unlock Codes Generator
 * CLI tool to generate and manage unlock codes for releases
 * 
 * Usage:
 *   npx ts-node src/tools/generate-codes.ts <release-slug> [options]
 * 
 * Examples:
 *   npx ts-node src/tools/generate-codes.ts my-album --count 10
 *   npx ts-node src/tools/generate-codes.ts my-album --count 50 --downloads 3
 */

import Gun from 'gun';
import crypto from 'crypto';

// Default public GunDB peers
const DEFAULT_PEERS = [
    'https://gun-manhattan.herokuapp.com/gun',
    'https://gun-us.herokuapp.com/gun',
];

interface CodeOptions {
    releaseSlug: string;
    count: number;
    maxDownloads: number;
    expiresInDays?: number;
    namespace: string;
    peers: string[];
}

/**
 * Generate a random unlock code
 */
function generateCode(): string {
    // Format: XXXX-XXXX-XXXX (alphanumeric, no ambiguous chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0, O, 1, I
    const segments = 3;
    const segmentLength = 4;

    const code: string[] = [];
    for (let s = 0; s < segments; s++) {
        let segment = '';
        for (let i = 0; i < segmentLength; i++) {
            segment += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        code.push(segment);
    }

    return code.join('-');
}

/**
 * Hash a code for storage
 */
function hashCode(code: string): string {
    return crypto
        .createHash('sha256')
        .update(code.toLowerCase().trim())
        .digest('hex');
}

/**
 * Generate codes and store in GunDB
 */
async function generateCodes(options: CodeOptions): Promise<string[]> {
    const { releaseSlug, count, maxDownloads, expiresInDays, namespace, peers } = options;

    console.log(`\n🔐 Tunecamp Unlock Codes Generator`);
    console.log(`================================`);
    console.log(`Release: ${releaseSlug}`);
    console.log(`Count: ${count}`);
    console.log(`Max downloads per code: ${maxDownloads}`);
    if (expiresInDays) console.log(`Expires in: ${expiresInDays} days`);
    console.log(`\nConnecting to GunDB peers...`);

    // Initialize Gun
    const gun = Gun({ peers });

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    const codes: string[] = [];
    const expiresAt = expiresInDays
        ? Date.now() + (expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    console.log(`\nGenerating ${count} codes...`);

    for (let i = 0; i < count; i++) {
        const code = generateCode();
        const codeHash = hashCode(code);

        // Store in GunDB
        gun
            .get(namespace)
            .get('releases')
            .get(releaseSlug)
            .get('codes')
            .get(codeHash)
            .put({
                createdAt: Date.now(),
                used: false,
                downloads: 0,
                maxDownloads,
                expiresAt,
            });

        codes.push(code);
        process.stdout.write(`\r  Progress: ${i + 1}/${count}`);
    }

    // Wait for sync
    console.log(`\n\nSyncing to peers...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    return codes;
}

/**
 * Main CLI
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Tunecamp Unlock Codes Generator

Usage:
  npx ts-node src/tools/generate-codes.ts <release-slug> [options]

Options:
  --count <n>       Number of codes to generate (default: 10)
  --downloads <n>   Max downloads per code (default: 1)
  --expires <days>  Days until codes expire (optional)
  --namespace <ns>  GunDB namespace (default: tunecamp)
  --output <file>   Save codes to file (optional)
  --help            Show this help

Examples:
  npx ts-node src/tools/generate-codes.ts my-album --count 10
  npx ts-node src/tools/generate-codes.ts my-album --count 50 --downloads 3 --output codes.txt
`);
        process.exit(0);
    }

    const releaseSlug = args[0];
    const count = parseInt(args[args.indexOf('--count') + 1] || '10');
    const maxDownloads = parseInt(args[args.indexOf('--downloads') + 1] || '1');
    const expiresInDays = args.includes('--expires')
        ? parseInt(args[args.indexOf('--expires') + 1])
        : undefined;
    const namespace = args[args.indexOf('--namespace') + 1] || 'tunecamp';
    const outputFile = args.includes('--output')
        ? args[args.indexOf('--output') + 1]
        : null;

    try {
        const codes = await generateCodes({
            releaseSlug,
            count,
            maxDownloads,
            expiresInDays,
            namespace,
            peers: DEFAULT_PEERS,
        });

        console.log(`\n✅ Generated ${codes.length} codes:\n`);
        console.log(`${'─'.repeat(50)}`);
        codes.forEach((code, i) => {
            console.log(`  ${(i + 1).toString().padStart(3)}. ${code}`);
        });
        console.log(`${'─'.repeat(50)}`);

        // Save to file if requested
        if (outputFile) {
            const fs = await import('fs');
            const content = [
                `# Unlock Codes for: ${releaseSlug}`,
                `# Generated: ${new Date().toISOString()}`,
                `# Max downloads per code: ${maxDownloads}`,
                expiresInDays ? `# Expires in: ${expiresInDays} days` : '',
                '',
                ...codes,
            ].filter(Boolean).join('\n');

            fs.writeFileSync(outputFile, content);
            console.log(`\n📁 Codes saved to: ${outputFile}`);
        }

        console.log(`\n📋 Instructions for your release.yaml:`);
        console.log(`\n  download: codes`);
        console.log(`  unlockCodes:`);
        console.log(`    enabled: true`);
        console.log(`    namespace: ${namespace}`);

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
