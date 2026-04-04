import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { createUnlockRoutes } from "./unlock.js";
import type { DatabaseService } from "../database.js";
import { StringUtils } from "../../utils/stringUtils.js";

// Mock DatabaseService
const mockDatabase = {
    validateUnlockCode: jest.fn(),
    redeemUnlockCode: jest.fn(),
    listUnlockCodes: jest.fn(),
    createUnlockCode: jest.fn(),
    getAlbum: jest.fn(),
} as unknown as DatabaseService;

describe("Unlock Routes", () => {
    let app: express.Express;
    let isAdmin = false;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());

        // Mock authentication middleware
        app.use((req: any, res, next) => {
            req.isAdmin = isAdmin;
            next();
        });

        app.use("/api/unlock", createUnlockRoutes(mockDatabase));
    });

    describe("POST /api/unlock/admin/create", () => {
        beforeEach(() => {
            isAdmin = true;
        });

        test("should return 401 if not an admin", async () => {
            isAdmin = false;
            const response = await request(app)
                .post("/api/unlock/admin/create")
                .send({ count: 5 });

            expect(response.status).toBe(401);
            expect(mockDatabase.createUnlockCode).not.toHaveBeenCalled();
        });

        test("should create multiple codes successfully", async () => {
            const count = 3;
            const releaseId = 123;
            const response = await request(app)
                .post("/api/unlock/admin/create")
                .send({ count, releaseId });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.count).toBe(count);
            expect(response.body.codes).toHaveLength(count);
            expect(mockDatabase.createUnlockCode).toHaveBeenCalledTimes(count);
            expect(mockDatabase.createUnlockCode).toHaveBeenCalledWith(expect.any(String), releaseId);
        });

        test("should retry code generation once on collision", async () => {
            const releaseId = 456;
            // First call fails (collision), second call succeeds (retry), third call succeeds (next code)
            (mockDatabase.createUnlockCode as jest.Mock)
                .mockImplementationOnce(() => { throw new Error("Unique constraint failed"); })
                .mockImplementation(() => {});

            const response = await request(app)
                .post("/api/unlock/admin/create")
                .send({ count: 2, releaseId });

            expect(response.status).toBe(200);
            expect(response.body.count).toBe(2);
            // Total calls should be 3:
            // 1st (fail) -> 2nd (retry success)
            // 3rd (success)
            expect(mockDatabase.createUnlockCode).toHaveBeenCalledTimes(3);
        });

        test("should handle failure after retry", async () => {
            // Mock to fail twice on the first code creation
            (mockDatabase.createUnlockCode as jest.Mock)
                .mockImplementation(() => { throw new Error("Unique constraint failed"); });

            const response = await request(app)
                .post("/api/unlock/admin/create")
                .send({ count: 1 });

            expect(response.status).toBe(200);
            expect(response.body.count).toBe(0);
            expect(mockDatabase.createUnlockCode).toHaveBeenCalledTimes(2);
        });
    });

    describe("POST /api/unlock/validate", () => {
        test("should return error if code is missing", async () => {
            const response = await request(app)
                .post("/api/unlock/validate")
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe("Code required");
        });

        test("should return invalid if code does not exist", async () => {
            (mockDatabase.validateUnlockCode as jest.Mock).mockReturnValue({ valid: false });

            const response = await request(app)
                .post("/api/unlock/validate")
                .send({ code: "INVALID" });

            expect(response.status).toBe(404);
            expect(response.body.valid).toBe(false);
            expect(response.body.error).toBe("Invalid code");
        });

        test("should return valid and release info for valid code", async () => {
            const releaseId = 789;
            const releaseInfo = { id: releaseId, title: "Test Album" };
            (mockDatabase.validateUnlockCode as jest.Mock).mockReturnValue({
                valid: true,
                releaseId,
                isUsed: false
            });
            (mockDatabase.getAlbum as jest.Mock).mockReturnValue(releaseInfo);

            const response = await request(app)
                .post("/api/unlock/validate")
                .send({ code: "VALID-CODE" });

            expect(response.status).toBe(200);
            expect(response.body.valid).toBe(true);
            expect(response.body.isUsed).toBe(false);
            expect(response.body.release).toEqual(releaseInfo);
            expect(mockDatabase.getAlbum).toHaveBeenCalledWith(releaseId);
        });
    });

    describe("POST /api/unlock/redeem", () => {
        test("should return error if code is missing", async () => {
            const response = await request(app)
                .post("/api/unlock/redeem")
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe("Code required");
        });

        test("should redeem code successfully", async () => {
            const code = "REDEEM-CODE";
            (mockDatabase.validateUnlockCode as jest.Mock).mockReturnValue({ valid: true });

            const response = await request(app)
                .post("/api/unlock/redeem")
                .send({ code });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(mockDatabase.redeemUnlockCode).toHaveBeenCalledWith(code);
        });
    });

    describe("GET /api/unlock/admin/list", () => {
        beforeEach(() => {
            isAdmin = true;
        });

        test("should return 401 if not an admin", async () => {
            isAdmin = false;
            const response = await request(app)
                .get("/api/unlock/admin/list");

            expect(response.status).toBe(401);
            expect(mockDatabase.listUnlockCodes).not.toHaveBeenCalled();
        });

        test("should list all codes", async () => {
            const mockCodes = [{ id: 1, code: "C1" }, { id: 2, code: "C2" }];
            (mockDatabase.listUnlockCodes as jest.Mock).mockReturnValue(mockCodes);

            const response = await request(app)
                .get("/api/unlock/admin/list");

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockCodes);
            expect(mockDatabase.listUnlockCodes).toHaveBeenCalledWith(undefined);
        });

        test("should list codes for specific release", async () => {
            const releaseId = 123;
            const mockCodes = [{ id: 1, code: "C1", release_id: releaseId }];
            (mockDatabase.listUnlockCodes as jest.Mock).mockReturnValue(mockCodes);

            const response = await request(app)
                .get("/api/unlock/admin/list")
                .query({ releaseId });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockCodes);
            expect(mockDatabase.listUnlockCodes).toHaveBeenCalledWith(releaseId);
        });
    });
});
