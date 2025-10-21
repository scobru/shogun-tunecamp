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

export function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function getAudioFormat(filename: string): string {
  const ext = path.extname(filename).toLowerCase().slice(1);
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

