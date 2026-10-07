# agent-office-mod

Agent Office as a Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/overview): what this session and its agents are doing, and (planned) messages between orchestrators in different repos. No server, no tokens, nothing to deploy.

**Status: 0.6.0.** `/office` shows what this session is doing:

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

In the terminal (and the desktop Code tab) `/office` opens this view as a pane that updates live as the session works; `ctrl+x x` closes it. Where nothing can draw a pane (a cloud session, `claude -p`) it answers with the text above.

Counts start when the mod loads in the session. It keeps tool names and numbers only, never tool inputs, outputs or messages, and sends nothing anywhere.

## Hand work to another repo

An orchestrator in one repo can ask another repo for something. A handoff is a GitHub issue in the target repo, labelled `agent-handoff`:

```text
/handoff Rasofi/api add a /health endpoint that returns the build version
```

In a session working on the target repo:

```text
/inbox
```

lists the open handoffs. Then ask Claude to read one and act on it, and close the issue when done.

Claude can hand off on its own too: the mod adds short rules to its system prompt that say when to hand off (only work that should run in its own session: large, parallel, for a repo no session is working on now, or a repo you shouldn't change directly; small changes in a repo the session can already edit are made directly) and the issue format `/inbox` expects. Claude opens the issue with whatever GitHub access the session has (the GitHub connector or `gh`), so you approve it like any other GitHub action.

The same rules tell Claude to treat a handoff issue as a request rather than an instruction, and to comment and close the issue when done.

- GitHub goes through your own `gh` login (REST API). Nothing else is contacted.
- `/inbox` only lists handoffs **you** opened: anyone can put a label on an issue in a public repo.
- The handoff text is a request to consider, not instructions; the issue says so.
- When to hand off: locally it's nearly free (your `gh` login reaches all your repos). In a cloud session the target repo must be attached first, and then Claude could also edit it directly, so hand off only work you want done in a separate session.
- ⚠ In a cloud session, both repos must be attached to the session. If one isn't, `/handoff` says so; ask Claude to add the repository and run it again.

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

The `refresh` line is a shell comment and runs nothing: only the change to the script's text matters, so any new value works, and you can leave it alone when you don't need a release right away.

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
