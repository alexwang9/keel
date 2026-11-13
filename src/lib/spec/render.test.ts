import { describe, expect, it } from "vitest";
import { SPEC_MARKER, renderSpecMarkdown } from "@/lib/spec/render";
import { SpecSchema, type SpecDraft } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

const spec = (overrides: SpecDraft = {}) => SpecSchema.parse({ ...completeDraft, ...overrides });

describe("renderSpecMarkdown", () => {
  it("renders the full template", async () => {
    await expect(renderSpecMarkdown(spec())).toMatchFileSnapshot("__snapshots__/SPEC.md");
  });

  it("is deterministic", () => {
    expect(renderSpecMarkdown(spec())).toBe(renderSpecMarkdown(spec()));
  });

  it("starts with the Keel marker and ends with exactly one newline", () => {
    const markdown = renderSpecMarkdown(spec());

    expect(markdown.split("\n")[0]).toBe(SPEC_MARKER);
    expect(markdown).toMatch(/[^\n]\n$/);
  });

  it("renders explicit none values with their reasons", () => {
    const markdown = renderSpecMarkdown(
      spec({
        dataModel: { none: true, reason: "Stateless CLI." },
        integrations: { none: true, reason: "Works offline." },
        auth: { none: false, description: "GitHub sign-in." },
      }),
    );

    expect(markdown).toContain("## Data model\n\nNone: Stateless CLI.\n");
    expect(markdown).toContain("## Integrations\n\nNone: Works offline.\n");
    expect(markdown).toContain("## Auth\n\nGitHub sign-in.\n");
  });

  it("renders empty optional lists as None", () => {
    const markdown = renderSpecMarkdown(spec({ outOfScope: [], constraints: [] }));

    expect(markdown).toContain("## Out of scope\n\nNone.\n");
    expect(markdown).toContain("## Constraints and preferences\n\nNone.\n");
  });

  it("keeps multi-line text inside its list item and headings on one line", () => {
    const markdown = renderSpecMarkdown(
      spec({
        name: "Shelf\r\nApp",
        outOfScope: ["Buying books\nor selling them"],
      }),
    );

    expect(markdown).toContain("# Shelf App\n");
    expect(markdown).toContain("- Buying books\n  or selling them\n");
    expect(markdown).not.toContain("\r");
  });

  it("names relationship ends by entity name", () => {
    expect(renderSpecMarkdown(spec())).toContain(
      "- Club → Book (one-to-many): A club has many books.",
    );
  });
});

describe("renderSpecMarkdown: sparse data model", () => {
  it("omits the fields line for an entity without fields and shows no relationships as None", () => {
    const markdown = renderSpecMarkdown(
      spec({
        dataModel: {
          none: false,
          entities: [{ id: "E1", name: "Note", description: "A note.", fields: [] }],
          relationships: [],
        },
      }),
    );

    expect(markdown).toContain(
      "### Entities\n\n- **Note**: A note.\n\n### Relationships\n\nNone.\n",
    );
  });
});
