import { createAuthService } from "./auth.js";
import Database from "better-sqlite3";
import { jest } from '@jest/globals';

describe("AuthService", () => {
    let db: any;
    let authService: any;

    beforeEach(async () => {
        db = new Database(":memory:");
        authService = createAuthService(db, "secret");
        await authService.init();
    });

    afterEach(() => {
        db.close();
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
});
