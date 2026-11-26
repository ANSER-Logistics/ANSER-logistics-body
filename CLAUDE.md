@AGENTS.md

## Claude Code specifics

- `AGENTS.md` above is the single source of project instructions — edit it there, not here, so
  Codex and Claude stay in sync, then re-copy it to `.github/copilot-instructions.md` for
  Copilot. Keep this file for Claude-only notes.
- Personal skills, hooks and settings go in `.claude/skills/`, `.claude/hooks/` and
  `.claude/settings.local.json`; all three are gitignored. Promote something to a shared
  `.claude/settings.json` only after the team agrees.
- Session notes and investigation logs belong in `docs/` (see
  `docs/decisions/5. Database_Session_Log.md`), never in this file: everything here is loaded
  into every session as instructions.
