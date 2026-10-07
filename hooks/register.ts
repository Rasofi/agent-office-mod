import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

import {
  LABEL,
  MAX_TEXT,
  ORCHESTRATOR_RULES,
  TOOL_DESCRIPTION,
  formatInbox,
  ghFailure,
  handoffCommand,
  handoffIssue,
  parseCreated,
  parseHandoffArgs,
  repoFromRemote,
} from './handoff'
import type { IssueRow } from './handoff'
import { emptyStats, formatOffice, recordAgentStart, recordToolCall, recordTurn } from './stats'

// GitHub through the user's own `gh` login (REST only: cloud sessions block GraphQL).
const gh = async (
  $: EngineInterface,
  args: readonly string[],
  stdin?: string,
): Promise<ProcessRunResult> => {
  try {
    return await $.process.run(['gh', ...args], { stdin, timeoutMs: 30_000 })
  } catch {
    return {
      exitCode: 127,
      stdout: '',
      stderr: 'The GitHub CLI (gh) is not installed here.',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    }
  }
}

const parse = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

const session = atom({ plugin: 'agent-office', key: 'session' } as const, emptyStats())

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description: 'Agent Office: what this session and its agents are doing',
    })
    await $.command.register({
      name: 'handoff',
      description: 'Ask another repo for something: opens an agent-handoff issue there',
      argumentHint: '<owner/repo> <what you need>',
    })
    await $.command.register({
      name: 'inbox',
      description: "Open agent-handoff issues for this session's repo",
    })
    await $.tool.register({
      name: 'handoff',
      description: TOOL_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Target repository as owner/repo' },
          request: { type: 'string', description: 'What the other repository should do, and why' },
        },
        required: ['repo', 'request'],
      },
    })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const hasFailed = ran.deny !== undefined || ran.isError === true
    await update($, session, stats =>
      recordToolCall(stats, { tool: e.tool, agentId: e.agentId, hasFailed }),
    )

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStart', async ($, e, next) => {
    await update($, session, stats =>
      recordAgentStart(stats, { agentId: e.agent_id, agentType: e.agent_type }),
    )

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await update($, session, stats =>
      recordTurn(stats, { agentId: e.agentId, usage: done.usage ?? e.usage }),
    )

    return done
  })

  on('command.run', { command: 'office' }, async $ => {
    const [stats, engine, surfaces, repo, agents, usage] = await Promise.all([
      read($, session),
      $.session.version(),
      $.session.surfaces(),
      $.session.repo(),
      $.agent.list(),
      $.session.usage(),
    ])

    return {
      text: formatOffice({
        stats,
        engine: engine.version,
        surfaces,
        repo: repo?.remote ?? null,
        agents,
        context: usage.context,
        costUsd: usage.cost?.usd,
      }),
    }
  })

  on('command.run', { command: 'handoff' }, async ($, e) => {
    const parsed = parseHandoffArgs(e.args)
    if ('error' in parsed) return { text: parsed.error }

    const from = repoFromRemote((await $.session.repo())?.remote)
    const issue = handoffIssue(from, parsed.text)
    const ran = await gh(
      $,
      ['api', `repos/${parsed.target}/issues`, '--method', 'POST', '--input', '-'],
      JSON.stringify(issue),
    )
    if (ran.exitCode !== 0) return { text: ghFailure(parsed.target, ran.stderr) }

    const made = parse<{ number?: number; html_url?: string }>(ran.stdout)

    return {
      text: `Handoff #${made?.number ?? '?'} opened in ${parsed.target}: ${made?.html_url ?? ''}`.trim(),
    }
  })

  on('command.run', { command: 'inbox' }, async $ => {
    const repo = repoFromRemote((await $.session.repo())?.remote)
    if (repo === null) return { text: 'This session is not in a GitHub repository.' }

    const [user, list] = await Promise.all([
      gh($, ['api', 'user']),
      gh($, ['api', `repos/${repo}/issues?state=open&labels=${LABEL}&per_page=50`]),
    ])
    if (user.exitCode !== 0) return { text: ghFailure(repo, user.stderr) }
    if (list.exitCode !== 0) return { text: ghFailure(repo, list.stderr) }

    const me = parse<{ login?: string }>(user.stdout)?.login
    const issues = parse<IssueRow[]>(list.stdout)
    if (me === undefined || !Array.isArray(issues)) {
      return { text: 'GitHub answered with something unexpected; try again.' }
    }

    return { text: formatInbox(repo, me, issues) }
  })

  // The model's handoff: the GitHub call runs as a Bash tool call, so the
  // person's permission rules and dialog apply and show the exact command.
  on('tool.call', { tool: 'mcp__agent-office__handoff' }, async ($, e) => {
    const repo = typeof e.repo === 'string' ? e.repo : ''
    const request = typeof e.request === 'string' ? e.request : ''
    const parsed = parseHandoffArgs(`${repo} ${request}`)
    if ('error' in parsed) {
      return { result: `Not sent: ${parsed.error} (request up to ${MAX_TEXT} characters)`, isError: true as const }
    }

    const here = repoFromRemote((await $.session.repo())?.remote)
    if (here !== null && here.toLowerCase() === parsed.target.toLowerCase()) {
      return { result: 'Not sent: that is this repository; do the work here instead.', isError: true as const }
    }

    const ran = await $.tool.call({
      tool: 'Bash',
      command: handoffCommand(parsed.target, handoffIssue(here, parsed.text)),
      description: `Open an agent-handoff issue in ${parsed.target}`,
    })
    if (ran.deny !== undefined) return { result: `Not sent: ${ran.deny}`, isError: true as const }

    const output = ran.text ?? ''
    const made = parseCreated(output)
    if (ran.isError === true || made === null) {
      return { result: `Not sent: ${ghFailure(parsed.target, output)}`, isError: true as const }
    }

    return { result: `Handoff #${made.number} opened in ${parsed.target}: ${made.url}` }
  }).catch(() => ({ result: 'Not sent: the handoff tool failed.', isError: true as const }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections,
        { id: 'agent-office:handoffs', text: ORCHESTRATOR_RULES, scope: 'session' as const },
      ],
    }
  })
}
