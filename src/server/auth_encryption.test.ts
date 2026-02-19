import { encryptGunPrivHelper, decryptGunPrivHelper } from './auth.js';
import { describe, test, expect } from '@jest/globals';

describe("Auth Encryption (GunDB)", () => {
    const TEST_SECRET = "my-secret-key";
    const TEST_DATA = { foo: "bar", secret: 123 };

    // Generated with the previous AES-256-CBC implementation
    const LEGACY_ENCRYPTED = "111d819066de835cf73d01690cdef1b9:6e57757922c4edf5222e534e3febdecd863f04f344cf4b75fa8131473add56f7";

    test("should encrypt and decrypt using new GCM format", () => {
        const encrypted = encryptGunPrivHelper(TEST_DATA, TEST_SECRET);

        // Format check: IV:Data:AuthTag
        const parts = encrypted.split(":");
        expect(parts.length).toBe(3);
        expect(parts[0].length).toBe(24); // 12 bytes hex

        const decrypted = decryptGunPrivHelper(encrypted, TEST_SECRET);
        expect(decrypted).toEqual(TEST_DATA);
    });

    test("should decrypt legacy CBC format", () => {
        const decrypted = decryptGunPrivHelper(LEGACY_ENCRYPTED, TEST_SECRET);
        expect(decrypted).toEqual(TEST_DATA);
    });

    test("should fail to decrypt if secret is wrong", () => {
        const encrypted = encryptGunPrivHelper(TEST_DATA, TEST_SECRET);
        expect(() => {
            decryptGunPrivHelper(encrypted, "wrong-secret");
        }).toThrow();
    });

    test("should fail to decrypt tampered data (GCM integrity check)", () => {
        const encrypted = encryptGunPrivHelper(TEST_DATA, TEST_SECRET);
        const parts = encrypted.split(":");

        // Tamper with the ciphertext
        const originalData = parts[1];
        // Flip last bit
        const lastChar = originalData.slice(-1);
        const newLastChar = lastChar === '0' ? '1' : '0';
        const tamperedData = originalData.slice(0, -1) + newLastChar;

        const tamperedEncrypted = `${parts[0]}:${tamperedData}:${parts[2]}`;

        expect(() => {
            decryptGunPrivHelper(tamperedEncrypted, TEST_SECRET);
        }).toThrow(/Unsupported state or unable to authenticate data/);
    });
});
