import { createAuthService } from "./auth.js";
import Database from "better-sqlite3";
import { jest } from '@jest/globals';
import jwt from "jsonwebtoken";

describe("AuthService", () => {
    let db: any;
    let authService: any;

    beforeEach(async () => {
        db = new Database(":memory:");
        authService = createAuthService(db, "secret");
        await authService.init();
    });

    afterEach(() => {
        if (db) db.close();
    });

    test("init creates default admin", async () => {
        const admin = db.prepare("SELECT * FROM admin WHERE username = ?").get("admin");
        expect(admin).toBeDefined();
        // @ts-ignore
        expect(admin.username).toBe("admin");
    });

    test("isDefaultPassword returns true for default admin", async () => {
        const isDefault = await authService.isDefaultPassword("admin");
        expect(isDefault).toBe(true);
    });

    test("isDefaultPassword returns false for changed password", async () => {
        await authService.changePassword("admin", "newpassword");
        const isDefault = await authService.isDefaultPassword("admin");
        expect(isDefault).toBe(false);
    });

    test("isDefaultPassword returns false for non-existent user", async () => {
        const isDefault = await authService.isDefaultPassword("nouser");
        expect(isDefault).toBe(false);
    });

    describe("Token Management", () => {
        const payload = { isAdmin: true, username: "admin", artistId: 1 };
        const secret = "secret";

        test("generateToken and verifyToken (happy path)", () => {
            const token = authService.generateToken(payload);
            expect(token).toBeDefined();

            const decoded = authService.verifyToken(token);
            expect(decoded).toMatchObject(payload);
        });

        test("generateToken and verifyToken with null artistId", () => {
            const nullArtistPayload = { isAdmin: false, username: "user", artistId: null };
            const token = authService.generateToken(nullArtistPayload);
            const decoded = authService.verifyToken(token);
            expect(decoded).toMatchObject(nullArtistPayload);
        });

        test("verifyToken returns null for invalid token", () => {
            const decoded = authService.verifyToken("not-a-valid-jwt");
            expect(decoded).toBeNull();
        });

        test("verifyToken returns null for token signed with different secret", () => {
            const differentSecretToken = jwt.sign(payload, "wrong-secret");
            const decoded = authService.verifyToken(differentSecretToken);
            expect(decoded).toBeNull();
        });

        test("verifyToken returns null for expired token", async () => {
            // Create a token that expires in 0 seconds
            const expiredToken = jwt.sign(payload, secret, { expiresIn: -1 });
            const decoded = authService.verifyToken(expiredToken);
            expect(decoded).toBeNull();
        });
    });
});
