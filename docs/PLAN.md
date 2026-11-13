# V0 Plan

Each phase is one session and leaves the app running with `pnpm check` green. Status: `[ ]` todo · `[~]` in progress · `[x]` done. When a phase finishes, tick its box, add the commit hash, and log new decisions in `DECISIONS.md`.

Flow being built: sign in with GitHub → chat interview → spec review/edit → approve → ticket generation → ticket review/edit → create repo + issues → dependency graph.

---

## [x] Phase 0: Scaffold and tooling (`df00f00`)

Set up the project skeleton so every later phase only adds features.

Done when:

- [x] Next.js App Router + TS strict + Tailwind app, created with pnpm, runs with `pnpm dev`, and shows a placeholder landing page
- [x] ESLint (flat config) + Prettier configured; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check` scripts exist and pass
- [x] Vitest + Testing Library + MSW wired up, with one sample component test and one sample MSW-backed test
- [x] `src/lib/env.ts` validates env with Zod; `.env.example` lists every variable; `.gitignore` excludes `.env*` except the example
- [x] Directory layout from CLAUDE.md created (empty modules where needed)
- [x] Current versions of Next.js, `@anthropic-ai/sdk`, Octokit, Zod, iron-session checked and pinned (`arctic` turned out to be deprecated on npm and was replaced by `@octokit/oauth-methods`, see DECISIONS.md)
- [x] Committed

## [x] Phase 1: Spec domain core (pure, no UI) (`14f91bb`, `4be86c2`)

Done when:

- [x] `src/lib/spec/schema.ts`: full spec Zod schema (all template fields, stable ids on list items, explicit `none` for integrations and auth), plus a `SpecDraft` (partial) schema for mid-interview state
- [x] `applySpecPatch(draft, patch)`: merges a typed patch (set field, upsert or remove a list item by id); tested, including invalid patches
- [x] `isSpecComplete(draft)` returns `{ complete: true, spec } | { complete: false, missing: string[] }`; tested per field
- [x] `renderSpecMarkdown(spec)`: deterministic SPEC.md, snapshot-tested
- [x] `renderTranscriptMarkdown(messages)` for `docs/interview.md`; tested
- [x] Committed

## [x] Phase 2: Ticket domain core (pure, no UI) (`0422fba`, `3e43648`, `8600c48`, `711d5a3`)

Done when:

- [x] `src/lib/tickets/schema.ts`: ticket schema (local id, title, description, acceptance checks, `S|M|L`, dependency ids)
- [x] `validateDag(tickets)` reports unknown references, self-references and cycles (with the cycle path); tested, including large and edge cases
- [x] `topoSort(tickets)`: stable, deterministic order; tested
- [x] Edit-proposal op schema + `applyProposalOps(tickets, acceptedOps)` that re-validates the DAG; tested
- [x] `renderIssueBody(ticket, idToIssueNumber)` / `parseIssueBody(body)` round-trip (`Depends on #N`, acceptance checklist, `<!-- keel:ticket=Tn -->` marker); tested
- [x] Committed

## [x] Phase 3: GitHub sign-in (`aeeae44`, `c41da4a`, `294f7ca`, `6d7379e`)

Done when:

- [x] OAuth App flow with `@octokit/oauth-methods`: `/api/auth/login` (crypto-random state; PKCE `S256`, which GitHub supports for OAuth Apps), `/api/auth/callback`, `/api/auth/logout`
- [x] Scope requested is exactly what DECISIONS.md says (`public_repo`)
- [x] Session in an `iron-session` cookie (httpOnly, secure, sameSite=lax) holding token + login; `getSession()` is `server-only`
- [x] Allowlist enforced (`ALLOWED_GITHUB_LOGINS`); non-allowlisted users see a friendly page, get no session, and have their grant deleted
- [x] Protected app routes redirect to sign-in; the header shows avatar, login and sign-out
- [x] Tests: callback happy path, state mismatch, allowlist rejection (GitHub mocked with MSW), and an assertion that no response body or client prop contains the token
- [x] Committed

## [x] Phase 4: Interview backend (`2524280`, `0ae4f6e`)

Done when:

