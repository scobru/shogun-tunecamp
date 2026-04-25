
import { describe, expect, test } from '@jest/globals';
import { getPlaceholderSVG, formatDuration, validateUsername } from './audioUtils.js';

describe('validateUsername', () => {
    test('should return valid: false for empty or undefined username', () => {
        expect(validateUsername('')).toEqual({ valid: false, error: 'Username is required' });
        expect(validateUsername(undefined as any)).toEqual({ valid: false, error: 'Username is required' });
    });

    test('should return valid: true for valid usernames', () => {
        expect(validateUsername('valid_user123')).toEqual({ valid: true });
        expect(validateUsername('abc')).toEqual({ valid: true }); // minimum length
        expect(validateUsername('a'.repeat(20))).toEqual({ valid: true }); // maximum length
    });

    test('should return valid: false for usernames shorter than 3 characters', () => {
        expect(validateUsername('ab')).toEqual({ valid: false, error: 'Username must be at least 3 characters' });
        expect(validateUsername('a')).toEqual({ valid: false, error: 'Username must be at least 3 characters' });
    });

    test('should return valid: false for usernames longer than 20 characters', () => {
        expect(validateUsername('a'.repeat(21))).toEqual({ valid: false, error: 'Username must be at most 20 characters' });
    });

    test('should return valid: false for usernames with invalid characters', () => {
        expect(validateUsername('user-name')).toEqual({ valid: false, error: 'Username must contain only letters, numbers, and underscores' });
        expect(validateUsername('user space')).toEqual({ valid: false, error: 'Username must contain only letters, numbers, and underscores' });
        expect(validateUsername('user@name')).toEqual({ valid: false, error: 'Username must contain only letters, numbers, and underscores' });
    });
});

describe('Audio Utils Security', () => {
    test('getPlaceholderSVG should escape HTML special characters to prevent XSS', () => {
        const maliciousInput = '<script>alert("xss")</script>';
        const svg = getPlaceholderSVG(maliciousInput);

        // Should NOT contain the raw script tag
        expect(svg).not.toContain('<script>');
        expect(svg).not.toContain('</script>');

        // Should contain the escaped version
        expect(svg).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

        // Ensure the SVG structure is still valid
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
    });

    test('getPlaceholderSVG should handle normal input correctly', () => {
        const normalInput = 'My Album';
        const svg = getPlaceholderSVG(normalInput);

        expect(svg).toContain('My Album');
        expect(svg).toContain('<text');
    });

    test('getPlaceholderSVG should handle empty input', () => {
        // Default is 'No Cover'
        const svg = getPlaceholderSVG(undefined);
        expect(svg).toContain('No Cover');
    });
});

describe('formatDuration', () => {
    test('should return 0:00 for undefined or null', () => {
        expect(formatDuration(undefined)).toBe('0:00');
        expect(formatDuration(null as any)).toBe('0:00');
    });

    test('should return 0:00 for 0', () => {
        expect(formatDuration(0)).toBe('0:00');
    });

    test('should format seconds correctly', () => {
        expect(formatDuration(59)).toBe('0:59');
    });

    test('should format minutes correctly', () => {
        expect(formatDuration(60)).toBe('1:00');
        expect(formatDuration(65)).toBe('1:05');
    });

    test('should format hours correctly (as minutes)', () => {
        expect(formatDuration(3600)).toBe('60:00');
        expect(formatDuration(3661)).toBe('61:01');
    });

    test('should truncate floating point numbers', () => {
        expect(formatDuration(65.7)).toBe('1:05');
    });
});
