# agent-office-mod

Agent Office as a Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/overview): what this session and its agents are doing, and (planned) messages between orchestrators in different repos. No server, no tokens, nothing to deploy.

**Status: 0.1.0 spike.** Only `/office` exists; it reports the Claude Code version, the surfaces drawing the session and the repository.

## Install

In a Claude Code terminal session (v2.1.287 or later):

```text
/plugin install agent-office --marketplace Rasofi/agent-office-mod
```

Answer `y` to add the marketplace, then pick a scope. Then run `/office`.

Cloud sessions (claude.ai/code) don't install user or repo plugins yet. Until the mod is listed in Anthropic's directory, add these lines to the cloud environment's setup script:

```bash
claude plugin marketplace add Rasofi/agent-office-mod
claude plugin install agent-office@rasofi-mods
```

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
