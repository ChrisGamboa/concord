import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

/**
 * The current user's effective permission bitmask for a server (0 until loaded).
 * Replaces the getMyPermissions fetch-into-state pattern duplicated across
 * ChatArea, VoiceChannel, ChannelSidebar, and MemberList.
 */
export function useMyPermissions(serverId: string | undefined | null): number {
  const userId = useAuthStore((s) => s.user?.id);
  const [permissions, setPermissions] = useState(0);

  useEffect(() => {
    if (!serverId || !userId) {
      setPermissions(0);
      return;
    }
    let stale = false;
    api.getMyPermissions(serverId, userId)
      .then((res) => { if (!stale) setPermissions(res.permissions); })
      .catch(() => {});
    return () => { stale = true; };
  }, [serverId, userId]);

  return permissions;
}
