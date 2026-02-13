import { jest, describe, test, expect, beforeAll } from '@jest/globals';

// Use unstable_mockModule for ESM
jest.unstable_mockModule('dns', () => ({
    default: {
        lookup: jest.fn()
    },
    lookup: jest.fn() // For named import if used
}));

// Dynamic import after mock
const { isPrivateIP, isSafeUrl } = await import('./networkUtils.js');
const dns = await import('dns');

describe('isPrivateIP', () => {
    test('identifies private IPv4', () => {
        expect(isPrivateIP('127.0.0.1')).toBe(true);
        expect(isPrivateIP('10.0.0.1')).toBe(true);
        expect(isPrivateIP('192.168.1.1')).toBe(true);
        expect(isPrivateIP('172.16.0.1')).toBe(true); // Lower bound
        expect(isPrivateIP('172.31.255.255')).toBe(true); // Upper bound
        expect(isPrivateIP('169.254.1.1')).toBe(true);
        expect(isPrivateIP('0.0.0.0')).toBe(true);
    });

    test('identifies public IPv4', () => {
        expect(isPrivateIP('8.8.8.8')).toBe(false);
        expect(isPrivateIP('1.1.1.1')).toBe(false);
        expect(isPrivateIP('172.15.255.255')).toBe(false); // Below range
        expect(isPrivateIP('172.32.0.0')).toBe(false); // Above range
    });

    test('identifies private IPv6', () => {
        expect(isPrivateIP('::1')).toBe(true);
        expect(isPrivateIP('fe80::1')).toBe(true);
        expect(isPrivateIP('fc00::1')).toBe(true);
        expect(isPrivateIP('fd00::1')).toBe(true); // Unique local
    });

    test('identifies IPv4-mapped IPv6', () => {
        expect(isPrivateIP('::ffff:192.168.1.1')).toBe(true);
        expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
        expect(isPrivateIP('::ffff:8.8.8.8')).toBe(false);
    });
});

describe('isSafeUrl', () => {
    beforeAll(() => {
        // Mock dns.lookup
        // Depending on how it's imported (default vs named), we mock both in factory
        // Here we access it via the imported module.
        // Since we import * as dns or default, we need to check how it's structured.
        // In networkUtils.ts: import dns from 'dns'; -> usage dns.lookup

        const mockLookup = dns.default.lookup as unknown as any;

        mockLookup.mockImplementation((hostname: string, options: any, callback: any) => {
             // Handle both signature styles if needed, but we know we call with options
             const cb = callback || options;

             if (hostname === 'public.com') {
                 cb(null, [{ address: '8.8.8.8', family: 4 }]);
             } else if (hostname === 'private.com') {
                 cb(null, [{ address: '192.168.1.1', family: 4 }]);
             } else if (hostname === 'mixed.com') {
                 cb(null, [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]);
             } else {
                 cb(new Error('Not found'));
             }
        });
    });

    test('allows public domains', async () => {
        expect(await isSafeUrl('http://public.com')).toBe(true);
        expect(await isSafeUrl('https://public.com/foo')).toBe(true);
    });

    test('blocks private domains', async () => {
        expect(await isSafeUrl('http://private.com')).toBe(false);
    });

    test('blocks mixed public/private domains', async () => {
        expect(await isSafeUrl('http://mixed.com')).toBe(false);
    });

    test('blocks localhost', async () => {
        expect(await isSafeUrl('http://localhost')).toBe(false);
        expect(await isSafeUrl('http://localhost:3000')).toBe(false);
    });

    test('blocks private IPs directly', async () => {
        expect(await isSafeUrl('http://127.0.0.1')).toBe(false);
        expect(await isSafeUrl('http://192.168.1.1')).toBe(false);
        expect(await isSafeUrl('http://[::1]')).toBe(false);
    });

    test('allows public IPs directly', async () => {
        expect(await isSafeUrl('http://8.8.8.8')).toBe(true);
    });

    test('blocks non-http schemes', async () => {
        expect(await isSafeUrl('file:///etc/passwd')).toBe(false);
        expect(await isSafeUrl('ftp://public.com')).toBe(false);
        expect(await isSafeUrl('javascript:alert(1)')).toBe(false);
    });

    test('handles invalid URLs', async () => {
        expect(await isSafeUrl('not-a-url')).toBe(false);
    });
});
