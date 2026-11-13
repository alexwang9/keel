import { describe, expect, it } from "vitest";
import { MAX_TICKET_BODY_BYTES, parseTicketRequest } from "@/lib/llm/tickets/request";
import { SpecSchema } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

const spec = SpecSchema.parse(completeDraft);

describe("parseTicketRequest", () => {
  it("accepts a complete spec, with or without a repair", () => {
    expect(parseTicketRequest(JSON.stringify({ spec }))).toEqual({ ok: true, value: { spec } });
    const repair = { output: "{}", errors: ["tickets is required"] };
    expect(parseTicketRequest(JSON.stringify({ spec, repair }))).toEqual({
      ok: true,
      value: { spec, repair },
    });
  });

  it("rejects an incomplete spec", () => {
    const result = parseTicketRequest(JSON.stringify({ spec: { ...completeDraft, features: [] } }));
    expect(result).toMatchObject({ ok: false, error: { status: 400 } });
    expect(!result.ok && result.error.errors.join("\n")).toMatch(/features/);
  });

  it("rejects a repair without errors", () => {
    const result = parseTicketRequest(
      JSON.stringify({ spec, repair: { output: "{}", errors: [] } }),
    );
    expect(!result.ok && result.error.errors[0]).toMatch(/^repair\.errors/);
  });

  it("rejects a body over the size limit", () => {
    const body = JSON.stringify({ spec, padding: "x".repeat(MAX_TICKET_BODY_BYTES) });
    expect(parseTicketRequest(body)).toMatchObject({ ok: false, error: { status: 413 } });
  });
});
