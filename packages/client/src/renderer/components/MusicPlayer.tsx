import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
} from "react";
import { api } from "../lib/api";
import { useVoiceStore } from "../stores/voice";
import type { MusicSearchResult, MusicState } from "@concord/shared";

export function MusicPlayer() {
  const voiceChannelId = useVoiceStore((s) => s.connection?.channelId ?? null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MusicSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [musicState, setMusicState] = useState<MusicState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear stale state when leaving voice channel
  useEffect(() => {
    if (!voiceChannelId) {
      setMusicState(null);
      setSearchResults([]);
      setSearchQuery("");
      setExpanded(false);
    }
  }, [voiceChannelId]);

  // Poll music state
  useEffect(() => {
    if (!voiceChannelId) return;

    const fetchState = () => {
      api.musicGetState(voiceChannelId).then(setMusicState).catch(() => {});
    };

    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, [voiceChannelId]);

  // Focus search input when panel opens
  useEffect(() => {
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [expanded]);

  // Debounced search
  const doSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await api.musicSearch(query.trim());
        setSearchResults(res.results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const handleSearchInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 300);
    },
    [doSearch]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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

  const handleRemoveFromQueue = useCallback(
    async (index: number) => {
      if (!voiceChannelId) return;
      const state = await api.musicRemoveFromQueue(voiceChannelId, index);
      setMusicState(state);
    },
    [voiceChannelId]
  );

  const handleClearQueue = useCallback(async () => {
    if (!voiceChannelId) return;
    const state = await api.musicClearQueue(voiceChannelId);
    setMusicState(state);
  }, [voiceChannelId]);

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

  if (!voiceChannelId) return null;

  const isPlaying = musicState?.isPlaying && musicState.currentTrack;
  const hasQueue = musicState && musicState.queue.length > 0;

  return (
    <div className="music-player">
      {/* Collapsed bar */}
      <div
        className={`music-bar ${!isPlaying ? "music-bar-idle" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        {isPlaying && musicState.currentTrack?.thumbnail ? (
          <img
            className="music-bar-thumbnail"
            src={musicState.currentTrack.thumbnail}
            alt=""
          />
        ) : null}

        <div className="music-bar-info">
          <span className="music-bar-label">
            {isPlaying ? "Now Playing" : "Music"}
          </span>
          {isPlaying && (
            <span className="music-bar-title">
              {musicState.currentTrack!.title}
            </span>
          )}
        </div>

        {isPlaying && (
          <div
            className="music-bar-controls"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="music-ctrl-btn"
              onClick={handleSkip}
              title="Skip"
            >
              {ICON_SKIP}
            </button>
            <button
              className="music-ctrl-btn music-ctrl-btn--danger"
              onClick={handleStop}
              title="Stop"
            >
              {ICON_STOP}
            </button>
          </div>
        )}

        <span
          className={`music-chevron ${expanded ? "music-chevron--open" : ""}`}
        >
          {ICON_CHEVRON}
        </span>
      </div>

      {/* Expandable panel */}
      <div className={`music-panel ${expanded ? "music-panel--open" : ""}`}>
        {/* Now Playing detail */}
        {isPlaying && (
          <div className="music-now-playing">
            {musicState.currentTrack?.thumbnail ? (
              <img
                className="music-now-thumb"
                src={musicState.currentTrack.thumbnail}
                alt=""
              />
            ) : (
              <div className="music-now-thumb-placeholder">{ICON_NOTE}</div>
            )}
            <div className="music-now-info">
              <span className="music-now-label">Now Playing</span>
              <span className="music-now-title">
                {musicState.currentTrack!.title}
              </span>
              <span className="music-now-duration">
                {formatDuration(musicState.currentTrack!.duration)}
              </span>
            </div>
            <div className="music-bar-controls">
              <button
                className="music-ctrl-btn"
                onClick={handleSkip}
                title="Skip"
              >
                {ICON_SKIP}
              </button>
              <button
                className="music-ctrl-btn music-ctrl-btn--danger"
                onClick={handleStop}
                title="Stop"
              >
                {ICON_STOP}
              </button>
            </div>
          </div>
        )}

        {/* Queue */}
        {hasQueue && (
          <div className="music-queue-list">
            <div className="music-queue-header">
              <span className="music-queue-label">
                Up Next ({musicState.queue.length})
              </span>
              <button className="music-queue-clear" onClick={handleClearQueue}>
                Clear
              </button>
            </div>
            {musicState.queue.map((item, i) => (
              <div key={item.id} className="music-queue-item">
                <span className="music-queue-index">{i + 1}</span>
                {item.thumbnail ? (
                  <img
                    className="music-queue-thumb"
                    src={item.thumbnail}
                    alt=""
                  />
                ) : null}
                <div className="music-queue-info">
                  <span className="music-queue-title">{item.title}</span>
                  <span className="music-queue-duration">
                    {formatDuration(item.duration)}
                  </span>
                </div>
                <button
                  className="music-queue-remove"
                  onClick={() => handleRemoveFromQueue(i)}
                  title="Remove"
                >
                  {ICON_CLOSE}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="music-search">
          <span className="music-search-icon">{ICON_SEARCH}</span>
          <input
            ref={inputRef}
            className="music-search-input"
            placeholder="Search for a song..."
            value={searchQuery}
            onChange={handleSearchInput}
          />
          {searching && <span className="music-search-spinner">{ICON_LOADING}</span>}
        </div>

        {/* Results */}
        {searchResults.length > 0 && (
          <div className="music-results">
            {searchResults.map((result) => (
              <button
                key={result.id}
                className="music-result"
                onClick={() => handleAddToQueue(result)}
              >
                {result.thumbnail ? (
                  <img
                    className="music-result-thumb"
                    src={result.thumbnail}
                    alt=""
                  />
                ) : (
                  <div className="music-result-thumb" />
                )}
                <div className="music-result-info">
                  <span className="music-result-title">{result.title}</span>
                  <span className="music-result-duration">
                    {formatDuration(result.duration)}
                  </span>
                </div>
                <span className="music-result-add">+ Add</span>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isPlaying && !hasQueue && searchResults.length === 0 && !searching && (
          <div className="music-empty">
            <div className="music-empty-icon">{ICON_NOTE}</div>
            Search for a song to get started
          </div>
        )}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// SVG icons as inline JSX to avoid external dependencies

const ICON_SKIP = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 3l7 5-7 5V3zm8 0h2v10h-2V3z" />
  </svg>
);

const ICON_STOP = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="3" width="10" height="10" rx="1" />
  </svg>
);

const ICON_CHEVRON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.47 5.47a.75.75 0 011.06 0L8 7.94l2.47-2.47a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 010-1.06z" />
  </svg>
);

const ICON_SEARCH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" />
  </svg>
);

const ICON_NOTE = (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 13c0 1.105-1.12 2-2.5 2S1 14.105 1 13s1.12-2 2.5-2 2.5.895 2.5 2zm9-2c0 1.105-1.12 2-2.5 2s-2.5-.895-2.5-2 1.12-2 2.5-2 2.5.895 2.5 2zM15 1v9h-2V3H6v1H4V1h11z" />
  </svg>
);

const ICON_CLOSE = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
  </svg>
);

const ICON_LOADING = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10V3z" opacity="0.6" />
  </svg>
);
