import { loadConfig } from './config.js';

describe('ServerConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // jest.resetModules(); // Not needed as loadConfig reads env every time
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('should default to empty array for corsOrigins when TUNECAMP_CORS_ORIGINS is not set', () => {
        delete process.env.TUNECAMP_CORS_ORIGINS;
        const config = loadConfig();
        // This test is expected to fail initially as the current default is ["*"]
        expect(config.corsOrigins).toEqual([]);
    });

    test('should parse TUNECAMP_CORS_ORIGINS correctly', () => {
        process.env.TUNECAMP_CORS_ORIGINS = 'http://localhost:3000,https://example.com';
        const config = loadConfig();
        expect(config.corsOrigins).toEqual(['http://localhost:3000', 'https://example.com']);
    });
});
