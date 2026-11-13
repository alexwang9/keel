/** Unix line endings, no surrounding whitespace. */
export const normalize = (text: string): string => text.replace(/\r\n?/g, "\n").trim();

/** Collapses line breaks so the text can't escape a heading or a single-line slot. */
export const oneLine = (text: string): string => normalize(text).replace(/\s*\n\s*/g, " ");

/** A list item whose continuation lines are indented so they stay inside the item. */
export const bullet = (text: string): string => `- ${normalize(text).replace(/\n/g, "\n  ")}`;

export const bullets = (items: readonly string[], empty = "None."): string =>
  items.length === 0 ? empty : items.map(bullet).join("\n");

/** Joins blocks with one blank line between them and a single trailing newline. */
export const document = (blocks: readonly string[]): string => `${blocks.join("\n\n")}\n`;
