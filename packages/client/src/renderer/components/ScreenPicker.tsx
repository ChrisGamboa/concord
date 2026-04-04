import { useEffect, useState } from "react";

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

/**
 * Modal overlay that appears when the user clicks "Share Screen".
 * The main process sends available sources, the user picks one,
 * and we send the selection back.
 */
export function ScreenPicker() {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.onScreenSharePick) return;

    const cleanup = electron.onScreenSharePick((srcs: ScreenSource[]) => {
      setSources(srcs);
    });

    return cleanup;
  }, []);

  if (!sources) return null;

  const handleSelect = (id: string) => {
    (window as any).electron?.selectScreenSource(id);
    setSources(null);
  };

  const handleCancel = () => {
    (window as any).electron?.selectScreenSource(null);
    setSources(null);
  };

  return (
    <div className="screen-picker-overlay" onClick={handleCancel}>
      <div className="screen-picker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="screen-picker-header">
          <h2 className="screen-picker-title">Share Your Screen</h2>
          <button className="screen-picker-close" onClick={handleCancel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="screen-picker-grid">
          {sources.map((source) => (
            <button
              key={source.id}
              className="screen-picker-source"
              onClick={() => handleSelect(source.id)}
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
