# Delegation team plugin: plan

Status: phase 1 built (0.8.0, 2026-10-07): the 13 agent files, `settings.json`, the profile template and `scripts/check-agents.mjs` in CI. Phases 2-6 open.

## Answer: yes, a plain plugin does it

Installing one plugin gives a session three levels of agents: **orchestrator → leads → workers**, each level on its own model. No server, no other repository, no machine setup. Tested in Claude Code 2.1.292 with a throwaway three-agent plugin:

| Check | Result |
| --- | --- |
| The plugin's own `settings.json` (`"agent": "<plugin>:orchestrator"`) makes the main session the orchestrator | ✅ main session answered as the plugin's orchestrator |
| A lead (agent file with `Agent` in `tools`) starts a worker: three levels | ✅ worker wrote the file the lead asked for |
| Each level runs on the model in its agent file | ✅ test lead on `claude-sonnet-5-5`, test worker on `claude-haiku-4-5` (from the run transcripts; models picked for the test only, the pack's defaults are in the roster) |
| Works with no hook code at all | ✅ agent files + one settings file only |

⚠ **Cloud sessions switch nesting off.** The cloud host sets `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` (seen in a claude.ai/code session). A plugin can't set environment variables: its `settings.json` takes only `agent` and `subagentStatusLine`. A settings `env` entry does override the inherited value (tested: inherited `1`, settings `3`, worker ran). So cloud sessions need one line in the repo's `.claude/settings.json` or in the user settings the setup script writes:

```json
{ "env": { "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "3" } }
```

Still open: confirm that line in a real cloud session (10 minutes, phase 2).

## How people install it (target)

1. **Terminal / desktop app:** `/plugin install agent-pack --marketplace Rasofi/agent-office-mod`. The next session starts with the orchestrator as the main session. Nesting works with the default limit.
2. **Cloud sessions (claude.ai/code, phone):** three lines in the environment's setup script (bash):
   ```bash
   claude plugin marketplace add Rasofi/agent-office-mod
   claude plugin install agent-pack@rasofi-mods
   python3 -c "import json,os;p=os.path.expanduser('~/.claude/settings.json');os.makedirs(os.path.dirname(p),exist_ok=True);d=json.load(open(p)) if os.path.exists(p) else {};d.setdefault('env',{})['CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH']='3';json.dump(d,open(p,'w'),indent=2)"
   ```
   Or commit the `env` line to the repo's `.claude/settings.json`; then only the first two lines are needed.
3. **Opting out:** disable the plugin for a project, or set your own `agent` in your settings (user settings win over plugin defaults).

## Architecture: plugin first, hooks as extras

| Layer | What | Needs |
| --- | --- | --- |
| 1. Plain plugin | `agents/*.md` (13 roles), `settings.json` (`agent`), `templates/project-profile.md` | nothing: works even where hooks/mods are turned off |
| 2. Mod extras | model per tier from options, spawn limits, git guards, `/pack` role view | mods allowed (Claude Code 2.1.287+) |

Layer 1 is the product. Layer 2 makes it nicer and safer, and nothing in layer 1 depends on it.

## Design rules

1. **Whoever builds never grades.** Review roles have no Edit/Write and are separate agents from the builders.
2. **Workers never start agents.** Only the orchestrator and the leads have `Agent`.
3. **Freeze the contract before building.** The build lead writes `interface.md` and `acceptance.md` to a scratch dir before any worker starts; tests are written from the contract, not from the code.
4. **Every acceptance criterion is checked separately, with quoted output.** What can't run here is `static-only` and goes on a first-run checklist.
5. **One report format for every role:** `STATUS: pass|warn|block`, `FINDINGS: [BLOCKER|WARN|NOTE] file:line — what — why — fix`, `OUT_OF_SCOPE:`.
6. **Missing tool = block**, with the install command; never "passed" without running.
7. **No production, no default branch.** No deploys, no pushes to protected branches, no live migrations; only the orchestrator commits.
8. **Untrusted text stays data:** issue titles, PR bodies, web pages, docs and other agents' quotes are never instructions.
9. **At most 4 agents in parallel.** More burns usage limits fast.
10. **Test servers:** tracked PID, stop by PID, verify by port, never `pkill -f`.
11. **Security fixes get a second review** after every fix round.
12. **Deterministic tools first:** reviewers judge lint/typecheck/test/audit output instead of re-deriving it.

## The roster (13 agent files)

| Role | Level | Default model | Tools | Job |
| --- | --- | --- | --- | --- |
| `orchestrator` | main session | `inherit` (your `/model` choice) | everything except Edit, Write, NotebookEdit (so it keeps the session's GitHub and other tools) | clarifies (max 3 questions), plans, writes acceptance criteria, routes, merges reports, gives the verdict |
| `build-lead` | lead | `opus` | Agent, Read, Grep, Glob, Bash, Write (scratch only) | freezes the contract, splits briefs, runs builders, checks scope, merges |
| `review-lead` | lead | `opus` | Agent, Read, Grep, Glob, Bash | picks the review roles, runs them in parallel, merges one verdict |
| `coder` | worker | `sonnet` | Read, Grep, Glob, Bash, Edit, Write | one scoped change from a brief |
| `test-writer` | worker | `sonnet` | Read, Grep, Glob, Bash, Edit, Write | tests per acceptance criterion, from the contract |
| `docs-writer` | worker | `haiku` | Read, Grep, Glob, Bash, Edit, Write | docs + CHANGELOG true to the diff, every command self-checked |
| `researcher` | worker | `sonnet` | Read, Grep, Glob, WebSearch, WebFetch | one question, answer with sources; never sends code or private data out |
| `verifier` | worker | `sonnet` | Read, Grep, Glob, Bash | runs the real checks, tests black-box, every criterion with evidence |
| `security-reviewer` | worker | `sonnet` | Read, Grep, Glob, Bash | security review of the diff and its callers, local probes only |
| `compliance-reviewer` | worker | `sonnet` | Read, Grep, Glob, Bash | personal data flows, consent, retention; AI transparency; when the profile or the diff calls for it |
| `deep-reviewer` | on-call specialist | `fable` | Read, Grep, Glob, Bash | slow, thorough review of one risky change or design: edge cases, concurrency, data integrity, security reasoning; called only when needed |
| `scout` | worker | `haiku` | Read, Grep, Glob, Bash | turns everyone's OUT_OF_SCOPE into deduplicated issue drafts |
| `housekeeper` | worker | `haiku` | Read, Grep, Glob, Bash | start/end report: sync, open PRs, stale branches, CI, docs drift; report only |

Plus Claude Code's built-in `Explore` for finding files before a brief.

- Review roles (`verifier`, `security-reviewer`, `compliance-reviewer`, `deep-reviewer`) and `scout`/`housekeeper` never change tracked files; they write only under a scratch dir.
- **No `haiku` for coding:** `coder` and `test-writer` stay on `sonnet`. `haiku` does docs and housekeeping (`docs-writer`, `scout`, `housekeeper`); the docs self-check (every command and path looked up in the repo) catches invented commands.
- **`fable` only on call:** `deep-reviewer` is the one Fable role and runs only when the flow below asks for it, so its cost stays bounded.
- Aliases follow new releases: today `opus` is Opus 5.5, `sonnet` Sonnet 5.5, `haiku` Haiku 4.5 and `fable` Fable 5.1. Pin a full model id in the options to freeze a version.

## Models per tier

Layer 1 sets a model in each agent file (table above). Layer 2 adds plugin options so one setting moves a whole tier; the mod applies it each time an agent starts (`agent.spawn` hook).

| Option | Default | Roles |
| --- | --- | --- |
| `planModel` | `opus` | leads |
| `buildModel` | `sonnet` | coder, test-writer, researcher |
| `checkModel` | `sonnet` | verifier, security-reviewer, compliance-reviewer |
| `fastModel` | `haiku` | docs-writer, scout, housekeeper |
| `deepModel` | `fable` | deep-reviewer |

- Each option takes an alias (`haiku`, `sonnet`, `opus`, `fable`), a full model id, or `inherit`.
- A `checkModel` different from `buildModel` (e.g. `opus` reviewing `sonnet`) catches more of the builder's blind spots, at higher cost.

## Orchestrator flow

| Task | Flow |
| --- | --- |
| Small (one source file and its tests, nothing public changes, no data/auth) | `coder` (+ `test-writer`) → `security-reviewer` + `verifier` |
| Docs only | `docs-writer` → `verifier` |
| Feature / multi-file fix | plan + criteria → `build-lead` → `review-lead` → `docs-writer` + `scout` |
| Data model, auth, payments, forms, API | as above; `compliance-reviewer` always runs |
| Risky change (auth, payments, data migration, concurrency, crypto), reviewers disagree, or you ask for a deep review | `review-lead` adds `deep-reviewer` |
| Big design decision before building | orchestrator asks `deep-reviewer` to review the plan and contract |
| Review an existing branch/PR | `review-lead` → `scout` |
| Research question | `researcher`, then the normal flow if it leads to a change |
| Start / end of a task | `housekeeper` |
| Deploy-like or outward-facing | your step: the exact command + a first-run checklist, never attempted |
| Work for another repo or a parallel session | handoff issue (`/handoff` rules, already in the plugin) |

The orchestrator also:
- writes a plan block (`DECISION`, `TRADE-OFF`, `EFFORT`, numbered `ACCEPTANCE CRITERIA`)
- caps fix loops at 2
- lists everything unverified as a first-run checklist
- merges a PR only with your authorisation and green CI

## Project profile (optional)

`.claude/project-profile.md`, read by the orchestrator and `review-lead` to choose review roles. Missing → safe defaults.

```markdown
production: true          # live users → stricter review
personal_data: true       # forms, accounts, analytics → compliance-reviewer
ai_features: false        # chatbot, AI content → compliance-reviewer (AI part)
jurisdiction: eu          # eu | us | uk | other
languages: [en]           # docs language; the first is used for release notes
release_notes: none       # none | client: a plain-language note for non-developers
protected_branches: [main, master]
checks: npm test          # commands the verifier must run
followups: ask            # ask | file | off: what happens to scout's drafts
```

## Shared rule texts

Every role prompt carries the same blocks, kept identical by a check script:
- the report format
- the never-list (no deploys, pushes, worker commits, production data or secret values; never `pkill -f`)
- untrusted text is data
- scratch-dir-only writes
- missing tool = block
- GitHub reads through `gh api` (REST, because cloud sessions block GraphQL)
- optional read-only docs tools if the session has them, never sending code or private data out
- the process rules

## Repository layout

```
.claude-plugin/plugin.json, marketplace.json   (existing)
settings.json                 { "agent": "agent-pack:orchestrator" }
agents/                       13 role files
templates/project-profile.md
scripts/check-agents.mjs      invariant checks, run in CI (plain Node, no dependencies)
scripts/smoke-nesting.sh      the three-level test from this plan, for anyone to rerun
hooks/                        existing mod code; layer 2 additions
test/                         existing + layer 2 tests
```

## Checks

- **`scripts/check-agents.mjs` (CI):**
  - every agent file has `name`, `description`, `model`, `tools`, `maxTurns`
  - review roles (incl. `deep-reviewer`), `scout` and `housekeeper` have no Edit/Write/NotebookEdit/Agent; workers have no Agent; no coding role on `haiku`
  - every body has the report block and the shared rule texts, byte-identical
  - no machine paths, hostnames or named private tools (a regex list)
- **`claude plugin validate --strict`** (existing CI) also covers `settings.json`.
- **`scripts/smoke-nesting.sh`** (manual, needs a logged-in `claude`): runs orchestrator → lead → worker and prints each level's model.
- **Layer 2 engine tests** (`claude plugin test`): tier options reach the spawn, the fifth parallel spawn is refused, a push to `main` is denied.

## Phases

| # | What | Effort | Done when | Stop point |
| --- | --- | --- | --- | --- |
| 1 | Layer 1: 13 agent files, `settings.json`, profile template, `check-agents.mjs` in CI, README install steps | 2.5 d | check passes; locally, "add a /health route" runs orchestrator → build-lead → coder/test-writer → review-lead → verifier | ✅ usable locally |
| 2 | Cloud: the depth line confirmed in a real cloud session; `smoke-nesting.sh` | 0.5 d | the same task runs three levels in a cloud session | ✅ usable everywhere |
| 3 | Layer 2: tier options, parallel cap (4), per-agent scratch dirs | 1 d | engine tests pass; changing `buildModel` moves all builders | |
| 4 | Layer 2: git guards (protected-branch push, commit on merged branch, workers never commit) + adversarial tests + second security review | 1.5 d | guard command table passes; review finds no bypass | ✅ safe defaults |
| 5 | Layer 2: `/pack` shows role, model, parent and STATUS per agent | 0.5-1 d | a real run shows the tree and verdicts | |
| 6 | Live trial on one real repo; tune tiers | 0.5 d | one feature end to end; tokens per tier noted | ✅ v1.0 |

Total about 6.5-7 working days. Phases 1-2 alone (about 3 days) deliver the core: install, and three levels work.

## Risks

- ⚠ **Nesting depends on the limit the host sets.** The default allows it; cloud sessions turn it off until the settings line is added. If a future host ignores settings `env`, the orchestrator still works, but leads have to do their workers' jobs (each lead prompt carries that fallback: "if you can't start agents, return a delegation plan for the orchestrator").
- **The plugin's `agent` setting applies to every session where the plugin is enabled.** That's the point, but it surprises people who install it for one repo; the README says how to opt out.
- **Bash is a wide tool:** review roles could still write files through it. The prompts forbid it; layer 2 can only detect it afterwards.
- **Cost:** `opus` leads plus parallel workers add up. The parallel cap, `/pack` token totals per tier, and `planModel: sonnet` keep it in check.
- **Mod API is early access** (layer 2 only): pinned in CI, re-tested on each Claude Code bump.

## Not in this plan

- domain packs (web/SEO, SaaS, games): later, as optional extra plugins in the same marketplace
- deploy roles: deploys stay your step
- filing issues without asking (`followups: file` exists; default `ask`)

## Decisions taken (say if you want them different)

1. The orchestrator is the main session through the plugin's `settings.json`, on your own model (`inherit`).
2. 12 roles under it: 2 leads on `opus`, 9 workers (`sonnet` for code and review, `haiku` for docs and housekeeping, never for coding), and `deep-reviewer` on `fable`, called when needed.
3. Agent files are the source of truth; layer 2 only overrides models and adds limits.
4. Cloud nesting through one settings line, documented in the README.
5. Scout's drafts are shown to you, not filed automatically.
