# Keel

Web app: a GitHub user describes software they want to build → an LLM interviews them into a typed spec → the user edits and approves it → an LLM breaks it into tickets with dependencies → the user edits them → Keel creates a GitHub repo with SPEC.md and the tickets as Issues, then shows a dependency graph.

- Plan: `docs/PLAN.md` (phases, done-when checklists, status)
- Decisions: `docs/DECISIONS.md` (every decision and why; add new ones there, don't redecide old ones silently)

## Stack

Next.js (App Router) · TypeScript strict · Zod · `@anthropic-ai/sdk` · Octokit · `arctic` (GitHub OAuth) + `iron-session` (encrypted cookie) · Tailwind · `@xyflow/react` + `@dagrejs/dagre` · Vitest + Testing Library + MSW · Playwright (one smoke test) · pnpm · Node 26 LTS

No database. Pre-creation state lives in the browser (localStorage); after creation, GitHub is the source of truth.

## Commands

```bash
pnpm dev          # local dev server (needs .env.local, see .env.example)
pnpm test         # vitest run (unit + integration, all external APIs mocked)
pnpm test:watch   # vitest watch
pnpm test:e2e     # playwright smoke test (runs against KEEL_FAKE_EXTERNALS=1)
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm check        # lint + typecheck + test; must pass before every commit
```

## Layout (target)

```
src/app/            routes + route handlers (thin: validate input, call lib, shape response)
src/lib/spec/       spec schema, completeness check, SPEC.md renderer
src/lib/tickets/    ticket schema, DAG validation, topo sort, edit-proposal application
src/lib/llm/        Anthropic client, model config, prompts, tool definitions
src/lib/github/     Octokit wrappers: repo, commit, labels, issues, resume/reconcile
src/lib/auth/       OAuth flow, session, allowlist
src/components/     UI
src/test/           MSW handlers, fixtures, test utilities
```

## Conventions

- Zod schemas in `src/lib/**/schema.ts` are the single source of truth for types (`z.infer`). Validate at every boundary: request bodies, LLM tool inputs, GitHub responses we depend on, localStorage reads.
- Domain logic is pure functions in `src/lib`; React components and route handlers stay thin.
- Model IDs, effort levels and token limits live only in `src/lib/llm/config.ts`. Never inline a model ID.
- Server-only modules import `server-only`. The GitHub token never leaves the server: no token in props, responses, logs or client bundles.
- Errors: typed result objects (`{ ok: true, value } | { ok: false, error }`) from lib functions; friendly messages in the UI, details in server logs. Never swallow errors.
- Files ~200–400 lines, functions < 50 lines, nesting < 4 levels. Prefer early returns.
- No secrets in code. Config via env, validated once at startup in `src/lib/env.ts`.
- Conventional commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`).

## Working rules

1. **One phase per session.** At the start, read `docs/PLAN.md` and `docs/DECISIONS.md`, then propose a plan for the phase and wait for approval before writing code.
2. **Tests alongside code.** Every lib function and route handler gets tests in the same change. Mock GitHub and Anthropic at the HTTP layer with MSW; tests never hit real APIs.
3. **Reviewable diffs.** If a phase grows past roughly 800 changed lines or drifts beyond its checklist, stop and propose a split.
4. **End of phase:** `pnpm check` passes, then commit, mark the phase done in `docs/PLAN.md`, and log any new decisions in `docs/DECISIONS.md`.
5. **Ask, don't guess,** on anything expensive to change later: schemas, OAuth scopes, the persisted state shape, the issue body format, new dependencies, anything that touches the user's GitHub account.
6. **Out of scope for V0:** running Claude on tickets, GitHub Actions, a custom kanban board, starter templates, per-ticket model routing, users' own API keys. Leave seams for them; don't build them.
