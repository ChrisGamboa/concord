// ---- Identifiers ----

export type UserId = string;
export type ServerId = string;
export type ChannelId = string;
export type MessageId = string;
export type RoleId = string;

// ---- Users ----

export interface User {
  id: UserId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string | null;
  createdAt: string;
}

export interface PublicUser {
  id: UserId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string | null;
}

// ---- Servers ----

export interface Server {
  id: ServerId;
  name: string;
  iconUrl: string | null;
  ownerId: UserId;
  createdAt: string;
}

// ---- Channels ----

export enum ChannelType {
  Text = "text",
  Voice = "voice",
}

export interface Channel {
  id: ChannelId;
  serverId: ServerId;
  name: string;
  type: ChannelType;
  position: number;
  createdAt: string;
}

// ---- Messages ----

export interface Message {
  id: MessageId;
  channelId: ChannelId;
  authorId: UserId;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author?: PublicUser;
  reactions?: ReactionGroup[];
}

// ---- Reactions ----

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: UserId[];
}

// ---- Roles ----

export interface Role {
  id: RoleId;
  serverId: ServerId;
  name: string;
  color: string | null;
  permissions: number;
  position: number;
}

// ---- Permissions (bitmask) ----

export const Permissions = {
  ADMIN: 1 << 0,
  MANAGE_CHANNELS: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  MANAGE_SERVER: 1 << 3,
  SEND_MESSAGES: 1 << 4,
  READ_MESSAGES: 1 << 5,
  CONNECT_VOICE: 1 << 6,
  SPEAK: 1 << 7,
  STREAM: 1 << 8,
  MANAGE_MESSAGES: 1 << 9,
  KICK_MEMBERS: 1 << 10,
  BAN_MEMBERS: 1 << 11,
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export function hasPermission(userPerms: number, perm: number): boolean {
  if (userPerms & Permissions.ADMIN) return true;
  return (userPerms & perm) === perm;
}

// ---- Server Members ----

export interface ServerMember {
  userId: UserId;
  serverId: ServerId;
  nickname: string | null;
  roleIds: RoleId[];
  joinedAt: string;
  user?: PublicUser;
}
