import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import { getStandardCoverFilename } from './audioUtils.js';
/**
 * File utility functions
 */
export async function getFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}
export async function findAudioFiles(directory) {
    const audioExtensions = ['mp3', 'flac', 'ogg', 'wav', 'm4a', 'aac', 'opus'];
    const pattern = `**/*.{${audioExtensions.join(',')}}`;
    const files = await glob(pattern, {
        cwd: directory,
        absolute: false,
        nodir: true,
    });
    return files.sort();
}
export async function findImageFiles(directory, name) {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const pattern = name
        ? `**/${name}.{${imageExtensions.join(',')}}`
        : `**/*.{${imageExtensions.join(',')}}`;
    const files = await glob(pattern, {
        cwd: directory,
        absolute: false,
        nodir: true,
    });
    return files;
}
export async function findCover(directory) {
    const coverNames = [
        getStandardCoverFilename('jpg').replace('.jpg', ''),
        getStandardCoverFilename('png').replace('.png', ''),
        'cover',
        'artwork',
        'folder',
        'album'
    ];
    // Optimization: Scan directory once for all images instead of multiple globs
    const images = await findImageFiles(directory);
    if (images.length === 0) {
        return undefined;
    }
    for (const name of coverNames) {
        const match = images.find(img => {
            const parsed = path.parse(img);
            return parsed.name.toLowerCase() === name.toLowerCase();
        });
        if (match) {
            return match;
        }
    }
    // Fallback to any image in the directory
    return images[0];
}
export async function ensureDir(dir) {
    await fs.ensureDir(dir);
}
export async function copyFile(src, dest) {
    await fs.ensureDir(path.dirname(dest));
    await fs.copy(src, dest);
}
export async function readFile(filePath) {
    return await fs.readFile(filePath, 'utf-8');
}
export async function writeFile(filePath, content) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
}
export async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
export function createSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
export function getRelativePath(from, to) {
    return path.relative(from, to).replace(/\\/g, '/');
}
/**
 * Robustly resolves a relative path against a root directory, ensuring no traversal.
 * Returns null if the path is invalid, tries to traverse out of root, or contains null bytes.
 */
export function resolveSafePath(rootDir, userPath) {
    if (userPath.includes('\0'))
        return null;
    const resolvedRoot = path.resolve(rootDir);
    const relativePath = userPath.replace(/^[/\\]+/, '');
    const absPath = path.resolve(resolvedRoot, relativePath);
    return isSafePath(resolvedRoot, absPath) ? absPath : null;
}
/**
 * Validates whether an absolute path is safely contained within a root directory.
 */
function isSafePath(resolvedRoot, absPath) {
    const relative = path.relative(resolvedRoot, absPath);
    // Check if it escapes the directory
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return false;
    }
    // Double check the absolute path to be absolutely sure
    if (!absPath.startsWith(resolvedRoot + path.sep) && absPath !== resolvedRoot) {
        return false;
    }
    return true;
}
/**
 * Executes an array of tasks in parallel with a concurrency limit
 */
export async function parallel(items, limit, fn) {
    const promises = [];
    const executing = new Set();
    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item));
        promises.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }
    await Promise.all(promises);
}
