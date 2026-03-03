import request from "supertest";
import express from "express";
import { securityHeaders } from "./security.js";
import { describe, it, expect } from "@jest/globals";

describe("Security Middleware", () => {
    it("should set security headers", async () => {
        const app = express();
        app.use(securityHeaders);
        app.get("/", (req, res) => {
            res.send("Hello World");
        });

        const response = await request(app).get("/");

        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
        expect(response.headers["x-xss-protection"]).toBe("1; mode=block");
        expect(response.headers["permissions-policy"]).toContain("geolocation=()");
        expect(response.headers["content-security-policy"]).toBe(
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; media-src 'self' data: blob: https:; connect-src 'self' ws: wss: http: https:; frame-src 'self' https:;"
        );
    });
});
