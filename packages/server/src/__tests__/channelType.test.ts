import { describe, it, expect } from "vitest";
import { ChannelType } from "@concord/shared";
import { toClientChannelType, toDbChannelType } from "../channelType.js";

describe("channelType mapping", () => {
  it("maps DB values to the client enum", () => {
    expect(toClientChannelType("VOICE")).toBe(ChannelType.Voice);
    expect(toClientChannelType("TEXT")).toBe(ChannelType.Text);
    expect(toClientChannelType("anything else")).toBe(ChannelType.Text);
  });

  it("maps client input to DB values (case-insensitive, defaults to TEXT)", () => {
    expect(toDbChannelType("voice")).toBe("VOICE");
    expect(toDbChannelType("VOICE")).toBe("VOICE");
    expect(toDbChannelType("text")).toBe("TEXT");
    expect(toDbChannelType(undefined)).toBe("TEXT");
    expect(toDbChannelType("garbage")).toBe("TEXT");
  });

  it("round-trips", () => {
    expect(toClientChannelType(toDbChannelType("voice"))).toBe(ChannelType.Voice);
    expect(toClientChannelType(toDbChannelType("text"))).toBe(ChannelType.Text);
  });
});
