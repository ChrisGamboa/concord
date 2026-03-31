import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp, authHeader } from "./helpers";

// Mock prisma
vi.mock("../db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

// Must import after mock setup
const { prisma } = await import("../db.js");
const mockPrisma = vi.mocked(prisma);

describe("Auth Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user and return token", async () => {
      const app = await buildApp();

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "user1",
        username: "newuser",
        displayName: "New User",
        passwordHash: "hashed",
        avatarUrl: null,
        createdAt: new Date("2026-01-01"),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          username: "newuser",
          password: "password123",
          displayName: "New User",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.token).toBeDefined();
      expect(body.user.username).toBe("newuser");
      expect(body.user.displayName).toBe("New User");
      await app.close();
    });

    it("should reject duplicate username", async () => {
      const app = await buildApp();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "existing",
        username: "taken",
        displayName: "Existing",
        passwordHash: "hashed",
        avatarUrl: null,
        createdAt: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          username: "taken",
          password: "password123",
          displayName: "Test",
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("Username already taken");
      await app.close();
    });

    it("should reject short username", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          username: "ab",
          password: "password123",
          displayName: "Test",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("3-32 characters");
      await app.close();
    });

    it("should reject short password", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          username: "validuser",
          password: "12345",
          displayName: "Test",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("at least 6 characters");
      await app.close();
    });

    it("should reject missing fields", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { username: "test" },
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("POST /api/auth/login", () => {
    it("should reject non-existent user", async () => {
      const app = await buildApp();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "noone", password: "password123" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid credentials");
      await app.close();
    });
  });

  describe("GET /api/auth/me", () => {
    it("should reject unauthenticated requests", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("should return user data with valid token", async () => {
      const app = await buildApp();

      const token = app.jwt.sign({ userId: "user1" });
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        id: "user1",
        username: "testuser",
        displayName: "Test User",
        passwordHash: "hashed",
        avatarUrl: null,
        createdAt: new Date("2026-01-01"),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.username).toBe("testuser");
      await app.close();
    });
  });
});
