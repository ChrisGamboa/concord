import { useEffect, useRef, useState } from "react";
import { avatarColor, avatarUrl } from "../lib/avatar";

export interface MentionMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Renders the mention autocomplete dropdown UI */
export function MentionDropdown({
  filtered,
  activeIndex,
  onSelect,
  listRef,
}: {
  filtered: MentionMember[];
  activeIndex: number;
  onSelect: (member: MentionMember) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="mention-autocomplete" ref={listRef}>
      {filtered.map((member, i) => (
        <button
          key={member.userId}
          className={`mention-item ${i === activeIndex ? "mention-item--active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault(); // Don't blur the input
            onSelect(member);
          }}
        >
          <div className="mention-item-avatar" style={{ background: avatarColor(member.userId) }}>
            {avatarUrl(member.avatarUrl) ? (
              <img src={avatarUrl(member.avatarUrl)!} alt="" />
            ) : (
              member.displayName.charAt(0).toUpperCase()
            )}
          </div>
          <span className="mention-item-name">{member.displayName}</span>
          <span className="mention-item-username">{member.username}</span>
        </button>
      ))}
    </div>
  );
}

/** Find an active @mention trigger in the input string at cursor position */
function findMentionTrigger(
  input: string,
  cursorPos: number
): { query: string; startIdx: number; endIdx: number } | null {
  // Walk backwards from cursor to find @
  const before = input.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;

  // @ must be at start of input or preceded by whitespace
  if (atIdx > 0 && !/\s/.test(before[atIdx - 1])) return null;

  const query = before.slice(atIdx + 1);

  // Don't trigger if query contains spaces (user moved past the mention)
  if (/\s/.test(query)) return null;

  return {
    query,
    startIdx: atIdx,
    endIdx: cursorPos,
  };
}

/**
 * Hook to manage mention autocomplete state.
 * Returns props needed for the dropdown and a keydown handler to attach to the input.
 */
export function useMentionAutocomplete(
  members: MentionMember[],
  input: string,
  cursorPos: number,
  setInput: (val: string) => void,
  inputRef: React.RefObject<HTMLInputElement | null>,
) {
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const trigger = findMentionTrigger(input, cursorPos);

  const filtered = trigger && !dismissed
    ? members.filter((m) => {
        const q = trigger.query.toLowerCase();
        return (
          m.username.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q)
        );
      }).slice(0, 10)
    : [];

  const isOpen = filtered.length > 0;

  // Reset when trigger changes
  useEffect(() => {
    setActiveIndex(0);
    setDismissed(false);
  }, [trigger?.query]);

  const selectMember = (member: MentionMember) => {
    if (!trigger) return;
    const before = input.slice(0, trigger.startIdx);
    const after = input.slice(trigger.endIdx);
    const newInput = `${before}@${member.username} ${after}`;
    setInput(newInput);
    // Move cursor after the inserted mention
    const newCursorPos = trigger.startIdx + member.username.length + 2; // @username + space
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      inputRef.current?.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectMember(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(true);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  return {
    isOpen,
    filtered,
    activeIndex,
    listRef,
    handleKeyDown,
    selectMember,
  };
}
