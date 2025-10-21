/**
 * Type definitions for Shogun Faircamp
 */

export interface CatalogConfig {
  title: string;
  description?: string;
  url?: string;
  theme?: string;
  language?: string;
  metadata?: Record<string, any>;
}

export interface ArtistConfig {
  name: string;
  bio?: string;
  photo?: string;
  links?: ArtistLink[];
  metadata?: Record<string, any>;
}

export interface ArtistLink {
  [platform: string]: string;
}

export type DownloadMode = 'free' | 'paycurtain' | 'codes' | 'none';

export interface ReleaseConfig {
  title: string;
  date: string;
  description?: string;
  cover?: string;
  download?: DownloadMode;
  price?: number;
  genres?: string[];
  credits?: Credit[];
  metadata?: Record<string, any>;
}

export interface Credit {
  role: string;
  name: string;
}

export interface TrackConfig {
  file: string;
  title?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface TrackMetadata {
  file: string;
  filename: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  track?: number;
  duration?: number;
  format?: string;
  bitrate?: number;
  sampleRate?: number;
  description?: string;
  genre?: string[];
}

export interface Release {
  config: ReleaseConfig;
  tracks: TrackMetadata[];
  coverPath?: string;
  path: string;
  slug: string;
}

export interface Catalog {
  config: CatalogConfig;
  artist?: ArtistConfig;
  releases: Release[];
}

export interface BuildOptions {
  inputDir: string;
  outputDir: string;
  theme?: string;
  verbose?: boolean;
}

export interface GeneratorOptions extends BuildOptions {
  watch?: boolean;
}

