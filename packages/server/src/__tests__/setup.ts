import { vi } from "vitest";

// Mock ioredis
vi.mock("ioredis", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      disconnect: vi.fn(),
    })),
  };
});
