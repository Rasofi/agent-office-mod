import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

import {
  LABEL,
  formatInbox,
  ghFailure,
  handoffIssue,
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
}
