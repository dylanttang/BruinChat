export type GridEmoji = { emoji: string; name: string; keywords?: string[] };
export type EmojiSection = { key: string; emojis: GridEmoji[] };
export type EmojiColumn = {
  key: string;
  emojis: GridEmoji[];
  section: number;
  offset: number;
  width: number;
};

// Lays every section out as one sideways strip, iMessage style: emojis fill
// each column top to bottom, and each section starts on a fresh column with a
// small gap before it.
export function buildEmojiColumns(sections: EmojiSection[], rows: number, cellSize: number, sectionGap: number) {
  const columns: EmojiColumn[] = [];
  const sectionOffsets: number[] = [];
  let offset = 0;
  sections.forEach((section, sectionIndex) => {
    sectionOffsets.push(offset);
    for (let start = 0; start < section.emojis.length; start += rows) {
      const width = cellSize + (start === 0 && sectionIndex > 0 ? sectionGap : 0);
      columns.push({
        key: `${section.key}-${start}`,
        emojis: section.emojis.slice(start, start + rows),
        section: sectionIndex,
        offset,
        width,
      });
      offset += width;
    }
  });
  return { columns, sectionOffsets, totalWidth: offset };
}

// The section showing at the left edge of the strip.
export function sectionAtOffset(sectionOffsets: number[], x: number) {
  let current = 0;
  for (let index = 0; index < sectionOffsets.length; index += 1) {
    if (sectionOffsets[index] <= x + 1) current = index;
  }
  return current;
}

export function searchEmojis(emojis: GridEmoji[], query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return emojis.filter((emoji) => {
    const text = `${emoji.name} ${(emoji.keywords ?? []).join(" ")}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function addRecentEmoji(recent: string[], emoji: string, limit: number) {
  return [emoji, ...recent.filter((other) => other !== emoji)].slice(0, limit);
}
