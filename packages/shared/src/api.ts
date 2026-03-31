import type {
  Channel,
  ChannelType,
  Message,
  PublicUser,
  Server,
  ServerMember,
  User,
} from "./types.js";

// ---- Auth ----

export interface RegisterRequest {
  username: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ---- Servers ----

export interface CreateServerRequest {
  name: string;
}

export interface ServersResponse {
  servers: Server[];
}

// ---- Channels ----

export interface CreateChannelRequest {
  name: string;
  type: ChannelType;
}

export interface ChannelsResponse {
  channels: Channel[];
}

// ---- Messages ----

export interface MessagesResponse {
  messages: Message[];
  hasMore: boolean;
}

export interface MessagesQuery {
  before?: string;
  limit?: number;
}

// ---- Members ----

export interface MembersResponse {
  members: ServerMember[];
}

// ---- Users ----

export interface UserResponse {
  user: PublicUser;
}

// ---- Voice ----

export interface VoiceJoinResponse {
  token: string;
  url: string;
  roomName: string;
}

export interface VoiceParticipant {
  userId: string;
  name: string;
  joinedAt: string | null;
  tracks: VoiceTrack[];
}

export interface VoiceTrack {
  sid: string;
  type: number;
  source: number;
  muted: boolean;
  width: number;
  height: number;
}

export interface VoiceParticipantsResponse {
  participants: VoiceParticipant[];
}
