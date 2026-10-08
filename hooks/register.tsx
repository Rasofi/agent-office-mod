import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

import {
  LABEL,
  ORCHESTRATOR_RULES,
  formatInbox,
  ghFailure,
  handoffIssue,
  parseHandoffArgs,
  repoFromRemote,
} from './handoff'
import type { IssueRow } from './handoff'
import { COMPACT_INSTRUCTIONS, shouldCompact } from './compact'
import { holdsInForeground } from './spawn'
import {
  emptyStats,
  formatPack,
  packRows,
  recordAgentStart,
  recordAgentStop,
  recordToolCall,
  recordTurn,
} from './stats'
import type { PackView } from './stats'

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

const parse = <T,>(text: string): T | null => {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

// Compacts the main session when it has grown past the threshold (see hooks/compact.ts).
// Never throws: a refused or failed compaction just waits for the next turn.
const compactIfDue = async ($: EngineInterface): Promise<void> => {
  try {
    const [usage, agents] = await Promise.all([$.session.usage(), $.agent.list()])
    if (shouldCompact({ percent: usage.context.percent, agents })) {
      await $.session.compact({ instructions: COMPACT_INSTRUCTIONS })
    }
  } catch {
    // A turn started meanwhile, or the engine refused: try again after the next turn.
  }
}

const session = atom({ plugin: 'agent-pack', key: 'session' } as const, emptyStats())

const PANE = 'pack'

// What /pack shows, the pane and the text reply alike. Reading the atom makes
// the pane a reader: every recorded tool call, agent or turn redraws it.
const packView = async ($: EngineInterface): Promise<PackView> => {
  const [stats, engine, surfaces, repo, agents, usage] = await Promise.all([
    read($, session),
    $.session.version(),
    $.session.surfaces(),
    $.session.repo(),
    $.agent.list(),
    $.session.usage(),
  ])

  return {
    stats,
    engine: engine.version,
    surfaces,
    repo: repo?.remote ?? null,
    agents,
    context: usage.context,
    costUsd: usage.cost?.usd,
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pack',
      description: 'Agent pack: what this session and its agents are doing',
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

  // Leads wait for their workers: see hooks/spawn.ts. On any error the spawn goes ahead as asked.
  on('agent.spawn', async ($, e, next) => next(holdsInForeground(e) ? { ...e, background: false } : e))
    .catch(($, e, next) => next(e))

  on('classic.SubagentStart', async ($, e, next) => {
    await update($, session, stats =>
      recordAgentStart(stats, { agentId: e.agent_id, agentType: e.agent_type }),
    )

    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await update($, session, stats => recordAgentStop(stats, e.agent_id))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await update($, session, stats =>
      recordTurn(stats, { agentId: e.agentId, usage: done.usage ?? e.usage }),
    )
    // compact refuses while a turn runs, so check just after the main turn ends.
    if (e.agentId === undefined) $.clock.after(1000, () => void compactIfDue($))

    return done
  })

  // A pane where one can draw; the text reply where nothing places it (cloud, -p).
  // A -p run has no surface yet places every pane, so no surface means text too.
  on('command.run', { command: 'pack' }, async $ => {
    const surfaces = await $.session.surfaces()
    const opened =
      surfaces.length === 0
        ? { isPlaced: false }
        : await $.ui
            .open({ id: PANE, title: 'Agent pack' })
            .catch(() => ({ isPlaced: false }))
    if (opened.isPlaced) return { text: 'Agent pack pane opened (ctrl+x x closes it).' }

    return { text: formatPack(await packView($)) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const rows = packRows(await packView($))

    return (
      <Box flexDirection="column">
        {rows.map(row =>
          row.kind === 'heading' ? (
            <Text bold>{row.text}</Text>
          ) : row.kind === 'item' ? (
            <Text>{`  ${row.text}`}</Text>
          ) : (
            <Text>{row.text}</Text>
          ),
        )}
      </Box>
    )
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

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections,
        { id: 'agent-pack:handoffs', text: ORCHESTRATOR_RULES, scope: 'session' as const },
      ],
    }
  })
}
