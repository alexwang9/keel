import { describe, expect, it } from "vitest";
import { formatRepoRef, parseRepoRef } from "@/lib/github/repo-ref";

const shelf = { ok: true, value: { owner: "octocat", name: "shelf" } };

describe("parseRepoRef", () => {
  it.each([
    "octocat/shelf",
    "  octocat/shelf  ",
    "https://github.com/octocat/shelf",
    "http://www.github.com/octocat/shelf/",
    "github.com/octocat/shelf",
    "https://github.com/octocat/shelf.git",
    "https://github.com/octocat/shelf/issues?q=is%3Aopen",
    "https://github.com/octocat/shelf#readme",
  ])("reads %j", (input) => {
    expect(parseRepoRef(input)).toEqual(shelf);
  });

  it("keeps the case and the characters GitHub allows", () => {
    expect(parseRepoRef("Octo-Cat/My_Repo.v2")).toEqual({
      ok: true,
      value: { owner: "Octo-Cat", name: "My_Repo.v2" },
    });
  });

  it.each([
    "",
    "shelf",
    "/shelf",
    "octocat/",
    "octocat/shelf/issues",
    "-octocat/shelf",
    "octo--cat/shelf",
    "octocat/my repo",
    "octocat/..",
    "https://gitlab.com/octocat/shelf",
    `${"a".repeat(40)}/shelf`,
  ])("rejects %j", (input) => {
    expect(parseRepoRef(input).ok).toBe(false);
  });
});

describe("formatRepoRef", () => {
  it("joins owner and name", () => {
    expect(formatRepoRef({ owner: "octocat", name: "shelf" })).toBe("octocat/shelf");
  });
});
