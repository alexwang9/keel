import { describe, expect, it } from "vitest";
import { renderReadme, repoDescription } from "@/lib/github/readme";
import { SpecSchema } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

const spec = SpecSchema.parse(completeDraft);

describe("renderReadme", () => {
  it("renders the name, goal and links deterministically", () => {
    expect(renderReadme(spec)).toMatchInlineSnapshot(`
      "# Shelf

      Give a book club one shared list of past and upcoming books with votes on the next pick.

      - [SPEC.md](SPEC.md): what this project is, its features and their acceptance checks
      - [docs/interview.md](docs/interview.md): the interview the spec came from
      - [Issues](../../issues): the work, one ticket per issue, with \`Depends on #N\` links

      _Planned with Keel._
      "
    `);
  });
});

describe("repoDescription", () => {
  it("is the goal on one line", () => {
    expect(repoDescription({ ...spec, goal: "Line one.\nLine two." })).toBe("Line one. Line two.");
  });

  it("cuts a long goal to GitHub's 350-character limit", () => {
    const description = repoDescription({ ...spec, goal: "x".repeat(400) });
    expect(description).toHaveLength(350);
    expect(description.endsWith("…")).toBe(true);
  });
});
