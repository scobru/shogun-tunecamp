import { StringUtils } from './stringUtils.js';

describe('StringUtils.escapeHtml', () => {
    test('should return empty string for null/undefined/empty input', () => {
        // @ts-ignore - testing runtime behavior for non-TS usage or edge cases
        expect(StringUtils.escapeHtml(null)).toBe('');
        // @ts-ignore
        expect(StringUtils.escapeHtml(undefined)).toBe('');
        expect(StringUtils.escapeHtml('')).toBe('');
    });

    test('should return original string if no special characters present', () => {
        const input = 'Hello World 123';
        expect(StringUtils.escapeHtml(input)).toBe(input);
    });

    test('should escape ampersand (&)', () => {
        expect(StringUtils.escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
        expect(StringUtils.escapeHtml('&')).toBe('&amp;');
    });

    test('should escape less than (<)', () => {
        expect(StringUtils.escapeHtml('<script>')).toBe('&lt;script&gt;');
        expect(StringUtils.escapeHtml('1 < 2')).toBe('1 &lt; 2');
    });

    test('should escape greater than (>)', () => {
        expect(StringUtils.escapeHtml('2 > 1')).toBe('2 &gt; 1');
        expect(StringUtils.escapeHtml('->')).toBe('-&gt;');
    });

    test('should escape double quotes (")', () => {
        expect(StringUtils.escapeHtml('He said "Hello"')).toBe('He said &quot;Hello&quot;');
        expect(StringUtils.escapeHtml('"')).toBe('&quot;');
    });

    test('should escape single quotes (\')', () => {
        expect(StringUtils.escapeHtml("It's me")).toBe('It&#039;s me');
        expect(StringUtils.escapeHtml("'")).toBe('&#039;');
    });

    test('should escape multiple special characters correctly', () => {
        const input = '<div class="test">It\'s & code</div>';
        const expected = '&lt;div class=&quot;test&quot;&gt;It&#039;s &amp; code&lt;/div&gt;';
        expect(StringUtils.escapeHtml(input)).toBe(expected);
    });

    test('should handle sequential special characters', () => {
        expect(StringUtils.escapeHtml('<<>>""&&\'\'')).toBe('&lt;&lt;&gt;&gt;&quot;&quot;&amp;&amp;&#039;&#039;');
    });
});
