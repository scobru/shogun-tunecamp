import { parseFile } from 'music-metadata';
import path from 'path';
import { Track } from '../types/index.js';
import { StringUtils } from './stringUtils.js';
import { LibraryUtils } from './libraryUtils.js';

/**
 * Audio file utilities
 */

export async function readAudioMetadata(filePath: string): Promise<Track> {
  try {
    const metadata = await parseFile(filePath);
    const filename = path.basename(filePath);

    return {
      file: filePath,
      filename,
      title: metadata.common.title || filename.replace(/\.[^.]+$/, ''),
      artist: metadata.common.artist,
      album: metadata.common.album,
      year: metadata.common.year,
      track: metadata.common.track.no ?? undefined,
      duration: metadata.format.duration,
      format: metadata.format.container,
      bitrate: metadata.format.bitrate,
      sampleRate: metadata.format.sampleRate,
      genre: metadata.common.genre,
    };
  } catch (error) {
    // Fallback if metadata reading fails
    const filename = path.basename(filePath);
    return {
      file: filePath,
      filename,
      title: filename.replace(/\.[^.]+$/, ''),
    };
  }
}

export function formatDuration(seconds?: number): string {
  if (!seconds && seconds !== 0) return '0:00';

  const totalSeconds = Math.trunc(seconds);
  const mins = Math.trunc(totalSeconds / 60);
  const secs = totalSeconds % 60;

  const secsStr = secs.toString().padStart(2, '0');

  return `${mins}:${secsStr}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < 3) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function getAudioFormat(filename: string): string {
  const ext = getFileExtension(filename);
  const formats: Record<string, string> = {
    'mp3': 'MP3',
    'flac': 'FLAC',
    'ogg': 'OGG Vorbis',
    'wav': 'WAV',
    'm4a': 'M4A/AAC',
    'aac': 'AAC',
    'opus': 'OPUS',
  };

  return formats[ext] || ext.toUpperCase();
}

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
export function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return StringUtils.escapeHtml(text);
}

/**
 * Converts text to a URL-safe slug
 */
export function slugify(text: string): string {
  if (!text) return '';
  return StringUtils.slugify(text);
}

/**
 * Generates a track slug from album title and track title
 */
export function generateTrackSlug(albumTitle: string, trackTitle: string): string {
  return StringUtils.generateTrackSlug(albumTitle || '', trackTitle || '');
}

/**
 * Formats a timestamp as relative time
 */
export function formatTimeAgo(timestamp: number): string {
  const result = StringUtils.formatTimeAgo(timestamp, Date.now());
  if (result === '') {
    return new Date(timestamp).toLocaleDateString();
  }
  return result;
}

/**
 * Sanitizes a filename by keeping only safe characters
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return '';
  return StringUtils.sanitizeFilename(filename);
}

/**
 * Normalizes a URL by removing trailing slash
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  return StringUtils.normalizeUrl(url);
}

/**
 * Extracts file extension from filename (without the dot, lowercase)
 */
export function getFileExtension(filename: string): string {
  if (!filename) return '';
  return StringUtils.getFileExtension(filename);
}

/**
 * Validates username format
 * Returns { valid: boolean, error?: string }
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username) {
    return { valid: false, error: 'Username is required' };
  }
  const result = StringUtils.validateUsername(username);

  if (result.ok) {
    return { valid: true };
  } else {
    return { valid: false, error: result.error };
  }
}

/**
 * Formats an audio filename: "01 - Title.mp3"
 */
export function formatAudioFilename(trackNum: number, title: string, extension: string): string {
  return LibraryUtils.formatAudioFilename(trackNum || 0, title || 'Unknown', extension || 'mp3');
}

/**
 * Formats an album directory: "Artist - Album (Year)"
 */
export function formatAlbumDirectory(artist: string, album: string): string {
  return LibraryUtils.formatAlbumDirectory(artist || 'Unknown Artist', album || 'Unknown Album');
}

/**
 * Returns the standard cover filename: "cover.jpg" or "cover.png"
 */
export function getStandardCoverFilename(extension: string): string {
  return LibraryUtils.getStandardCoverFilename(extension || 'jpg');
}



/**
 * Generates a simple SVG placeholder for missing covers
 */
export function getPlaceholderSVG(text: string = 'No Cover'): string {
  const bg = '#1a1a1a';
  const fg = '#333';
  const textCol = '#666';

  return `
<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="500" fill="${bg}"/>
  <circle cx="250" cy="250" r="100" fill="${fg}"/>
  <path d="M250 190 L290 270 L210 270 Z" fill="${bg}" transform="rotate(90 250 230)"/>
  <text x="50%" y="85%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="40" fill="${textCol}">${text}</text>
</svg>`.trim();
}
