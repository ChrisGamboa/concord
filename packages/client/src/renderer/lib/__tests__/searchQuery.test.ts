import { describe, it, expect } from "vitest";
import { parseSearchQuery } from "../searchQuery";

describe("parseSearchQuery", () => {
  it("returns plain text when there are no filters", () => {
    expect(parseSearchQuery("hello world")).toEqual({
      text: "hello world", from: null, inChannel: null, before: null, after: null,
    });
  });

  it("extracts from: (stripping a leading @) and in: (stripping #)", () => {
    const r = parseSearchQuery("deploy from:@alice in:#general");
    expect(r.text).toBe("deploy");
    expect(r.from).toBe("alice");
    expect(r.inChannel).toBe("general");
  });

  it("extracts before:/after: dates", () => {
    const r = parseSearchQuery("bug before:2026-01-01 after:2025-01-01");
    expect(r).toMatchObject({ text: "bug", before: "2026-01-01", after: "2025-01-01" });
  });

  it("is case-insensitive on filter keys", () => {
    expect(parseSearchQuery("From:Bob").from).toBe("Bob");
  });

  it("keeps unknown tokens as text and collapses whitespace", () => {
    const r = parseSearchQuery("  foo   bar:baz  qux  ");
    expect(r.text).toBe("foo bar:baz qux");
  });

  it("handles a filter-only query (no free text)", () => {
    expect(parseSearchQuery("from:alice")).toMatchObject({ text: "", from: "alice" });
  });
});
