import { describe, it, expect } from "vitest";
import { isPrivateIp, assertPublicUrl } from "../urlGuard.js";

describe("isPrivateIp", () => {
  it("flags private/loopback/link-local IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "172.31.255.255", "192.168.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "140.82.112.3", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });

  it("flags private/loopback IPv6 (incl. IPv4-mapped)", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12::34", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it("allows public IPv6", () => {
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("treats non-IP input as unsafe", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("ftp://example.com")).rejects.toThrow();
  });

  it("rejects loopback/private hosts by IP literal", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/admin")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(assertPublicUrl("http://[::1]:8080/")).rejects.toThrow();
  });

  it("rejects malformed URLs", async () => {
    await expect(assertPublicUrl("http://")).rejects.toThrow();
  });
});
