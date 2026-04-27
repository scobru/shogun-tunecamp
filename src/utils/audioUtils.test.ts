
import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';
import { getPlaceholderSVG, formatDuration, slugify, formatTimeAgo, getAudioFormat } from './audioUtils.js';

describe('getAudioFormat', () => {
    test('should return correct format for known extensions', () => {
        expect(getAudioFormat('song.mp3')).toBe('MP3');
        expect(getAudioFormat('song.flac')).toBe('FLAC');
        expect(getAudioFormat('song.ogg')).toBe('OGG Vorbis');
        expect(getAudioFormat('song.wav')).toBe('WAV');
        expect(getAudioFormat('song.m4a')).toBe('M4A/AAC');
        expect(getAudioFormat('song.aac')).toBe('AAC');
        expect(getAudioFormat('song.opus')).toBe('OPUS');
    });

    test('should be case-insensitive for extensions', () => {
        expect(getAudioFormat('song.MP3')).toBe('MP3');
        expect(getAudioFormat('song.FlAc')).toBe('FLAC');
    });

    test('should return uppercase extension for unknown formats', () => {
        expect(getAudioFormat('song.xyz')).toBe('XYZ');
        expect(getAudioFormat('song.unknown')).toBe('UNKNOWN');
    });

    test('should handle missing extensions and empty inputs gracefully', () => {
        expect(getAudioFormat('song')).toBe('');
        expect(getAudioFormat('')).toBe('');
    });
});

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

describe('formatTimeAgo', () => {
    let dateNowSpy: ReturnType<typeof jest.spyOn>;
    const MOCK_CURRENT_TIME = new Date('2024-01-01T12:00:00.000Z').getTime();

    beforeAll(() => {
        // Mock Date.now() to return a consistent timestamp
        dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(MOCK_CURRENT_TIME);
    });

    afterAll(() => {
        // Restore the original Date.now()
        dateNowSpy.mockRestore();
    });

    test('should format time within 60 seconds as "just now"', () => {
        // 10 seconds ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 10 * 1000)).toBe('just now');
        // 59 seconds ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 59 * 1000)).toBe('just now');
    });

    test('should format time within 60 minutes as "Xm ago"', () => {
        // 1 minute ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 60 * 1000)).toBe('1m ago');
        // 45 minutes ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 45 * 60 * 1000)).toBe('45m ago');
    });

    test('should format time within 24 hours as "Xh ago"', () => {
        // 1 hour ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 3600 * 1000)).toBe('1h ago');
        // 23 hours ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 23 * 3600 * 1000)).toBe('23h ago');
    });

    test('should format time within 7 days as "Xd ago"', () => {
        // 1 day ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 86400 * 1000)).toBe('1d ago');
        // 6 days ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 6 * 86400 * 1000)).toBe('6d ago');
    });

    test('should format older dates with toLocaleDateString', () => {
        // 8 days ago
        const olderDate = new Date(MOCK_CURRENT_TIME - 8 * 86400 * 1000);
        expect(formatTimeAgo(olderDate.getTime())).toBe(olderDate.toLocaleDateString());

        // 1 year ago
        const yearAgoDate = new Date(MOCK_CURRENT_TIME - 365 * 86400 * 1000);
        expect(formatTimeAgo(yearAgoDate.getTime())).toBe(yearAgoDate.toLocaleDateString());
    });
});
