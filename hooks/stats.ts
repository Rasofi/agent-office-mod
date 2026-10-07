// Pure session bookkeeping: what /office reports. Metadata only (tool names,
// counts, token numbers); never tool inputs, outputs or message text.

import type {
  AgentRow,
  LoopStats,
  OfficeView,
  SessionStats,
  TurnUsage,
} from '../types'

export type { AgentRow, LoopStats, OfficeView, SessionStats, TurnUsage }

export const MAIN = 'main'

export const emptyStats = (): SessionStats => ({
  turns: 0,
  toolCalls: 0,
  failed: 0,
  tools: {},
  loops: {},
  tokens: {},
})

const loopOf = (stats: SessionStats, agentId: string | undefined): LoopStats =>
  stats.loops[agentId ?? MAIN] ?? { turns: 0, toolCalls: 0, failed: 0 }

export const recordToolCall = (
  stats: SessionStats,
  call: { tool: string; agentId?: string; hasFailed: boolean },
): SessionStats => {
  const loop = loopOf(stats, call.agentId)
  const failed = call.hasFailed ? 1 : 0

  return {
    ...stats,
    toolCalls: stats.toolCalls + 1,
    failed: stats.failed + failed,
    tools: { ...stats.tools, [call.tool]: (stats.tools[call.tool] ?? 0) + 1 },
    loops: {
      ...stats.loops,
      [call.agentId ?? MAIN]: {
        ...loop,
        toolCalls: loop.toolCalls + 1,
        failed: loop.failed + failed,
      },
    },
  }
}

export const recordTurn = (
  stats: SessionStats,
  turn: { agentId?: string; usage?: TurnUsage },
): SessionStats => {
  const loop = loopOf(stats, turn.agentId)
  const next: SessionStats = {
    ...stats,
    turns: stats.turns + 1,
    loops: { ...stats.loops, [turn.agentId ?? MAIN]: { ...loop, turns: loop.turns + 1 } },
  }
  if (turn.usage === undefined) return next

  const { model } = turn.usage
  const had = stats.tokens[model] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

  return {
    ...next,
    tokens: {
      ...stats.tokens,
      [model]: {
        input: had.input + turn.usage.input_tokens,
        output: had.output + turn.usage.output_tokens,
        cacheRead: had.cacheRead + turn.usage.cache_read_input_tokens,
        cacheWrite: had.cacheWrite + turn.usage.cache_creation_input_tokens,
      },
    },
  }
}

export const compact = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n)

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const loopLine = (label: string, loop: LoopStats): string =>
  `  ${label}: ${plural(loop.turns, 'turn')}, ${plural(loop.toolCalls, 'tool call')}` +
  (loop.failed > 0 ? ` (${loop.failed} failed)` : '')

export const formatOffice = (view: OfficeView): string => {
  const { stats } = view
  const lines = [
    'agent-office is loaded.',
    `Claude Code: ${view.engine}`,
    `Surfaces: ${view.surfaces.join(', ') || 'none'}`,
    `Repository: ${view.repo ?? 'none'}`,
  ]

  if (view.context !== undefined) {
    const used =
      view.context.percent !== undefined ? `${Math.round(view.context.percent)}% of ` : ''
    const cost = view.costUsd !== undefined ? ` · cost $${view.costUsd.toFixed(2)}` : ''
    lines.push(`Context: ${used}${compact(view.context.window)} tokens${cost}`)
  }

  lines.push(
    `Turns: ${stats.turns} · tool calls: ${stats.toolCalls}` +
      (stats.failed > 0 ? ` (${stats.failed} failed)` : ''),
  )

  const top = Object.entries(stats.tools)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, 5)
  if (top.length > 0) {
    lines.push(`Top tools: ${top.map(([tool, n]) => `${tool} ${n}`).join(', ')}`)
  }

  const known = new Map(view.agents.map(agent => [agent.id, agent]))
  const loopIds = Object.keys(stats.loops)
  const agentIds = [...new Set([...loopIds.filter(id => id !== MAIN), ...known.keys()])]
  lines.push('Agents:')
  lines.push(loopLine(MAIN, loopOf(stats, undefined)))
  for (const id of agentIds) {
    const agent = known.get(id)
    const label = agent
      ? `${agent.name ?? agent.type} (${agent.status})`
      : `agent ${id.slice(0, 8)}`
    lines.push(loopLine(label, loopOf(stats, id)))
  }

  const models = Object.entries(stats.tokens)
  if (models.length > 0) {
    lines.push('Tokens by model:')
    for (const [model, t] of models) {
      lines.push(
        `  ${model}: in ${compact(t.input)}, out ${compact(t.output)}, ` +
          `cache read ${compact(t.cacheRead)}, cache write ${compact(t.cacheWrite)}`,
      )
    }
  }

  return lines.join('\n')
}
