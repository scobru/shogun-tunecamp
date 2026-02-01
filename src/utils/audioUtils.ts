import { parseFile } from 'music-metadata';
import path from 'path';
import { TrackMetadata } from '../types/index.js';

/**
 * Audio file utilities
 */

export async function readAudioMetadata(filePath: string): Promise<TrackMetadata> {
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

import {
  format_duration as formatDurationGleam,
  format_file_size as formatFileSizeGleam
} from '../gleam_generated/audio_utils.js';

import {
  escape_html as escapeHtmlGleam,
  slugify as slugifyGleam,
  generate_track_slug as generateTrackSlugGleam,
  format_time_ago as formatTimeAgoGleam,
  sanitize_filename as sanitizeFilenameGleam,
  normalize_url as normalizeUrlGleam,
  get_file_extension as getFileExtensionGleam,
  validate_username as validateUsernameGleam,
  pad_left as padLeftGleam
} from '../gleam_generated/string_utils.js';

import {
  format_audio_filename as formatAudioFilenameGleam,
  format_album_directory as formatAlbumDirectoryGleam,
  get_standard_cover_filename as getStandardCoverFilenameGleam
} from '../gleam_generated/library.js';

export function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  return formatDurationGleam(seconds);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 B';
  // Gleam handles int/float, we pass number (which is float in JS/Gleam usually, 
  // but Gleam int is distinct. Our Gleam code accepted Int for file size.
  // We need to ensure we pass an integer if Gleam expects Int.
  // JS number is float. Gleam JS backend treats JS numbers as floats but logic might check.
  // The Gleam code: `pub fn format_file_size(bytes: Int)`.
  // Wrapper for generated JS usually expects safe integer.

  return formatFileSizeGleam(Math.floor(bytes));
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
 * Uses Gleam implementation for type safety
 */
export function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return escapeHtmlGleam(text);
}

/**
 * Converts text to a URL-safe slug
 * Uses Gleam implementation for type safety
 */
export function slugify(text: string): string {
  if (!text) return '';
  return slugifyGleam(text);
}

/**
 * Generates a track slug from album title and track title
 * Uses Gleam implementation for type safety
 */
export function generateTrackSlug(albumTitle: string, trackTitle: string): string {
  return generateTrackSlugGleam(albumTitle || '', trackTitle || '');
}

/**
 * Formats a timestamp as relative time
 * Uses Gleam implementation for type safety
 */
export function formatTimeAgo(timestamp: number): string {
  const result = formatTimeAgoGleam(timestamp, Date.now());
  // If Gleam returns empty string, fall back to JavaScript date formatting
  if (result === '') {
    return new Date(timestamp).toLocaleDateString();
  }
  return result;
}

/**
 * Sanitizes a filename by keeping only safe characters
 * Uses Gleam implementation for type safety
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return '';
  return sanitizeFilenameGleam(filename);
}

/**
 * Normalizes a URL by removing trailing slash
 * Uses Gleam implementation for type safety
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  return normalizeUrlGleam(url);
}

/**
 * Extracts file extension from filename (without the dot, lowercase)
 * Uses Gleam implementation for type safety
 */
export function getFileExtension(filename: string): string {
  if (!filename) return '';
  return getFileExtensionGleam(filename);
}

/**
 * Validates username format
 * Uses Gleam implementation for type safety
 * Returns { valid: boolean, error?: string }
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username) {
    return { valid: false, error: 'Username is required' };
  }
  const result = validateUsernameGleam(username);
  // Gleam Result type in JS: Ok/Error classes with isOk() method and [0] for value
  // @ts-ignore - TS might not see isOk if types aren't perfect
  if (result.isOk()) {
    return { valid: true };
  } else {
    return { valid: false, error: result[0] as string };
  }
}

/**
 * Formats an audio filename using Gleam logic: "01 - Title.mp3"
 */
export function formatAudioFilename(trackNum: number, title: string, extension: string): string {
  return formatAudioFilenameGleam(trackNum || 0, title || 'Unknown', extension || 'mp3');
}

/**
 * Formats an album directory using Gleam logic: "Artist - Album (Year)"
 */
export function formatAlbumDirectory(artist: string, album: string, year?: number): string {
  return formatAlbumDirectoryGleam(artist || 'Unknown Artist', album || 'Unknown Album', year || 0);
}

/**
 * Returns the standard cover filename: "cover.jpg" or "cover.png"
 */
export function getStandardCoverFilename(extension: string): string {
  return getStandardCoverFilenameGleam(extension || 'jpg');
}

