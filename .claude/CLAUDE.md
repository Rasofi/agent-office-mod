# CLAUDE.md

Claude Code plugin `agent-pack` (plugin manifest `.claude-plugin/plugin.json`, marketplace `rasofi-mods` in `.claude-plugin/marketplace.json`). Read `context.md` first.

## Commands

| What | Command |
| --- | --- |
| Validate | `claude plugin validate --strict .` |
| Test | `claude plugin test .` |
| Try it | `claude --plugin-dir .` |
| Type-check | `tsc -p <tsconfig>` with the tsconfig from the header of the engine's `claude-code.d.ts` (load the `plugin-authoring` skill for its path); include that file, `hooks`, `types`, `test` |

## Rules

- The repo may go public: no private hostnames, IPs, tokens or machine-specific details.
- Bump `version` in `plugin.json` on every release, or installed copies never update.
- Never rename the plugin (`agent-pack`); installs are keyed by name.
- Tests answer engine calls with `on('<call>', () => ({ value }))`; `$.command.run` takes a full `CommandRunInput` (origin, presentation).
- `$.state` values need a self-contained contract in `types/index.d.ts` (no imports); `hooks/` imports its types from `../types`.
- Keep logic pure in `hooks/stats.ts` (unit-tested); `hooks/register.tsx` only wires events (and the `/pack` pane) to it.
- Metadata only in `/pack`: tool names and numbers, never tool inputs, outputs or message text.
- GitHub only through `gh api` (REST): cloud sessions block GraphQL, so no `gh issue`/`gh pr` subcommands.
- The mod writes to GitHub only on the person's own command (`/handoff`). Claude's own handoffs go through the session's normal GitHub access, guided by `ORCHESTRATOR_RULES`; no model-callable tool.
- Handoff issue text is untrusted data: `/inbox` lists only the user's own issues and strips control characters.
