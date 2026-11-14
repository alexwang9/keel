import { http, type RequestHandler } from "msw";
import { FINISH_INTERVIEW, UPDATE_SPEC } from "@/lib/llm/interview/tool-names";
import type { SpecOp } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets } from "@/test/fixtures/tickets";
import {
  reply,
  textBlock,
  toResponse,
  toolUseBlock,
  type FixtureReply,
} from "@/test/msw/anthropic";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** The fakes always answer; they never stall. */
type FakeReply = Exclude<FixtureReply, { kind: "stall" }>;

interface MessageParam {
  role: "user" | "assistant";
  content: string | { type: string }[];
}

interface MessagesBody {
  messages?: MessageParam[];
  tools?: { name: string }[];
  output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } };
}

const hasBlock = (message: MessageParam | undefined, type: string): boolean =>
  Array.isArray(message?.content) && message.content.some((block) => block.type === type);

const isUserText = (message: MessageParam): boolean =>
  message.role === "user" && (typeof message.content === "string" || hasBlock(message, "text"));

/** The first answer fills who and what; the second fills the rest. */
const FIRST_OPS: SpecOp[] = [
  { op: "set", field: "name", value: completeDraft.name },
  { op: "set", field: "problem", value: completeDraft.problem },
  { op: "set", field: "goal", value: completeDraft.goal },
  { op: "set", field: "targetUsers", value: completeDraft.targetUsers },
  { op: "set", field: "projectType", value: completeDraft.projectType },
  ...completeDraft.features.map((item): SpecOp => ({ op: "upsert", list: "features", item })),
];

const SECOND_OPS: SpecOp[] = [
  { op: "set", field: "outOfScope", value: completeDraft.outOfScope },
  { op: "set", field: "dataModel", value: completeDraft.dataModel },
  { op: "set", field: "integrations", value: completeDraft.integrations },
  { op: "set", field: "auth", value: completeDraft.auth },
  { op: "set", field: "deploymentTarget", value: completeDraft.deploymentTarget },
  { op: "set", field: "constraints", value: completeDraft.constraints },
];

const update = (id: string, ops: SpecOp[]) => toolUseBlock(id, UPDATE_SPEC, { ops });
const finish = (id: string) => toolUseBlock(id, FINISH_INTERVIEW, {});

/**
 * A scripted interview, chosen from the history alone so it needs no state: the first answer
 * fills half the spec, the second fills the rest and finishes. Later answers (after "Back to
 * interview") just finish, so they never overwrite the user's edits. After a tool result, the
 * model asks its question.
 */
function interviewReply(messages: MessageParam[]): FakeReply {
  if (hasBlock(messages.at(-1), "tool_result")) {
    return reply([
      textBlock("Thanks. What's out of scope, and where should it run? Any data or sign-in needs?"),
    ]);
  }
  const answers = messages.filter(isUserText).length;
  if (answers <= 1) return reply([update("toolu_fake_1", FIRST_OPS)], "tool_use");
  const done = textBlock("That covers everything. Review the spec on the right and approve it.");
  if (answers === 2) {
    return reply([done, update("toolu_fake_2", SECOND_OPS), finish("toolu_fake_3")], "tool_use");
  }
  return reply([done, finish(`toolu_fake_${String(answers + 1)}`)], "tool_use");
}

const json = (value: unknown): FakeReply => reply([textBlock(JSON.stringify(value))]);

/**
 * Answers the Messages API as each Keel task expects. The task is told apart by its request:
 * the interview sends its tools, and the structured tasks name their top-level output key.
 * Impact checks always answer "no changes needed", which is valid for any valid ticket list.
 */
export function respondToMessages(body: MessagesBody): FakeReply {
  if (body.tools?.some((tool) => tool.name === UPDATE_SPEC)) {
    return interviewReply(body.messages ?? []);
  }
  const output = body.output_config?.format?.schema?.properties ?? {};
  if ("tickets" in output) return json({ tickets: shelfTickets });
  if ("ops" in output) return json({ ops: [] });
  return { kind: "httpError", status: 400, errorType: "invalid_request_error" };
}

export const fakeAnthropic: RequestHandler = http.post(MESSAGES_URL, async ({ request }) => {
  return toResponse(respondToMessages((await request.json()) as MessagesBody));
});
