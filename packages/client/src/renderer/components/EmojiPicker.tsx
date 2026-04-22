import { useEffect, useRef, useState } from "react";

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊", "😇", "🥰", "😍", "🤩", "😘", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵", "🤯"],
  },
  {
    label: "Gestures",
    emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🙏", "💪"],
  },
  {
    label: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "💕", "💞", "💓", "💗", "💖", "💘", "💝"],
  },
  {
    label: "Objects",
    emojis: ["🔥", "⭐", "🌟", "✨", "💥", "💯", "🎉", "🎊", "🏆", "🥇", "🎯", "🚀", "💡", "🔔", "🎵", "🎶", "💻", "📱", "⚡", "🌈"],
  },
  {
    label: "Faces",
    emojis: ["😈", "👿", "💀", "☠️", "👻", "👽", "🤖", "💩", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "🐶", "🐱", "🐭"],
  },
  {
    label: "Food",
    emojis: ["🍕", "🍔", "🍟", "🌭", "🍿", "🧀", "🥚", "🍳", "🥓", "🥞", "🧇", "🍞", "🥐", "🥨", "🍩", "🍪", "🎂", "🍰", "🧁", "☕"],
  },
];

export function EmojiPicker({ onSelect, onClose }: Props) {
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const timer = setTimeout(() => {
      window.addEventListener("click", handleClick);
      window.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="emoji-picker-panel" onClick={(e) => e.stopPropagation()}>
      <div className="emoji-picker-panel-header">
        <input
          className="emoji-picker-panel-search"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="emoji-picker-panel-scroll">
        {CATEGORIES.map((cat) => {
          const filtered = search.trim()
            ? cat.emojis // No text-based search for native emoji, just show all
            : cat.emojis;
          if (filtered.length === 0) return null;
          return (
            <div key={cat.label}>
              {!search.trim() && (
                <div className="emoji-picker-panel-label">{cat.label}</div>
              )}
              <div className="emoji-picker-panel-grid">
                {filtered.map((emoji) => (
                  <button
                    key={emoji}
                    className="emoji-picker-panel-btn"
                    onClick={() => onSelect(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
