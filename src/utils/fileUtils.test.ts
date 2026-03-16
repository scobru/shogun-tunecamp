import { jest, describe, test, expect } from '@jest/globals';

// Use unstable_mockModule for ESM
jest.unstable_mockModule('fs-extra', () => ({
    default: {
        access: jest.fn(),
    }
}));

// Dynamic import after mock
const { fileExists, createSlug, getRelativePath } = await import('./fileUtils.js');
const fs = (await import('fs-extra')).default;

describe('fileExists', () => {
    test('should return true if file exists', async () => {
        (fs.access as any).mockResolvedValue(undefined);
        const exists = await fileExists('path/to/existing/file.txt');
        expect(exists).toBe(true);
        expect(fs.access).toHaveBeenCalledWith('path/to/existing/file.txt');
    });

    test('should return false if file does not exist', async () => {
        (fs.access as any).mockRejectedValue(new Error('File not found'));
        const exists = await fileExists('path/to/non-existing/file.txt');
        expect(exists).toBe(false);
        expect(fs.access).toHaveBeenCalledWith('path/to/non-existing/file.txt');
    });
});

describe('createSlug', () => {
    test('should convert text to lowercase and replace special characters with hyphens', () => {
        expect(createSlug('Hello World')).toBe('hello-world');
        expect(createSlug('Music & Art')).toBe('music-art');
        expect(createSlug('  Spaces  ')).toBe('spaces');
        expect(createSlug('Special!@#$%^&*()Characters')).toBe('special-characters');
    });

    test('should handle multiple special characters and trailing hyphens', () => {
        expect(createSlug('---Hello---World---')).toBe('hello-world');
        expect(createSlug('Hello...World')).toBe('hello-world');
    });
});

describe('getRelativePath', () => {
    test('should return relative path and normalize backslashes', () => {
        // We use path.relative which is platform dependent, but the code replaces backslashes
        const result = getRelativePath('/app/src', '/app/src/utils/file.ts');
        expect(result).toBe('utils/file.ts');
    });
});
