import { useEffect, useState } from "react";

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface ScreenPickerProps {
  onSelect: (sourceId: string) => void;
  onCancel: () => void;
}

export function ScreenPicker({ onSelect, onCancel }: ScreenPickerProps) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.getScreenSources) {
      onCancel();
      return;
    }
    electron.getScreenSources().then((srcs: ScreenSource[]) => {
      setSources(srcs);
      setLoading(false);
    }).catch(() => onCancel());
  }, [onCancel]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="screen-picker-overlay" onClick={onCancel}>
      <div className="screen-picker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="screen-picker-header">
          <h2 className="screen-picker-title">Share Your Screen</h2>
          <button className="screen-picker-close" onClick={onCancel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="screen-picker-grid">
          {loading && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--text-muted)", padding: "24px" }}>
              Loading sources...
            </div>
          )}
          {sources.map((source) => (
            <button
              key={source.id}
              className="screen-picker-source"
              onClick={() => onSelect(source.id)}
            >
              <img
                className="screen-picker-thumb"
                src={source.thumbnail}
                alt={source.name}
              />
              <span className="screen-picker-name">{source.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
