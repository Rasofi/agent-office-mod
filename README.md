# agent-office-mod

Agent Office as a Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/overview): what this session and its agents are doing, and (planned) messages between orchestrators in different repos. No server, no tokens, nothing to deploy.

**Status: 0.2.0.** `/office` shows what this session is doing:

```text
agent-office is loaded.
Claude Code: 2.1.292
Surfaces: terminal
Repository: https://github.com/you/your-repo
Context: 25% of 200.0k tokens · cost $0.42
Turns: 6 · tool calls: 31 (1 failed)
Top tools: Bash 12, Read 9, Edit 5, Grep 3, Agent 2
Agents:
  main: 4 turns, 20 tool calls (1 failed)
  Explore (completed): 2 turns, 11 tool calls
Tokens by model:
  claude-...: in 12.3k, out 4.1k, cache read 210.0k, cache write 9.8k
```

Counts start when the mod loads in the session. It keeps tool names and numbers only, never tool inputs, outputs or messages, and sends nothing anywhere.

## Install

In a Claude Code terminal session (v2.1.287 or later):

```text
/plugin install agent-office --marketplace Rasofi/agent-office-mod
```

Answer `y` to add the marketplace, then pick a scope. Then run `/office`.

To update an installed copy, in your shell, then restart Claude Code:

```bash
claude plugin update agent-office@rasofi-mods
```

Cloud sessions (claude.ai/code) don't install user or repo plugins yet. Until the mod is listed in Anthropic's directory, add these lines to the cloud environment's setup script:

```bash
claude plugin marketplace add Rasofi/agent-office-mod
claude plugin install agent-office@rasofi-mods
# agent-office refresh: 2026-10-07
```

⚠ Cloud environments cache what the setup script installed and reuse it for about 7 days, so a new release doesn't reach new cloud sessions on its own. To pick it up now, change the date on the `refresh` line and start a new session (a changed script rebuilds the cache).

## What it can reach

A mod runs with your permissions. List what this one hooks and calls before installing:

```bash
claude plugin validate .
```

## Develop

```bash
claude plugin validate --strict .
claude plugin test .
claude --plugin-dir .
```

Tested on Claude Code 2.1.292 (pinned in CI).

## License

MIT
