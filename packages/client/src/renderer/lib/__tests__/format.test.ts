import { describe, it, expect } from "vitest";
import { formatDuration } from "../format";

describe("formatDuration", () => {
  it("returns empty string for 0/falsy", () => {
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(NaN)).toBe("");
  });

  it("formats seconds as m:ss with zero-padding", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("floors fractional seconds", () => {
    expect(formatDuration(90.9)).toBe("1:30");
  });

  it("does not roll over into hours (minutes keep counting)", () => {
    expect(formatDuration(3600)).toBe("60:00");
  });
});
