import { nextPrefixedId } from "@/lib/ids";
import { ID_PREFIX, type ListName } from "@/lib/spec/schema";

/** The next free id for a spec list: one past the highest existing number (`F1`, `F2`, …). */
export const nextId = (items: readonly { id: string }[], list: ListName): string =>
  nextPrefixedId(items, ID_PREFIX[list]);
