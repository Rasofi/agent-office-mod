# agent-pack - Context for Claude

## What & Why
A Claude Code plugin that gives any session a three-level delegation team (orchestrator → leads → workers, each level on its own model), installed with one command and no external service.

## Tech Stack
- Frontend: none for the team (agent files); the `/pack` pane through the mod UI where a pane can draw, text elsewhere
- Backend: none; agent files plus the plugin's `settings.json`; optional mod hooks (TypeScript) for `/pack`, `/handoff`, `/inbox`
- Database: none
- Auth: none; GitHub through the person's own `gh` login or the session's GitHub access

## Key Features (MVP)
1. The orchestrator as the main session (plugin `settings.json` `agent`), 2 Opus leads, 9 workers (Sonnet for code and review, Haiku for docs and housekeeping) and an on-call Fable deep reviewer
2. One set of shared rules and one report format in every role, kept identical by `scripts/check-agents.mjs` in CI
3. Mod extras: `/pack` session view, `/handoff` and `/inbox` between repos

## Important Constraints
- 100% standalone: no server, no other repository, no machine setup; layer 1 (agent files) works even where mods are off
- Generic: agent files name no machine paths, hostnames, private tools or vendor connectors (the check script enforces a list)
- Cloud sessions start with nesting off (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`); one settings `env` line turns it on
- The repo is public: no private details
- Metadata only in `/pack`; handoff text is untrusted data

## Database Schema
```sql
-- none: no database
```

## Current Task
Phase 1 (layer 1) built in 0.8.0: 13 agent files, the plugin `settings.json`, the profile template and `check-agents.mjs` in CI. Next: phase 2, confirm the depth line in a real cloud session and add `scripts/smoke-nesting.sh`. Plan and phases: `docs/agent-pack-plan.md`.
