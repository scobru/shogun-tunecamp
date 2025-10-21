import { parse as parseYaml } from 'yaml';
import { readFile, fileExists } from './fileUtils.js';
import { CatalogConfig, ArtistConfig, ReleaseConfig } from '../types/index.js';
import path from 'path';

/**
 * Configuration file utilities
 */

export async function readYamlFile<T>(filePath: string): Promise<T | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  
  const content = await readFile(filePath);
  return parseYaml(content) as T;
}

export async function readCatalogConfig(directory: string): Promise<CatalogConfig> {
  const configPath = path.join(directory, 'catalog.yaml');
  const config = await readYamlFile<CatalogConfig>(configPath);
  
  if (!config || !config.title) {
    throw new Error(`Invalid or missing catalog.yaml in ${directory}`);
  }
  
  return config;
}

export async function readArtistConfig(directory: string): Promise<ArtistConfig | null> {
  const configPath = path.join(directory, 'artist.yaml');
  return await readYamlFile<ArtistConfig>(configPath);
}

export async function readReleaseConfig(directory: string): Promise<ReleaseConfig | null> {
  const configPath = path.join(directory, 'release.yaml');
  const config = await readYamlFile<ReleaseConfig>(configPath);
  
  if (config && !config.title) {
    throw new Error(`Release config missing title in ${directory}`);
  }
  
  return config;
}

export function validateCatalogConfig(config: CatalogConfig): void {
  if (!config.title) {
    throw new Error('Catalog config must have a title');
  }
}

export function validateReleaseConfig(config: ReleaseConfig): void {
  if (!config.title) {
    throw new Error('Release config must have a title');
  }
  
  if (!config.date) {
    throw new Error('Release config must have a date');
  }
  
  if (config.download === 'paycurtain' && !config.price) {
    throw new Error('Release with paycurtain download mode must have a price');
  }
}

