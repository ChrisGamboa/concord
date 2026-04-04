import type {
  AuthResponse,
  ChannelsResponse,
  LoginRequest,
  MessagesResponse,
  RegisterRequest,
  ServersResponse,
  MembersResponse,
  VoiceJoinResponse,
  VoiceParticipantsResponse,
  MusicSearchResponse,
  MusicState,
} from "@concord/shared";

const API_BASE = "http://localhost:3001/api";

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export const api = {
  register: (data: RegisterRequest) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: LoginRequest) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMe: () => request<{ user: AuthResponse["user"] }>("/auth/me"),

  // Servers
  getServers: () => request<ServersResponse>("/servers"),

  createServer: (name: string) =>
    request<ServersResponse["servers"][0]>("/servers", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  joinServer: (serverId: string) =>
    request<{ joined: boolean }>(`/servers/${serverId}/join`, {
      method: "POST",
    }),

  getMembers: (serverId: string) =>
    request<MembersResponse>(`/servers/${serverId}/members`),

  // Channels
  getChannels: (serverId: string) =>
    request<ChannelsResponse>(`/channels/server/${serverId}`),

  createChannel: (serverId: string, name: string, type: string) =>
    request<ChannelsResponse["channels"][0]>(`/channels/server/${serverId}`, {
      method: "POST",
      body: JSON.stringify({ name, type }),
    }),

  // Messages
  getMessages: (channelId: string, before?: string) =>
    request<MessagesResponse>(
      `/messages/channel/${channelId}${before ? `?before=${before}` : ""}`
    ),

  // Voice
  joinVoiceChannel: (channelId: string) =>
    request<VoiceJoinResponse>(`/voice/${channelId}/join`, {
      method: "POST",
    }),

  getVoiceParticipants: (channelId: string) =>
    request<VoiceParticipantsResponse>(`/voice/${channelId}/participants`),

  // Music
  musicSearch: (query: string) =>
    request<MusicSearchResponse>(`/music/search?q=${encodeURIComponent(query)}`),

  musicGetState: (voiceChannelId: string) =>
    request<MusicState>(`/music/state/${voiceChannelId}`),

  musicAddToQueue: (
    voiceChannelId: string,
    track: { url: string; title?: string; duration?: number; thumbnail?: string }
  ) =>
    request<MusicState>(`/music/queue/${voiceChannelId}`, {
      method: "POST",
      body: JSON.stringify(track),
    }),

  musicSkip: (voiceChannelId: string) =>
    request<MusicState>(`/music/skip/${voiceChannelId}`, { method: "POST" }),

  musicStop: (voiceChannelId: string) =>
    request<MusicState>(`/music/stop/${voiceChannelId}`, { method: "POST" }),

  musicRemoveFromQueue: (voiceChannelId: string, index: number) =>
    request<MusicState>(`/music/queue/${voiceChannelId}/${index}`, {
      method: "DELETE",
    }),

  musicClearQueue: (voiceChannelId: string) =>
    request<MusicState>(`/music/queue/${voiceChannelId}`, { method: "DELETE" }),

  musicStatus: () =>
    request<{ available: boolean; message: string }>("/music/status"),

  // Uploads
  uploadFile: async (file: File): Promise<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
  }> => {
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const res = await fetch(`${API_BASE}/uploads`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }

    return res.json();
  },
};
