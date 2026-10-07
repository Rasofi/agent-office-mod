# CLAUDE.md

Claude Code mod `agent-office` (plugin manifest `.claude-plugin/plugin.json`, marketplace `rasofi-mods` in `.claude-plugin/marketplace.json`). Read `context.md` first.

## Commands

| What | Command |
| --- | --- |
| Validate | `claude plugin validate --strict .` |
| Test | `claude plugin test .` |
| Try it | `claude --plugin-dir .` |

## Rules

- The repo may go public: no private hostnames, IPs, tokens or homelab details.
- Bump `version` in `plugin.json` on every release, or installed copies never update.
- Never rename the plugin (`agent-office`); installs are keyed by name.
- Tests answer engine calls with `on('<call>', () => ({ value }))`.
