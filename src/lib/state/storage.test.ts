import { describe, expect, it } from "vitest";
import { emptyState, STORAGE_KEY, type PersistedState } from "@/lib/state/schema";
import { loadState, saveState } from "@/lib/state/storage";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";
const T0 = "2026-11-12T10:00:00.000Z";

const saved: PersistedState = {
  version: 1,
  currentProjectId: ID,
  projects: {
    [ID]: {
      id: ID,
      createdAt: T0,
      updatedAt: T0,
      stage: "interview",
      history: [{ role: "user", content: "A book club app." }],
      draft: { name: "Shelf" },
      spec: null,
      approved: null,
      tickets: null,
    },
  },
};

/** An in-memory Storage; `failWith` makes every write throw that DOMException name. */
function memoryStorage(initial: Record<string, string> = {}, failWith?: string): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failWith) throw new DOMException("write failed", failWith);
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  };
}

describe("loadState", () => {
  it("round-trips a saved state", () => {
    const storage = memoryStorage();

    expect(saveState(storage, saved)).toEqual({ ok: true, value: undefined });
    expect(loadState(storage)).toEqual({ kind: "ok", state: saved });
  });

  it.each(["approved", "tickets"])("loads a state saved before %s existed, as null", (field) => {
    const project = Object.entries(saved.projects[ID] ?? {}).filter(([key]) => key !== field);
    const raw = JSON.stringify({ ...saved, projects: { [ID]: Object.fromEntries(project) } });

    expect(loadState(memoryStorage({ [STORAGE_KEY]: raw }))).toEqual({ kind: "ok", state: saved });
  });

  it("reports nothing saved", () => {
    expect(loadState(memoryStorage())).toEqual({ kind: "empty" });
  });

  it("reports unavailable storage", () => {
    expect(loadState(null)).toEqual({ kind: "unavailable" });
  });

  it("keeps the raw text of JSON it can't parse", () => {
    const result = loadState(memoryStorage({ [STORAGE_KEY]: "{not json" }));

    expect(result).toEqual({
      kind: "corrupt",
      raw: "{not json",
      reasons: ["saved data is not valid JSON"],
    });
  });

  it("rejects a state that fails the schema, with reasons", () => {
    const broken = { ...saved, projects: { [ID]: { ...saved.projects[ID], stage: "shipped" } } };
    const raw = JSON.stringify(broken);

    const result = loadState(memoryStorage({ [STORAGE_KEY]: raw }));

    expect(result.kind).toBe("corrupt");
    if (result.kind !== "corrupt") return;
    expect(result.raw).toBe(raw);
    expect(result.reasons.join("\n")).toContain("stage");
  });

  it("rejects an unknown version", () => {
    const raw = JSON.stringify({ ...emptyState(), version: 2 });

    expect(loadState(memoryStorage({ [STORAGE_KEY]: raw })).kind).toBe("corrupt");
  });

  it("rejects a current project id that isn't stored", () => {
    const raw = JSON.stringify({ ...emptyState(), currentProjectId: ID });

    expect(loadState(memoryStorage({ [STORAGE_KEY]: raw })).kind).toBe("corrupt");
  });

  it("rejects a project stored under another id", () => {
    const other = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
    const project = saved.projects[ID];
    const raw = JSON.stringify({
      ...saved,
      currentProjectId: other,
      projects: { [other]: project },
    });

    expect(loadState(memoryStorage({ [STORAGE_KEY]: raw })).kind).toBe("corrupt");
  });
});

describe("saveState", () => {
  it("reports a full storage as quota", () => {
    expect(saveState(memoryStorage({}, "QuotaExceededError"), saved)).toEqual({
      ok: false,
      error: "quota",
    });
  });

  it("reports other write failures and missing storage as unavailable", () => {
    expect(saveState(memoryStorage({}, "SecurityError"), saved)).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(saveState(null, saved)).toEqual({ ok: false, error: "unavailable" });
  });
});