- [x] `src/lib/llm/config.ts` holds models, effort and max tokens per task (`claude-sonnet-5-5` for the interview); `src/lib/llm/client.ts` is the single Anthropic client factory
- [x] Interview system prompt + `update_spec` and `finish_interview` tool definitions generated from the Zod schemas (`finish_interview` is strict; `update_spec` isn't, because the API rejected its strict grammar as too large; see DECISIONS.md)
- [x] `POST /api/interview` (auth required): validates `{ history, draft }`, streams SSE events (`text`, `specPatch`, `turn`, `complete`, `error`), and runs the tool loop server-side within one request
- [x] `finish_interview` is rejected with an error `tool_result` when `isSpecComplete` fails
- [x] Refusal, `max_tokens`, rate-limit and connection errors map to typed error events
- [x] Prompt caching set on the stable prefix (live check: 4,777 tokens written to the cache on the first call)
- [x] Tests with MSW SSE fixtures: patch applied, invalid tool input rejected, premature finish rejected, refusal path, API error path
- [x] Committed

Carried to Phase 5: a billing failure ("credit balance is too low") arrives as a 400 and currently shows the `bad_request` copy; review it with the other UI error copy.

## [x] Phase 5: Interview UI + client state (`a793070`, `3ba2b1d`, `b511185`, `cf7069b`)

Done when:

- [x] Versioned client state store (`keel:project:v1`) with a reducer, Zod-validated on load; corrupt state shows an export-and-reset prompt
- [x] Chat screen: user describes the idea; streamed assistant replies; live spec panel showing filled and missing fields and open questions
- [x] A refresh mid-interview restores the conversation and draft
- [x] When the interview completes, the UI moves to spec review
- [x] Error states shown with retry
- [x] Component tests for the chat and spec panel; reducer tests
- [x] Manual check: one real interview run against the live API (owner ran a full interview to the review screen, including a refresh mid-reply; everything worked)
- [x] Committed

Carried from Phase 4 and done: the billing failure now has its own `billing` copy.

Carried to Phase 12: the UI works but looks rough. Give every screen a visual design pass alongside the empty, loading and error state review.

## [x] Phase 6: Spec review, edit and approve (`4eb35cd`, `5d0380f`)

Split into 6a and 6b on one branch (Rule 3: ~1,700 and ~930 inserted lines, tests included; the owner chose a single PR).

Done when:

- [x] Structured form editor for every spec field (add, edit and remove features, acceptance checks, entities, relationships, integrations, etc.)
- [x] Live validation; Approve is disabled until `isSpecComplete` passes
- [x] Markdown preview using `renderSpecMarkdown`
- [x] "Back to interview" sends an append-only message describing the edits
- [x] Editing an approved spec reopens review and needs re-approval; the last approval is kept as `approved`. The visible "tickets are stale" part moved to Phase 7, since no tickets exist yet
- [x] Component tests for editing, validation and the approve gate
- [x] Manual check: owner ran an interview through review, editing and approval against the live API (6a)
- [x] Committed

Carried to Phase 12: the chat shows the model's Markdown raw (e.g. `**Name:**`); render it, or tell the model to write plain text.

## [ ] Phase 7: Ticket generation

Done when:

- [ ] `POST /api/tickets/generate` (auth required): Opus via structured outputs on a streamed request; progress events over SSE
- [ ] Output Zod-parsed + `validateDag`; on failure, one repair retry with the errors, then a clear error
- [ ] Prompt encodes the ticket rules (one user-visible behavior, ~3–8 files, 200–500 line diff, S/M/L, plain-English acceptance checks)
- [ ] Generated tickets saved to client state; the UI moves to the ticket list
- [ ] Tickets record the approved spec they came from; when `approved` differs, they show as stale with a "Regenerate" offer (moved from Phase 6)
- [ ] Tests: valid generation, cyclic output → repair → success, repair fails → error, refusal
- [ ] Committed

## [ ] Phase 8: Ticket review and edit

Done when:

- [ ] Ticket list in topological order: view, add, edit (all fields, dependency picker) and delete
- [ ] DAG validation runs after every edit; errors appear inline on the affected tickets
- [ ] Edited tickets are tracked as "unchecked"; Create is blocked while the DAG is invalid or edits are unchecked (impact check arrives in Phase 9)
- [ ] Component + reducer tests for edit flows and validation display
- [ ] Committed

> If Phases 8 and 9 together look small after Phase 7, they may merge. Propose it at the start of Phase 8.

## [ ] Phase 9: Edit-impact proposals

Done when:

- [ ] `POST /api/tickets/impact`: sends the spec, the current tickets and a summary of the edits; Opus returns typed proposal ops with reasons
- [ ] Proposal review UI: accept or reject each op; the resulting DAG is previewed and validated before applying
- [ ] Applying clears the "unchecked" state; "No changes needed" is a valid outcome
- [ ] Nothing changes without explicit acceptance (tested)
- [ ] Tests: proposal parse, apply subset, invalid combination blocked, API error
- [ ] Committed

## [ ] Phase 10: Create repo, commit and issues (resumable)

Done when:

- [ ] Repo name step with an availability check and a suggested alternative
- [ ] `POST /api/github/create` streams per-step progress: create repo → single commit (SPEC.md, docs/interview.md, README.md) → labels → issues in topological order with real `Depends on #N`
- [ ] Creation log persisted client-side after each step; reconcile-by-marker makes retries idempotent
- [ ] Failure at any step shows exactly what was created and offers Resume; resume never duplicates issues (tested)
- [ ] Tests (GitHub mocked): happy path, failure mid-issues then resume, label already exists, name collision
- [ ] Manual check: one real run into a throwaway repo
- [ ] Committed

## [ ] Phase 11: Dependency graph view

Done when:

- [ ] `GET /api/github/graph?repo=owner/name` fetches issues and builds nodes and edges from `parseIssueBody`
- [ ] React Flow + dagre top-to-bottom layout; nodes show number, title and size, and link to the issue
- [ ] Shown automatically after creation and reachable later by repo URL; links to the repo and its issues list
- [ ] Handles issues edited on GitHub (unknown `#N`, removed dependencies) gracefully
- [ ] Tests: graph building from fixtures, layout is deterministic, component renders
- [ ] Committed

## [ ] Phase 12: End-to-end smoke + polish

Done when:

- [ ] `KEEL_FAKE_EXTERNALS=1` mode with in-process fakes, refused in production
- [ ] Playwright smoke test covers sign in → interview → approve → tickets → create → graph
- [ ] Empty, loading and error states reviewed on every screen, plus a visual design pass (carried from Phase 5)
- [ ] README: what Keel is, screenshots, setup (OAuth App, env), architecture sketch
- [ ] Deployed to Vercel with production env; one real end-to-end run
- [ ] Committed
