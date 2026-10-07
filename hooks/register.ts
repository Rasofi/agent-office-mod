import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { emptyStats, formatOffice, recordToolCall, recordTurn } from './stats'

const session = atom({ plugin: 'agent-office', key: 'session' } as const, emptyStats())

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description: 'Agent Office: what this session and its agents are doing',
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
}
