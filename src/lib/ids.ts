/** The next free id for a prefix: one past the highest existing number (`F1`, `F2`, …). */
export function nextPrefixedId(items: readonly { id: string }[], prefix: string): string {
  const highest = items.reduce((max, item) => {
    const number = Number(item.id.slice(prefix.length));
    return item.id.startsWith(prefix) && Number.isInteger(number) ? Math.max(max, number) : max;
  }, 0);
  return `${prefix}${String(highest + 1)}`;
}
