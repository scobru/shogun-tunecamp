import { jest, describe, test, expect } from '@jest/globals';

// Use unstable_mockModule for ESM
jest.unstable_mockModule('fs-extra', () => ({
    default: {
        access: jest.fn(),
    }
}));

// Dynamic import after mock
const { fileExists, createSlug, getRelativePath, resolveSafePath } = await import('./fileUtils.js');
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

    test('should handle empty strings', () => {
        expect(createSlug('')).toBe('');
    });

    test('should handle strings with only special characters', () => {
        expect(createSlug('!!!')).toBe('');
        expect(createSlug('   ')).toBe('');
    });

    test('should handle strings with numbers', () => {
        expect(createSlug('12345')).toBe('12345');
        expect(createSlug('Song 123')).toBe('song-123');
    });

    test('should handle already sluggified strings', () => {
        expect(createSlug('hello-world')).toBe('hello-world');
    });

    test('should handle leading and trailing special characters', () => {
        expect(createSlug('!hello!')).toBe('hello');
        expect(createSlug('_leading_and_trailing_')).toBe('leading-and-trailing');
    });

});

describe('getRelativePath', () => {
    test('should return relative path and normalize backslashes', () => {
        // We use path.relative which is platform dependent, but the code replaces backslashes
        const result = getRelativePath('/app/src', '/app/src/utils/file.ts');
        expect(result).toBe('utils/file.ts');
    });

    test('should return empty string for same directory', () => {
        const result = getRelativePath('/app/src', '/app/src');
        expect(result).toBe('');
    });

    test('should return relative path when navigating up directories', () => {
        const result = getRelativePath('/app/src/utils', '/app/src/index.ts');
        expect(result).toBe('../index.ts');
    });

    test('should return relative path for deeply nested directories', () => {
        const result = getRelativePath('/app', '/app/src/components/ui/button.tsx');
        expect(result).toBe('src/components/ui/button.tsx');
    });

    test('should normalize paths containing existing backslashes', () => {
        // Simulating a Windows-style path input or intermediate state
        const result = getRelativePath('/app/src', '/app/src/utils\\file.ts');
        expect(result).toBe('utils/file.ts');
    });

});


describe('resolveSafePath', () => {
    const rootDir = '/app/music';

    test('should resolve a valid relative path', () => {
        const result = resolveSafePath(rootDir, 'artist/album/song.mp3');
        // path.resolve is platform specific, but we test absolute resolution
        // The resolved path should end with the relative path
        expect(result?.endsWith('artist/album/song.mp3')).toBe(true);
        expect(result?.includes(rootDir)).toBe(true);
    });

    test('should handle root directory self-reference', () => {
        const result = resolveSafePath(rootDir, '.');
        expect(result?.endsWith('music')).toBe(true);
    });

    test('should strip leading slashes and resolve correctly', () => {
        const result = resolveSafePath(rootDir, '/artist/song.mp3');
        expect(result?.endsWith('artist/song.mp3')).toBe(true);

        const resultMulti = resolveSafePath(rootDir, '///artist/song.mp3');
        expect(resultMulti?.endsWith('artist/song.mp3')).toBe(true);
    });

    test('should return null for null byte injection', () => {
        const result = resolveSafePath(rootDir, 'artist/song\0.mp3');
        expect(result).toBeNull();
    });

    test('should return null for directory traversal escaping root', () => {
        const result = resolveSafePath(rootDir, '../secrets.txt');
        expect(result).toBeNull();

        const resultDeep = resolveSafePath(rootDir, 'artist/../../secrets.txt');
        expect(resultDeep).toBeNull();
    });

    test('should return null for absolute paths attempting to escape', () => {
        // Even if we strip leading slashes, path.resolve might treat a path differently if it's constructed weirdly.
        // But let's test absolute paths directly escaping root via `..`
        const result = resolveSafePath(rootDir, '/etc/passwd');
        // Because of the stripping logic: `relativePath` becomes `etc/passwd`,
        // which resolves to `/app/music/etc/passwd`, which is safe.
        // Wait, is it safe? Yes, because it's forced into the root dir.
        // Let's test actual traversal.
        expect(resolveSafePath(rootDir, '../../etc/passwd')).toBeNull();
    });

    test('should correctly resolve paths with internal .. that stay within root', () => {
        const result = resolveSafePath(rootDir, 'artist/album/../song.mp3');
        expect(result?.endsWith('artist/song.mp3')).toBe(true);
        expect(result?.includes(rootDir)).toBe(true);
    });
});
