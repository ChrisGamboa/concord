import { ChannelType } from "@concord/shared";

// Single mapping between the Prisma enum (TEXT/VOICE) and the shared client enum
// (text/voice), replacing scattered toLowerCase()/toUpperCase() conversions.

export type DbChannelType = "TEXT" | "VOICE";

export function toClientChannelType(db: string): ChannelType {
  return db === "VOICE" ? ChannelType.Voice : ChannelType.Text;
}

export function toDbChannelType(client: string | undefined | null): DbChannelType {
  return String(client).toUpperCase() === "VOICE" ? "VOICE" : "TEXT";
}
