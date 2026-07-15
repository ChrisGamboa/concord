import { describe, it, expect } from "vitest";
import { tokenizeMarkdown, type Token } from "../markdown";

const types = (tokens: Token[]) => tokens.map((t) => t.type);

describe("tokenizeMarkdown", () => {
  it("returns a single text token for plain text", () => {
    expect(tokenizeMarkdown("hello")).toEqual([{ type: "text", value: "hello" }]);
  });

  it("parses bold, italic, and strikethrough", () => {
    expect(tokenizeMarkdown("**b**")).toEqual([{ type: "bold", children: [{ type: "text", value: "b" }] }]);
    expect(tokenizeMarkdown("*i*")).toEqual([{ type: "italic", children: [{ type: "text", value: "i" }] }]);
    expect(tokenizeMarkdown("~~s~~")).toEqual([{ type: "strikethrough", children: [{ type: "text", value: "s" }] }]);
  });

  it("parses inline code without formatting inside it", () => {
    const tokens = tokenizeMarkdown("a `**not bold**` b");
    expect(tokens).toContainEqual({ type: "code", value: "**not bold**" });
    expect(types(tokens)).toEqual(["text", "code", "text"]);
  });

  it("parses fenced code blocks with an optional language", () => {
    const tokens = tokenizeMarkdown("```js\nconst x = 1;\n```");
    expect(tokens).toEqual([{ type: "codeblock", value: "const x = 1;\n", lang: "js" }]);
  });

  it("keeps text around a code block", () => {
    const tokens = tokenizeMarkdown("before ```\ncode\n``` after");
    expect(types(tokens)).toEqual(["text", "codeblock", "text"]);
  });

  it("resolves mentions to userIds when known", () => {
    const users = new Map([["alice", "u1"]]);
    const tokens = tokenizeMarkdown("hi @alice and @bob", users);
    expect(tokens).toContainEqual({ type: "mention", username: "alice", userId: "u1" });
    expect(tokens).toContainEqual({ type: "mention", username: "bob", userId: undefined });
  });

  it("parses URLs as link tokens", () => {
    const tokens = tokenizeMarkdown("see https://example.com/x now");
    expect(tokens).toContainEqual({ type: "link", url: "https://example.com/x" });
  });
});
