import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { api } from "../lib/api";

interface GifResult {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
  width: number;
  height: number;
}

export function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.gifSearch(q || undefined);
      setResults(res.gifs);
    } catch {
      setError("GIF search unavailable");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    doSearch("");
  }, [doSearch]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(val), 300);
    },
    [doSearch]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="gif-picker">
      <div className="gif-picker-header">
        <input
          ref={inputRef}
          className="gif-picker-search"
          placeholder="Search KLIPY"
          value={query}
          onChange={handleInput}
        />
      </div>
      <div className="gif-picker-grid">
        {loading && results.length === 0 && (
          <div className="gif-picker-status">Loading...</div>
        )}
        {error && (
          <div className="gif-picker-status">{error}</div>
        )}
        {results.map((gif) => (
          <button
            key={gif.id}
            className="gif-picker-item"
            onClick={() => onSelect(gif.url)}
            title={gif.title}
          >
            <img
              src={gif.previewUrl}
              alt={gif.title}
              loading="lazy"
            />
          </button>
        ))}
        {!loading && results.length === 0 && !error && (
          <div className="gif-picker-status">No results</div>
        )}
      </div>
      <div className="gif-picker-footer">
        Powered by KLIPY
      </div>
    </div>
  );
}
