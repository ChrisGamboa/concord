import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@concord/shared";
import { api, setApiToken } from "../lib/api";
import { connectWs, disconnectWs } from "../lib/ws";

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => {
        setApiToken(token);
        connectWs(token);
        set({ token, user });
      },
      logout: () => {
        // Best-effort server-side revocation (invalidates outstanding tokens) before
        // clearing local state; fires with the current token still set.
        api.logout().catch(() => {});
        setApiToken(null);
        disconnectWs();
        set({ token: null, user: null });
      },
      updateUser: (user) => set({ user }),
    }),
    {
      name: "concord-auth",
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          setApiToken(state.token);
          connectWs(state.token);
        }
      },
    }
  )
);
