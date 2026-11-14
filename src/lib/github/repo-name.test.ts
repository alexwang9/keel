import { describe, expect, it } from "vitest";
import {
  alternativeRepoNames,
  NameCheckSchema,
  repoNameProblem,
  suggestRepoName,
} from "@/lib/github/repo-name";

describe("repoNameProblem", () => {
  it.each(["shelf", "Shelf_2", "my.app", "a-b-c", "x".repeat(100)])("accepts %s", (name) => {
    expect(repoNameProblem(name)).toBeNull();
  });

  it.each([
    ["", "Enter a repo name."],
    ["x".repeat(101), "Use at most 100 characters."],
    ["my app", "Use only letters, digits, dots, hyphens and underscores."],
    ["café", "Use only letters, digits, dots, hyphens and underscores."],
    [".", "That name is reserved."],
    ["..", "That name is reserved."],
    ["repo.GIT", "A repo name can't end in .git."],
  ])("rejects %j", (name, message) => {
    expect(repoNameProblem(name)).toBe(message);
  });
});

describe("suggestRepoName", () => {
  it.each([
    ["Shelf", "shelf"],
    ["Book Club: Shelf!", "book-club-shelf"],
    ["  Café   Menu  ", "cafe-menu"],
    ["v2.0 notes", "v2.0-notes"],
    ["--hello--", "hello"],
  ])("turns %j into %j", (name, slug) => {
    expect(suggestRepoName(name)).toBe(slug);
  });

  it("falls back when nothing usable is left", () => {
    expect(suggestRepoName("日本語")).toBe("keel-project");
    expect(suggestRepoName("...")).toBe("keel-project");
  });

  it("caps the length and never ends on a separator", () => {
    const slug = suggestRepoName(`${"a".repeat(99)} b`);
    expect(slug).toBe("a".repeat(99));
    expect(repoNameProblem(slug)).toBeNull();
  });
});

describe("alternativeRepoNames", () => {
  it("numbers from 2, replacing an existing suffix", () => {
    expect(alternativeRepoNames("shelf", 3)).toEqual(["shelf-2", "shelf-3", "shelf-4"]);
    expect(alternativeRepoNames("shelf-2", 2)).toEqual(["shelf-2", "shelf-3"]);
  });

  it("stays within the length limit", () => {
    for (const name of alternativeRepoNames("x".repeat(100), 5)) {
      expect(repoNameProblem(name)).toBeNull();
    }
  });
});

describe("NameCheckSchema", () => {
  it("parses both answers and rejects a bad suggestion", () => {
    expect(NameCheckSchema.parse({ available: true })).toEqual({ available: true });
    const taken = { available: false, keel: true, suggestion: "shelf-2" };
    expect(NameCheckSchema.parse(taken)).toEqual(taken);
    expect(NameCheckSchema.safeParse({ ...taken, suggestion: "bad name" }).success).toBe(false);
  });
});
