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
  Role,
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

  updateProfile: async (data: { displayName?: string; avatar?: File; removeAvatar?: boolean }) => {
    const formData = new FormData();
    if (data.displayName) formData.append("displayName", data.displayName);
    if (data.avatar) formData.append("avatar", data.avatar);
    if (data.removeAvatar) formData.append("removeAvatar", "true");

    const headers: Record<string, string> = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: "PATCH",
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
    return res.json() as Promise<{ user: AuthResponse["user"] }>;
  },

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

  // Roles
  getRoles: (serverId: string) =>
    request<{ roles: Role[] }>(`/servers/${serverId}/roles`),

  createRole: (serverId: string, data: { name: string; color?: string; permissions?: number }) =>
    request<{ role: Role }>(`/servers/${serverId}/roles`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateRole: (serverId: string, roleId: string, data: { name?: string; color?: string | null; permissions?: number }) =>
    request<{ role: Role }>(`/servers/${serverId}/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteRole: (serverId: string, roleId: string) =>
    request<{ deleted: boolean }>(`/servers/${serverId}/roles/${roleId}`, { method: "DELETE" }),

  assignRole: (serverId: string, userId: string, roleId: string) =>
    request<{ assigned: boolean }>(`/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: "POST" }),

  removeRole: (serverId: string, userId: string, roleId: string) =>
    request<{ removed: boolean }>(`/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: "DELETE" }),

  getMyPermissions: (serverId: string, userId: string) =>
    request<{ permissions: number }>(`/servers/${serverId}/members/${userId}/permissions`),

  // Voice moderation
  voiceKick: (channelId: string, targetId: string) =>
    request<{ kicked: boolean }>(`/voice/${channelId}/kick/${targetId}`, { method: "POST" }),

  voiceMute: (channelId: string, targetId: string, muted: boolean) =>
    request<{ muted: boolean }>(`/voice/${channelId}/mute/${targetId}`, {
      method: "POST",
      body: JSON.stringify({ muted }),
    }),

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

  musicPause: (voiceChannelId: string) =>
    request<MusicState>(`/music/pause/${voiceChannelId}`, { method: "POST" }),

  musicResume: (voiceChannelId: string) =>
    request<MusicState>(`/music/resume/${voiceChannelId}`, { method: "POST" }),

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
