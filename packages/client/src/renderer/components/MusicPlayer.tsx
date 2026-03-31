import { useState, useEffect, useCallback, type FormEvent } from "react";
import { api } from "../lib/api";
import { useVoiceStore } from "../stores/voice";
import type { MusicSearchResult, MusicState } from "@concord/shared";

export function MusicPlayer() {
  const voiceChannelId = useVoiceStore((s) => s.activeChannelId);
  const isConnected = useVoiceStore((s) => s.isConnected);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MusicSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [musicState, setMusicState] = useState<MusicState | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Poll music state
  useEffect(() => {
    if (!voiceChannelId || !isConnected) return;

    const fetchState = () => {
      api.musicGetState(voiceChannelId).then(setMusicState).catch(() => {});
    };

    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, [voiceChannelId, isConnected]);

  const handleSearch = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      setSearching(true);
      try {
        const res = await api.musicSearch(searchQuery.trim());
        setSearchResults(res.results);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [searchQuery]
  );

  const handleAddToQueue = useCallback(
    async (result: MusicSearchResult) => {
      if (!voiceChannelId) return;
      const state = await api.musicAddToQueue(voiceChannelId, {
        url: result.url,
        title: result.title,
        duration: result.duration,
        thumbnail: result.thumbnail ?? undefined,
      });
      setMusicState(state);
      setSearchResults([]);
      setSearchQuery("");
    },
    [voiceChannelId]
  );

  const handleSkip = useCallback(async () => {
    if (!voiceChannelId) return;
    const state = await api.musicSkip(voiceChannelId);
    setMusicState(state);
  }, [voiceChannelId]);

  const handleStop = useCallback(async () => {
    if (!voiceChannelId) return;
    const state = await api.musicStop(voiceChannelId);
    setMusicState(state);
  }, [voiceChannelId]);

  if (!isConnected || !voiceChannelId) return null;

  return (
    <div style={styles.container}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={styles.toggleButton}
      >
        {musicState?.isPlaying ? "Now Playing" : "Music"}
        {musicState?.isPlaying && musicState.currentTrack && (
          <span style={styles.nowPlayingText}>
            {" "}
            - {musicState.currentTrack.title}
          </span>
        )}
      </button>

      {expanded && (
        <div style={styles.panel}>
          {/* Now Playing */}
          {musicState?.currentTrack && (
            <div style={styles.nowPlaying}>
              <div style={styles.trackInfo}>
                <span style={styles.trackTitle}>
                  {musicState.currentTrack.title}
                </span>
                <span style={styles.trackDuration}>
                  {formatDuration(musicState.currentTrack.duration)}
                </span>
              </div>
              <div style={styles.playbackControls}>
                <button onClick={handleSkip} style={styles.smallButton}>
                  Skip
                </button>
                <button onClick={handleStop} style={styles.smallButton}>
                  Stop
                </button>
              </div>
            </div>
          )}

          {/* Queue */}
          {musicState && musicState.queue.length > 0 && (
            <div style={styles.queue}>
              <span style={styles.queueLabel}>
                Queue ({musicState.queue.length})
              </span>
              {musicState.queue.map((item, i) => (
                <div key={item.id} style={styles.queueItem}>
                  <span style={styles.queueIndex}>{i + 1}.</span>
                  <span style={styles.queueTitle}>{item.title}</span>
                  <span style={styles.trackDuration}>
                    {formatDuration(item.duration)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <form onSubmit={handleSearch} style={styles.searchForm}>
            <input
              style={styles.searchInput}
              placeholder="Search YouTube..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              style={styles.searchButton}
              type="submit"
              disabled={searching}
            >
              {searching ? "..." : "Search"}
            </button>
          </form>

          {/* Results */}
          {searchResults.length > 0 && (
            <div style={styles.results}>
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleAddToQueue(result)}
                  style={styles.resultItem}
                >
                  <div style={styles.resultInfo}>
                    <span style={styles.resultTitle}>{result.title}</span>
                    <span style={styles.trackDuration}>
                      {formatDuration(result.duration)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 0,
    left: "var(--server-list-width)",
    right: 0,
    zIndex: 100,
  },
  toggleButton: {
    width: "100%",
    padding: "8px 16px",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    border: "none",
    borderTop: "1px solid var(--border)",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    textAlign: "left",
    display: "flex",
    alignItems: "center",
  },
  nowPlayingText: {
    fontWeight: 400,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  panel: {
    background: "var(--bg-secondary)",
    borderTop: "1px solid var(--border)",
    maxHeight: "400px",
    overflowY: "auto",
    padding: "12px",
  },
  nowPlaying: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    background: "var(--bg-tertiary)",
    borderRadius: "6px",
    marginBottom: "8px",
  },
  trackInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    flex: 1,
  },
  trackTitle: {
    fontSize: "13px",
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  trackDuration: {
    fontSize: "11px",
    color: "var(--text-muted)",
  },
  playbackControls: {
    display: "flex",
    gap: "4px",
    flexShrink: 0,
    marginLeft: "12px",
  },
  smallButton: {
    padding: "4px 10px",
    background: "var(--bg-primary)",
    color: "var(--text-secondary)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
  },
  queue: {
    marginBottom: "8px",
  },
  queueLabel: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    display: "block",
    marginBottom: "4px",
  },
  queueItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    fontSize: "13px",
  },
  queueIndex: {
    color: "var(--text-muted)",
    fontSize: "12px",
    width: "20px",
  },
  queueTitle: {
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  searchForm: {
    display: "flex",
    gap: "8px",
    marginBottom: "8px",
  },
  searchInput: {
    flex: 1,
    padding: "8px 12px",
    background: "var(--input-bg)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "13px",
    outline: "none",
  },
  searchButton: {
    padding: "8px 16px",
    background: "var(--accent)",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
  },
  results: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  resultItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px",
    background: "transparent",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
    width: "100%",
  },
  resultInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    flex: 1,
  },
  resultTitle: {
    fontSize: "13px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};
