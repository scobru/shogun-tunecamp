import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { getStandardCoverFilename } from './audioUtils.js';

/**
 * File utility functions
 */

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

  for (const name of coverNames) {
    const covers = await findImageFiles(directory, name);
    if (covers.length > 0) {
      return covers[0];
    }
  }

  // Fallback to any image in the directory
  const images = await findImageFiles(directory);
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
