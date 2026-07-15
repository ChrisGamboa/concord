// Pure markdown tokenizer for chat messages. Kept separate from rendering so the
// parsing logic can be unit-tested without a DOM.

export type Token =
  | { type: "text"; value: string }
  | { type: "bold"; children: Token[] }
  | { type: "italic"; children: Token[] }
  | { type: "strikethrough"; children: Token[] }
  | { type: "code"; value: string }
  | { type: "codeblock"; value: string; lang?: string }
  | { type: "link"; url: string }
  | { type: "mention"; username: string; userId?: string };

/** Tokenize a message: fenced code blocks first, then inline formatting. */
export function tokenizeMarkdown(text: string, mentionUsers?: Map<string, string>): Token[] {
  const tokens: Token[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(...tokenizeInline(text.slice(lastIndex, match.index), mentionUsers));
    }
    tokens.push({ type: "codeblock", value: match[2], lang: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push(...tokenizeInline(text.slice(lastIndex), mentionUsers));
  }
  return tokens;
}

function tokenizeInline(text: string, mentionUsers?: Map<string, string>): Token[] {
  const tokens: Token[] = [];
  // Split by inline code first (backtick), since nothing is parsed inside code.
  const codeParts = text.split(/(`[^`]+`)/g);
  for (const codePart of codeParts) {
    if (codePart.startsWith("`") && codePart.endsWith("`") && codePart.length > 2) {
      tokens.push({ type: "code", value: codePart.slice(1, -1) });
      continue;
    }
    tokenizeFormatted(codePart, tokens, mentionUsers);
  }
  return tokens;
}

function tokenizeFormatted(text: string, tokens: Token[], mentionUsers?: Map<string, string>) {
  // **bold**, *italic*, ~~strikethrough~~, @mentions, URLs
  const inlineRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(@(\w+))|(https?:\/\/[^\s<]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      tokens.push({ type: "bold", children: [{ type: "text", value: match[2] }] });
    } else if (match[3]) {
      tokens.push({ type: "italic", children: [{ type: "text", value: match[4] }] });
    } else if (match[5]) {
      tokens.push({ type: "strikethrough", children: [{ type: "text", value: match[6] }] });
    } else if (match[7]) {
      const username = match[8];
      tokens.push({ type: "mention", username, userId: mentionUsers?.get(username) });
    } else if (match[9]) {
      tokens.push({ type: "link", url: match[9] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }
}
