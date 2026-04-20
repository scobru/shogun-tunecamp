import { encryptGunPrivHelper, decryptGunPrivHelper } from './auth.js';
import { describe, test, expect } from '@jest/globals';
import crypto from 'crypto';

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

        // 1. Tamper with the ciphertext
        const originalData = parts[1];
        const tamperedData = originalData.slice(0, -1) + (originalData.slice(-1) === '0' ? '1' : '0');
        const tamperedEncryptedData = `${parts[0]}:${tamperedData}:${parts[2]}`;

        expect(() => {
            decryptGunPrivHelper(tamperedEncryptedData, TEST_SECRET);
        }).toThrow(/Unsupported state or unable to authenticate data/);

        // 2. Tamper with the IV
        const originalIv = parts[0];
        const tamperedIv = originalIv.slice(0, -1) + (originalIv.slice(-1) === '0' ? '1' : '0');
        const tamperedEncryptedIv = `${tamperedIv}:${parts[1]}:${parts[2]}`;

        expect(() => {
            decryptGunPrivHelper(tamperedEncryptedIv, TEST_SECRET);
        }).toThrow(/Unsupported state or unable to authenticate data/);

        // 3. Tamper with the AuthTag
        const originalTag = parts[2];
        const tamperedTag = originalTag.slice(0, -1) + (originalTag.slice(-1) === '0' ? '1' : '0');
        const tamperedEncryptedTag = `${parts[0]}:${parts[1]}:${tamperedTag}`;

        expect(() => {
            decryptGunPrivHelper(tamperedEncryptedTag, TEST_SECRET);
        }).toThrow(/Unsupported state or unable to authenticate data/);
    });

    test("should fail for malformed input strings", () => {
        expect(() => {
            decryptGunPrivHelper("not-enough-parts", TEST_SECRET);
        }).toThrow();

        expect(() => {
            decryptGunPrivHelper("too:many:parts:here", TEST_SECRET);
        }).toThrow();
    });

    test("should fail if decrypted data is not valid JSON (Legacy CBC)", () => {
        // Create valid CBC encrypted data but with non-JSON content
        const iv = crypto.randomBytes(16);
        const key = crypto.createHash('sha256').update(TEST_SECRET).digest();
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        let enc = cipher.update("not json", "utf8", "hex");
        enc += cipher.final("hex");
        const legacyNotJson = `${iv.toString("hex")}:${enc}`;

        expect(() => {
            decryptGunPrivHelper(legacyNotJson, TEST_SECRET);
        }).toThrow(/Unexpected token/);
    });

    test("should fail with empty or invalid secret", () => {
        const encrypted = encryptGunPrivHelper(TEST_DATA, TEST_SECRET);

        expect(() => {
            decryptGunPrivHelper(encrypted, "");
        }).toThrow(/Unsupported state or unable to authenticate data/);
    });
});
