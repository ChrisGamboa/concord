import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useChatStore } from "../stores/chat";

interface SwitcherItem {
  type: "server" | "text" | "voice" | "dm";
  id: string;
  label: string;
  sublabel: string | null;
  route: string;
}

const TYPE_ICONS: Record<SwitcherItem["type"], string> = {
  server: "◆",
  text: "#",
  voice: "🔊",
  dm: "@",
};

export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const servers = useChatStore((s) => s.servers);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SwitcherItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Build the searchable index: servers, every server's channels, DM conversations
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const all: SwitcherItem[] = servers.map((s) => ({
        type: "server",
        id: s.id,
        label: s.name,
        sublabel: null,
        route: `/channels/${s.id}`,
      }));

      const [convResult, ...channelResults] = await Promise.allSettled([
        api.getConversations(),
        ...servers.map((s) =>
          api.getChannels(s.id).then((r) => ({ server: s, channels: r.channels }))
        ),
      ]);

      if (convResult.status === "fulfilled") {
        for (const conv of convResult.value.conversations) {
          all.push({
            type: "dm",
            id: conv.id,
            label: conv.otherUser.displayName,
            sublabel: `@${conv.otherUser.username}`,
            route: `/channels/@me/${conv.id}`,
          });
        }
      }
      for (const res of channelResults) {
        if (res.status !== "fulfilled") continue;
        const { server, channels } = res.value;
        for (const ch of channels) {
          all.push({
            type: ch.type === "voice" ? "voice" : "text",
            id: ch.id,
            label: ch.name,
            sublabel: server.name,
            route: `/channels/${server.id}/${ch.id}`,
          });
        }
      }
      if (!cancelled) setItems(all);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [servers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 10);
    return items
      .map((it) => ({ it, idx: it.label.toLowerCase().indexOf(q) }))
      .filter((x) => x.idx !== -1)
      .sort((a, b) => a.idx - b.idx || a.it.label.length - b.it.label.length)
      .slice(0, 10)
      .map((x) => x.it);
  }, [items, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Keep the active row visible while arrowing through results
  useEffect(() => {
    listRef.current
      ?.querySelector(".quick-switcher-item--active")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const select = (item: SwitcherItem | undefined) => {
    if (!item) return;
    navigate(item.route);
    onClose();
  };

  return (
    <div className="quick-switcher-overlay" onClick={onClose}>
      <div className="quick-switcher" onClick={(e) => e.stopPropagation()}>
        <input
          className="quick-switcher-input"
          placeholder="Jump to a server, channel, or DM..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              select(filtered[activeIdx]);
            }
          }}
          autoFocus
        />
        <div className="quick-switcher-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="quick-switcher-empty">No matches</div>
          )}
          {filtered.map((item, i) => (
            <button
              key={`${item.type}-${item.id}`}
              className={`quick-switcher-item${i === activeIdx ? " quick-switcher-item--active" : ""}`}
              onClick={() => select(item)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="quick-switcher-icon">{TYPE_ICONS[item.type]}</span>
              <span className="quick-switcher-label">{item.label}</span>
              {item.sublabel && (
                <span className="quick-switcher-sublabel">{item.sublabel}</span>
              )}
            </button>
          ))}
        </div>
        <div className="quick-switcher-hint">
          <span>↑↓ navigate</span>
          <span>↵ jump</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
