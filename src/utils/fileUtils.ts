import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import { getStandardCoverFilename } from './audioUtils.js';

/**
 * File utility functions
 */

export async function getFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function findAudioFiles(directory: string): Promise<string[]> {
  const audioExtensions = ['mp3', 'flac', 'ogg', 'wav', 'm4a', 'aac', 'opus'];
  const pattern = `**/*.{${audioExtensions.join(',')}}`;

  const files = await glob(pattern, {
    cwd: directory,
    absolute: false,
    nodir: true,
  });

  return files.sort();
}

export async function findImageFiles(directory: string, name?: string): Promise<string[]> {
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

export async function findCover(directory: string): Promise<string | undefined> {
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

export async function ensureDir(dir: string): Promise<void> {
  await fs.ensureDir(dir);
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await fs.ensureDir(path.dirname(dest));
  await fs.copy(src, dest);
}

export async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to).replace(/\\/g, '/');
}

/**
 * Robustly resolves a relative path against a root directory, ensuring no traversal.
 * Returns null if the path is invalid, tries to traverse out of root, or contains null bytes.
 */
export function resolveSafePath(rootDir: string, userPath: string): string | null {
  // Prevent null byte injection
  if (userPath.indexOf('\0') !== -1) {
    return null;
  }

  const resolvedRoot = path.resolve(rootDir);

  // Normalize user path by removing leading slashes to treat it as relative
  let relativePath = userPath;
  while (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    relativePath = relativePath.substring(1);
  }

  const absPath = path.resolve(resolvedRoot, relativePath);

  // Check if path is within root
  const relative = path.relative(resolvedRoot, absPath);

  // path.relative returns strings like '..' if outside, or absolute path if different drive
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return absPath;
}

/**
 * Executes an array of tasks in parallel with a concurrency limit
 */
export async function parallel<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<any>
): Promise<void> {
  const promises: Promise<any>[] = [];
  const executing = new Set<Promise<any>>();

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
