
import { describe, expect, test } from '@jest/globals';
import { getPlaceholderSVG, formatDuration, slugify } from './audioUtils.js';

describe('slugify', () => {
    test('should return empty string for null/undefined/empty input', () => {
        // @ts-ignore
        expect(slugify(null)).toBe('');
        // @ts-ignore
        expect(slugify(undefined)).toBe('');
        expect(slugify('')).toBe('');
    });

    test('should convert text to a URL-safe slug correctly', () => {
        expect(slugify('Hello World!')).toBe('hello-world');
        expect(slugify('My Awesome Track 1')).toBe('my-awesome-track-1');
    });

    test('should handle special characters', () => {
        expect(slugify('A b c 1@#')).toBe('a-b-c-1');
        expect(slugify('Track name with (parentheses) & [brackets]!')).toBe('track-name-with-parentheses-brackets');
    });

    test('should trim leading/trailing dashes', () => {
        expect(slugify('--Hello--')).toBe('hello');
        expect(slugify('---Multiple--Dashes---')).toBe('multiple-dashes');
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
