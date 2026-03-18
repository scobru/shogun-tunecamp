import { describe, expect, test } from '@jest/globals';
import { validateCatalogConfig, validateReleaseConfig } from './configUtils.js';
import { CatalogConfig, ReleaseConfig } from '../types/index.js';

describe('validateCatalogConfig', () => {
  test('should not throw for a valid catalog config', () => {
    const validConfig: CatalogConfig = {
      title: 'My Catalog'
    };
    expect(() => validateCatalogConfig(validConfig)).not.toThrow();
  });

  test('should throw if catalog config is missing a title', () => {
    const invalidConfig = {} as CatalogConfig;
    expect(() => validateCatalogConfig(invalidConfig)).toThrow('Catalog config must have a title');
  });
});

describe('validateReleaseConfig', () => {
  test('should not throw for a valid release config', () => {
    const validConfig: ReleaseConfig = {
      title: 'My Release',
      date: '2023-01-01'
    };
    expect(() => validateReleaseConfig(validConfig)).not.toThrow();
  });

  test('should throw if release config is missing a title', () => {
    const invalidConfig = { date: '2023-01-01' } as ReleaseConfig;
    expect(() => validateReleaseConfig(invalidConfig)).toThrow('Release config must have a title');
  });

  test('should throw if release config is missing a date', () => {
    const invalidConfig = { title: 'My Release' } as ReleaseConfig;
    expect(() => validateReleaseConfig(invalidConfig)).toThrow('Release config must have a date');
  });

  test('should throw if release with paycurtain download mode is missing a price', () => {
    const invalidConfig = { title: 'My Release', date: '2023-01-01', download: 'paycurtain' } as ReleaseConfig;
    expect(() => validateReleaseConfig(invalidConfig)).toThrow('Release with paycurtain download mode must have a price');
  });

  test('should not throw if release with paycurtain download mode has a price', () => {
    const validConfig = { title: 'My Release', date: '2023-01-01', download: 'paycurtain', price: 5.00 } as ReleaseConfig;
    expect(() => validateReleaseConfig(validConfig)).not.toThrow();
  });
});
