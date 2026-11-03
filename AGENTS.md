# ANSER-v2 — instructions for AI coding agents

Read by Codex and other agents directly, by Claude Code through `CLAUDE.md`, and by GitHub
Copilot as the copy in `.github/copilot-instructions.md` — after editing this file, re-copy it
there. Keep it short and current; details belong in `docs/`, linked below.

## What this is

Inventory, sales and accounting-support web app for **Hoàng Phát**, a Vietnamese oil/lubricant
distributor that keeps its books in MISA. One Next.js 16 app in `frontend/` serves both the UI and
the `/api/*` backend, on **Neon Postgres** through **Drizzle ORM**. **n8n** runs scheduled
reports and alerts. AI features call a separate Python service, the **Brain** (team repo
`PCBoiz/ANSER_AI`), over HTTP from `frontend/src/server/brain.ts`. UI text and user-facing errors
are Vietnamese.

## Read before changing things

| Need | Read |
|---|---|
| Setup, layering, recipes, never-do list | `docs/onboarding/Onboarding_Playbook.md` (§3, §5, §8) |
| File-by-file map, request flows, known limitations | `docs/architecture/ARCHITECTURE.md` |
| Why each table/column exists | comments in `frontend/src/server/db/schema.ts` (ground truth) and `docs/decisions/` 0–5 |
| Open questions waiting on the client or another team | `docs/tasks/BLOCKERS.md` |
| Who owns which task right now | the task board in `docs/tasks/` (newest version may be on branch `docs/backend-task-board`) |
| Commit and branch rules | `docs/standards/Git_Conventions.md` (if present) and §5.4 of the onboarding playbook |

## Layout

```text
frontend/
  src/app/dashboard/**   pages (client components fetch /api; a few server components read the DB)
  src/app/api/**/route.ts  route handlers — HTTP only
  src/server/store/*.ts  business rules + DB access, no HTTP
  src/server/db/         schema.ts, client.ts, migrations/ (generated — never edit by hand)
  src/server/import/     MISA Excel import (doc-excel.ts parses, ap-dung.ts plans/applies)
  src/server/brain.ts    Brain AI client;  n8n.ts / n8nApi.ts  n8n webhooks + REST
  src/test/db.ts         in-process Postgres (PGlite) for tests
  n8n-workflows/         importable n8n workflows
docs/                    all documentation
```

## Commands — run from `frontend/`

```bash
pnpm install                 # use `corepack pnpm@11.2.2 …` if pnpm is not on PATH
pnpm dev                     # needs frontend/.env.local — copy frontend/.env.example
pnpm lint && pnpm format:check && npx tsc --noEmit
pnpm test                    # Vitest; pnpm test:coverage enforces the floor in vitest.config.mts
pnpm build
pnpm db:generate             # only after announcing it to the team — see "Coordination"
pnpm db:migrate              # never against the Neon `production` branch
```

CI (`.github/workflows/ci.yml`) runs lockfile checks, ESLint + Prettier, migrations from scratch on
Postgres 17 + `pnpm build`, and tests with coverage. Keep all of it green.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

Next.js 16 has breaking changes — APIs, conventions, and file structure may all differ from your
training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing
code that uses a Next.js API. Heed deprecation notices. Known traps here: request interception is
`src/proxy.ts` (not `middleware.ts`); route `params` is a `Promise`.
<!-- END:nextjs-agent-rules -->

## Architecture rules

- Four layers: page → API route → store → schema. Routes parse and validate input, check login
  (`getSessionUser()` → 401) and role (→ 403), and map **named** store errors to 400/404/409.
  Stores hold the rules and the SQL and never import HTTP types.
- Every new route checks login, even though many old ones don't yet (`ARCHITECTURE.md` §7).
- Errors returned to users: `{ message: "<Vietnamese text>" }`.
- Server components under `/dashboard` that read the DB render per request
  (`dynamic = "force-dynamic"` in `src/app/dashboard/layout.tsx`); never let them prerender data.

## Data invariants — each of these has already caused a real bug

1. `inventory_transactions.quantity` is **signed** (import `+`, export `-`), and `products.stock`
   must always equal `SUM(quantity)`. Use one signed `delta` for both writes.
2. **NULL ≠ 0.** Unknown cost, VAT flag or debt stays `NULL`; never `?? 0`.
3. `unit_cost` is always the cost price, also on export rows — never the selling price.
4. Never cast `numeric` to an integer (stock is `numeric(14,3)`; oil sells by the litre).
5. Multi-table writes go in `db.transaction`; read-check-write reads inside it with
   `.for("update")` (pattern: `createInvoice()` in `store/sales.ts`).
6. Invoice lines snapshot name, price and cost; never recompute old invoices from `products`.
7. An absent Excel column is "no information", not "set to empty/zero".
8. AI never computes money figures — deterministic code here does. Never sell at 0₫ silently.

## Testing

- Tests sit next to the code as `*.test.ts`. Store tests use the real-Postgres PGlite helper:
  `vi.mock("@/server/db/client", () => import("@/test/db"))` + `beforeEach(resetDb)` — see
  `src/server/store/customers.test.ts`. Mock `fetch` for Brain/n8n; never hit the network.
- A bug you find but don't fix in the same change goes in as `it.todo("BUG: …")`, never as a test
  that asserts the wrong behaviour.
- Tests must pass in any timezone (CI is UTC, developers are UTC+7).

## Git and coordination

- Never commit to `master`; branch, then PR. Conventional Commits (`feat|fix|docs|refactor|test|
  chore|build|ci|perf(scope): imperative summary`), one change per commit, `git add <files>` —
  never `git add .`.
- Only `frontend/pnpm-lock.yaml` may be committed; CI rejects other lockfiles.
- **One migration at a time**: two branches generating `00NN_*.sql` corrupt
  `migrations/meta/_journal.json`. Announce before `pnpm db:generate`, read the generated SQL
  line by line (drizzle-kit has dropped CHECK constraints before), never edit an applied migration.
- Files a teammate is rewriting right now are listed in `frontend/.prettierignore` (temporary
  block). Don't refactor or reformat them without asking.
- `frontend/src/server/brain.ts` belongs to the Brain team's open PR #3; don't commit
  line-ending-only changes to it (`BLOCKERS.md` K1).
- Never commit secrets (`.env.local`, tokens); `ENABLE_STARTUP_SEED` stays off in production.
