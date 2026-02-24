
import { describe, expect, test } from '@jest/globals';
import { getPlaceholderSVG } from './audioUtils.js';

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
