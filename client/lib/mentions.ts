// @mentions: finding what's being typed after "@", suggesting members,
// inserting the picked name and drawing mentions in a message.
// No React Native imports, so it's unit-testable.

export type Mentionable = { _id: string; displayName: string };

const MAX_QUERY = 40;

// The "@…" being typed right before the cursor, if any. Names can have
// spaces, so the query runs from the "@" to the cursor.
export function mentionQuery(text: string, cursor: number) {
  const match = text.slice(0, cursor).match(/(^|\s)@([^\n@]*)$/);
  if (!match || match[2].length > MAX_QUERY) return null;
  return { start: cursor - match[2].length - 1, query: match[2] };
}

// Members whose name matches, names starting with the query first.
export function matchMembers<T extends Mentionable>(members: T[], query: string, limit = 5): T[] {
  const q = query.trim().toLowerCase();
  const starts: T[] = [];
  const contains: T[] = [];
  for (const member of members) {
    const name = member.displayName.toLowerCase();
    if (name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q))) starts.push(member);
    else if (name.includes(q)) contains.push(member);
  }
  return [...starts, ...contains].slice(0, limit);
}

// Swaps the typed "@query" for "@Full Name ".
export function insertMention(text: string, start: number, cursor: number, name: string) {
  const inserted = `@${name} `;
  return { text: text.slice(0, start) + inserted + text.slice(cursor), cursor: start + inserted.length };
}

// The picked people whose "@Name" is still in the text when it's sent.
export function mentionsInText<T extends Mentionable>(text: string, picked: T[]): T[] {
  const seen = new Set<string>();
  return picked.filter((member) => {
    if (seen.has(member._id) || !text.includes(`@${member.displayName}`)) return false;
    seen.add(member._id);
    return true;
  });
}

// Splits a message into plain text and "@Name" parts for the mentioned names.
export function splitMentions(text: string, names: string[]) {
  const parts: { text: string; mention: boolean }[] = [];
  // Longest first, so "@Ann Lee" wins over "@Ann".
  const tokens = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length).map((name) => `@${name}`);
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const token = text[i] === "@" ? tokens.find((t) => text.startsWith(t, i)) : undefined;
    if (token) {
      if (plain) parts.push({ text: plain, mention: false });
      parts.push({ text: token, mention: true });
      plain = "";
      i += token.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) parts.push({ text: plain, mention: false });
  return parts;
}
