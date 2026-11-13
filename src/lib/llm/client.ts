import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "@/lib/env";

/**
 * The single Anthropic client factory. V0 uses the owner's key from env; per-user keys would be
 * added here. SDK retries (429, 5xx, connection errors) stay on at their default of 2.
 */
export function createAnthropicClient(env: Pick<Env, "ANTHROPIC_API_KEY">): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}
