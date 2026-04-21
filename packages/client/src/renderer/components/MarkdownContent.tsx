import type { ReactNode } from "react";

/**
 * Renders markdown-like syntax in chat messages:
 * - **bold**, *italic*, ~~strikethrough~~
 * - `inline code`, ```code blocks```
 * - @mentions (highlighted)
 * - URLs as clickable links
 */

interface MarkdownContentProps {
  content: string;
  /** Map of username -> userId for highlighting mentions */
  mentionUsers?: Map<string, string>;
}

export function MarkdownContent({ content, mentionUsers }: MarkdownContentProps) {
  const nodes = parseMarkdown(content, mentionUsers);
  return <>{nodes}</>;
}

// ---------- Parser ----------

type Token =
  | { type: "text"; value: string }
  | { type: "bold"; children: Token[] }
  | { type: "italic"; children: Token[] }
  | { type: "strikethrough"; children: Token[] }
  | { type: "code"; value: string }
  | { type: "codeblock"; value: string; lang?: string }
  | { type: "link"; url: string }
  | { type: "mention"; username: string; userId?: string };

const URL_REGEX = /https?:\/\/[^\s<]+/g;

function parseMarkdown(text: string, mentionUsers?: Map<string, string>): ReactNode[] {
  // First, extract code blocks (```)
  const parts: Array<{ type: "raw" | "codeblock"; value: string; lang?: string }> = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "raw", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "codeblock", value: match[2], lang: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "raw", value: text.slice(lastIndex) });
  }

  const result: ReactNode[] = [];
  let key = 0;

  for (const part of parts) {
    if (part.type === "codeblock") {
      result.push(
        <pre key={key++} className="md-codeblock">
          <code>{part.value}</code>
        </pre>
      );
    } else {
      const tokens = tokenizeInline(part.value, mentionUsers);
      result.push(...renderTokens(tokens, key));
      key += tokens.length + 1;
    }
  }

  return result;
}

function tokenizeInline(text: string, mentionUsers?: Map<string, string>): Token[] {
  const tokens: Token[] = [];

  // Split by inline code first (backtick), since nothing is parsed inside code
  const codeParts = text.split(/(`[^`]+`)/g);

  for (const codePart of codeParts) {
    if (codePart.startsWith("`") && codePart.endsWith("`") && codePart.length > 2) {
      tokens.push({ type: "code", value: codePart.slice(1, -1) });
      continue;
    }

    // Parse formatting in non-code text
    tokenizeFormatted(codePart, tokens, mentionUsers);
  }

  return tokens;
}

function tokenizeFormatted(text: string, tokens: Token[], mentionUsers?: Map<string, string>) {
  // Combined regex for all inline patterns:
  // **bold**, *italic*, ~~strikethrough~~, @mentions, URLs
  const inlineRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(@(\w+))|(https?:\/\/[^\s<]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Push any text before this match
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // **bold**
      tokens.push({ type: "bold", children: [{ type: "text", value: match[2] }] });
    } else if (match[3]) {
      // *italic*
      tokens.push({ type: "italic", children: [{ type: "text", value: match[4] }] });
    } else if (match[5]) {
      // ~~strikethrough~~
      tokens.push({ type: "strikethrough", children: [{ type: "text", value: match[6] }] });
    } else if (match[7]) {
      // @mention
      const username = match[8];
      const userId = mentionUsers?.get(username);
      tokens.push({ type: "mention", username, userId });
    } else if (match[9]) {
      // URL
      tokens.push({ type: "link", url: match[9] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }
}

function renderTokens(tokens: Token[], startKey: number): ReactNode[] {
  let key = startKey;
  return tokens.map((token) => {
    const k = key++;
    switch (token.type) {
      case "text":
        return <span key={k}>{token.value}</span>;
      case "bold":
        return <strong key={k}>{renderTokens(token.children, key)}</strong>;
      case "italic":
        return <em key={k}>{renderTokens(token.children, key)}</em>;
      case "strikethrough":
        return <s key={k}>{renderTokens(token.children, key)}</s>;
      case "code":
        return <code key={k} className="md-inline-code">{token.value}</code>;
      case "codeblock":
        return (
          <pre key={k} className="md-codeblock">
            <code>{token.value}</code>
          </pre>
        );
      case "link":
        return (
          <a key={k} href={token.url} target="_blank" rel="noopener noreferrer" className="md-link">
            {token.url}
          </a>
        );
      case "mention":
        return (
          <span key={k} className="md-mention" data-user-id={token.userId}>
            @{token.username}
          </span>
        );
      default:
        return null;
    }
  });
}
