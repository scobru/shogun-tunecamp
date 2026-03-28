import { parseFile } from 'music-metadata';
import path from 'path';
import { StringUtils } from './stringUtils.js';
import { LibraryUtils } from './libraryUtils.js';
/**
 * Audio file utilities
 */
export async function readAudioMetadata(filePath) {
    try {
        const metadata = await parseFile(filePath);
        const filename = path.basename(filePath);
        return {
            id: StringUtils.slugify(metadata.common.title || filename.replace(/\.[^.]+$/, '')),
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
    }
    catch (error) {
        // Fallback if metadata reading fails
        const filename = path.basename(filePath);
        return {
            id: StringUtils.slugify(filename.replace(/\.[^.]+$/, '')),
            file: filePath,
            filename,
            title: filename.replace(/\.[^.]+$/, ''),
        };
    }
}
export function formatDuration(seconds) {
    if (!seconds && seconds !== 0)
        return '0:00';
    const totalSeconds = Math.trunc(seconds);
    const mins = Math.trunc(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const secsStr = secs.toString().padStart(2, '0');
    return `${mins}:${secsStr}`;
}
export function formatFileSize(bytes) {
    if (!bytes && bytes !== 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < 3) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}
export function getAudioFormat(filename) {
    const ext = getFileExtension(filename);
    const formats = {
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
export function escapeHtml(text) {
    if (!text)
        return '';
    return StringUtils.escapeHtml(text);
}
/**
 * Converts text to a URL-safe slug
 */
export function slugify(text) {
    if (!text)
        return '';
    return StringUtils.slugify(text);
}
/**
 * Generates a track slug from album title and track title
 */
export function generateTrackSlug(albumTitle, trackTitle) {
    return StringUtils.generateTrackSlug(albumTitle || '', trackTitle || '');
}
/**
 * Formats a timestamp as relative time
 */
export function formatTimeAgo(timestamp) {
    const result = StringUtils.formatTimeAgo(timestamp, Date.now());
    if (result === '') {
        return new Date(timestamp).toLocaleDateString();
    }
    return result;
}
/**
 * Sanitizes a filename by keeping only safe characters
 */
export function sanitizeFilename(filename) {
    if (!filename)
        return '';
    return StringUtils.sanitizeFilename(filename);
}
/**
 * Normalizes a URL by removing trailing slash
 */
export function normalizeUrl(url) {
    if (!url)
        return '';
    return StringUtils.normalizeUrl(url);
}
/**
 * Extracts file extension from filename (without the dot, lowercase)
 */
export function getFileExtension(filename) {
    if (!filename)
        return '';
    return StringUtils.getFileExtension(filename);
}
/**
 * Validates username format
 * Returns { valid: boolean, error?: string }
 */
export function validateUsername(username) {
    if (!username) {
        return { valid: false, error: 'Username is required' };
    }
    const result = StringUtils.validateUsername(username);
    if (result.ok) {
        return { valid: true };
    }
    else {
        return { valid: false, error: result.error };
    }
}
/**
 * Formats an audio filename: "01 - Title.mp3"
 */
export function formatAudioFilename(trackNum, title, extension) {
    return LibraryUtils.formatAudioFilename(trackNum || 0, title || 'Unknown', extension || 'mp3');
}
/**
 * Formats an album directory: "Artist - Album (Year)"
 */
export function formatAlbumDirectory(artist, album) {
    return LibraryUtils.formatAlbumDirectory(artist || 'Unknown Artist', album || 'Unknown Album');
}
/**
 * Returns the standard cover filename: "cover.jpg" or "cover.png"
 */
export function getStandardCoverFilename(extension) {
    return LibraryUtils.getStandardCoverFilename(extension || 'jpg');
}
/**
 * Generates a simple SVG placeholder for missing covers
 */
export function getPlaceholderSVG(text = 'No Cover') {
    const safeText = StringUtils.escapeHtml(text);
    return `
<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="500" fill="#0f172a"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="24" />
    </filter>
  </defs>
  <circle cx="250" cy="250" r="120" fill="url(#grad)" filter="url(#blur)" opacity="0.2" />
  <g transform="translate(25, 20)">
    <path d="M200 320 V180 L320 140 V280" fill="none" stroke="url(#grad)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="170" cy="320" r="32" fill="url(#grad)" />
    <circle cx="290" cy="280" r="32" fill="url(#grad)" />
  </g>
  <text x="250" y="440" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="white" opacity="0.4" font-weight="600">${safeText}</text>
</svg>`.trim();
}
