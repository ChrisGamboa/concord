import type { ReactNode } from "react";
import { tokenizeMarkdown, type Token } from "../lib/markdown";

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
  return <>{renderTokens(tokenizeMarkdown(content, mentionUsers), 0)}</>;
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
