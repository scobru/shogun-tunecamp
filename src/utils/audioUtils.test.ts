
import { describe, expect, test } from '@jest/globals';
import { getPlaceholderSVG, formatDuration, generateTrackSlug } from './audioUtils.js';

describe('generateTrackSlug', () => {
    test('should generate a valid slug from album and track titles', () => {
        expect(generateTrackSlug('Dark Side of the Moon', 'Time')).toBe('dark-side-of-the-moon-time');
    });

    test('should handle empty album titles', () => {
        expect(generateTrackSlug('', 'Time')).toBe('time');
    });

    test('should handle empty track titles', () => {
        expect(generateTrackSlug('Dark Side of the Moon', '')).toBe('dark-side-of-the-moon-untitled');
    });

    test('should handle both empty titles', () => {
        expect(generateTrackSlug('', '')).toBe('untitled');
    });

    test('should handle special characters', () => {
        expect(generateTrackSlug('My Album (Deluxe Edition!)', 'Track 1: Intro @2023')).toBe('my-album-deluxe-edition-track-1-intro-2023');
    });

    test('should handle undefined or null inputs by using fallback', () => {
        // @ts-ignore
        expect(generateTrackSlug(undefined, undefined)).toBe('untitled');
        // @ts-ignore
        expect(generateTrackSlug(null, null)).toBe('untitled');
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
