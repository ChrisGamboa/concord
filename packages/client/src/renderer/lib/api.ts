import type {
  AuthResponse,
  ChannelsResponse,
  LoginRequest,
  MessagesResponse,
  RegisterRequest,
  ServersResponse,
  MembersResponse,
} from "@concord/shared";

const API_BASE = "http://localhost:3001/api";

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
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
};
