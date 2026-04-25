
import { describe, expect, test } from '@jest/globals';
import { getPlaceholderSVG, formatDuration, formatFileSize } from './audioUtils.js';

describe('formatFileSize', () => {
    test('should return 0 B for undefined, null or 0', () => {
        expect(formatFileSize(undefined)).toBe('0 B');
        expect(formatFileSize(null as any)).toBe('0 B');
        expect(formatFileSize(0)).toBe('0.0 B');
    });

    test('should format bytes correctly', () => {
        expect(formatFileSize(500)).toBe('500.0 B');
    });

    test('should format kilobytes correctly', () => {
        expect(formatFileSize(1024)).toBe('1.0 KB');
        expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    test('should format megabytes correctly', () => {
        expect(formatFileSize(1048576)).toBe('1.0 MB');
    });

    test('should format gigabytes correctly', () => {
        expect(formatFileSize(1073741824)).toBe('1.0 GB');
    });

    test('should max out at gigabytes for larger values', () => {
        expect(formatFileSize(1099511627776)).toBe('1024.0 GB');
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
