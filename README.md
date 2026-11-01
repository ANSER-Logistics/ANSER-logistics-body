# ANSER Web v2

Independent web product — not part of the ANSER Flask codebase (`ban-le` / `gateway` / `san-xuat`).
Single Next.js app: pages + API routes (Route Handlers) in one project.

## Structure

```
ANSER-web-v2/
└── frontend/   Next.js (TypeScript, App Router, Tailwind) — UI + /api/* backend
```

## Run locally

```bash
cd frontend
npm install
npm run dev         # http://localhost:3000 (UI + API on the same origin)
```

Copy `frontend/.env.local.example` to `frontend/.env.local` and set `JWT_SECRET`.

## Package managers and the lockfile

**Use whatever you like** — npm, pnpm, yarn, bun. Nothing in the repo forces a
choice: there is no `packageManager` field and no `preinstall` guard.

**But the repo keeps exactly one lockfile: `frontend/pnpm-lock.yaml`.** Other
lockfiles are gitignored and CI rejects them if they slip in. Two lockfiles for
two managers resolve to two different dependency trees with nothing to warn you,
and Next.js reads lockfiles to infer the workspace root — extra ones make it
guess the wrong scope for build-time file tracing.

One rule this puts on everyone: **if you change a dependency, run `pnpm install`
once and commit the refreshed `frontend/pnpm-lock.yaml` alongside your
`package.json` change.** Adding a package with `npm i` updates `package.json` but
not the pnpm lockfile, and CI's `pnpm install --frozen-lockfile` will go red.
That red is correct, not a CI bug.

**Switching manager in an existing checkout: delete `node_modules` first.** pnpm
builds a symlinked, non-flat `node_modules`; npm walks into it and crashes with
`Cannot read properties of null (reading 'matches')`. `rm -rf node_modules` then
install again. Anything else that follows from your choice of manager is yours to
sort out.

## Notes

- The Flask apps (`ban-le`, `gateway`, `san-xuat` in `ANSER_ban-le_gateway/`) are a separate,
  unrelated codebase — this project only borrows product ideas/data model concepts from ANSER,
  it does not call into or depend on their code.
- User data is currently stored in-memory (`frontend/src/lib/store/users.ts`) — resets on
  every server restart. Will move to Neon Postgres later; the store's exported functions are
  written so only that one file needs to change.
