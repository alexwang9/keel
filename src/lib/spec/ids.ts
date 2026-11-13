import { ID_PREFIX, type ListName } from "@/lib/spec/schema";

/** The next free id for a list: one past the highest existing number (`F1`, `F2`, …). */
export function nextId(items: readonly { id: string }[], list: ListName): string {
  const prefix = ID_PREFIX[list];
  const highest = items.reduce((max, item) => {
    const number = Number(item.id.slice(prefix.length));
    return item.id.startsWith(prefix) && Number.isInteger(number) ? Math.max(max, number) : max;
  }, 0);
  return `${prefix}${String(highest + 1)}`;
}
