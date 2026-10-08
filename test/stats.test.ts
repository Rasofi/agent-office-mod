import { expect, test } from 'claude-code/testing'

import {
  compact,
  emptyStats,
  formatPack,
  isSaved,
  mergeRestored,
  needsRestore,
  recordAgentStart,
  recordAttach,
  recordAgentStop,
  recordToolCall,
  recordTurn,
  staleKeys,
  statusLine,
} from '../hooks/stats'
import type { SessionStats } from '../hooks/stats'

const usage = (model: string, input: number, output: number) => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 10,
})

test('tool calls are counted per tool and per loop', () => {
  let stats = emptyStats()
  stats = recordToolCall(stats, { tool: 'Read', hasFailed: false })
  stats = recordToolCall(stats, { tool: 'Bash', hasFailed: true })
  stats = recordToolCall(stats, { tool: 'Read', agentId: 'a1', hasFailed: false })

  expect(stats.toolCalls).toBe(3)
  expect(stats.failed).toBe(1)
  expect(stats.tools).toEqual({ Read: 2, Bash: 1 })
  expect(stats.loops.main).toEqual({ turns: 0, toolCalls: 2, failed: 1 })
  expect(stats.loops.a1).toEqual({ turns: 0, toolCalls: 1, failed: 0 })
})

test('turns add token usage per model', () => {
  let stats = emptyStats()
  stats = recordTurn(stats, { usage: usage('m1', 100, 50) })
  stats = recordTurn(stats, { agentId: 'a1', usage: usage('m1', 20, 5) })
  stats = recordTurn(stats, { agentId: 'a1' })

  expect(stats.turns).toBe(3)
  expect(stats.loops.a1?.turns).toBe(2)
  expect(stats.tokens.m1).toEqual({ input: 120, output: 55, cacheRead: 2000, cacheWrite: 20 })
})

test('recording never mutates the previous stats', () => {
  const before = emptyStats()
  recordToolCall(before, { tool: 'Read', hasFailed: false })
  recordTurn(before, { usage: usage('m1', 1, 1) })

  expect(before).toEqual(emptyStats())
})

test('compact numbers', () => {
  expect(compact(999)).toBe('999')
  expect(compact(12_345)).toBe('12.3k')
  expect(compact(2_500_000)).toBe('2.5M')
})

test('formatPack lists loops, top tools and tokens', () => {
  let stats = emptyStats()
  for (const tool of ['Bash', 'Bash', 'Read', 'Edit', 'Grep', 'Glob', 'Write']) {
    stats = recordToolCall(stats, { tool, hasFailed: false })
  }
  stats = recordToolCall(stats, { tool: 'Read', agentId: 'agent-123456789', hasFailed: true })
  stats = recordTurn(stats, { usage: usage('m1', 12_345, 678) })

  const text = formatPack({
    stats,
    engine: '2.1.292',
    surfaces: ['terminal'],
    repo: null,
    agents: [{ id: 'agent-123456789', type: 'Explore', status: 'running' }],
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    costUsd: 0.4211,
  })

  expect(text).toContain('Context: 25% of 200.0k tokens · cost $0.42')
  expect(text).toContain('Runs: 1 · tool calls: 8 (1 failed)')
  expect(text).toContain('Top tools: Bash 2, Read 2, Edit 1, Glob 1, Grep 1')
  expect(text).toContain('  main: 1 run, 7 tool calls')
  expect(text).toContain('  Explore (running): 0 runs, 1 tool call (1 failed)')
  expect(text).toContain('  m1: in 12.3k, out 678, cache read 1.0k, cache write 10')
})

test('an agent the engine no longer lists still shows by short id', () => {
  const stats = recordToolCall(emptyStats(), { tool: 'Read', agentId: 'abcdef123456', hasFailed: false })
  const text = formatPack({ stats, engine: 'x', surfaces: [], repo: null, agents: [] })

  expect(text).toContain('  agent abcdef12: 0 runs, 1 tool call')
  expect(text).not.toContain('Context:')
  expect(text).not.toContain('Tokens by model:')
})

test('a finished subagent keeps the type it started with', () => {
  let stats = recordAgentStart(emptyStats(), { agentId: 'a06e5ae9xyz', agentType: 'Explore' })
  stats = recordToolCall(stats, { tool: 'Read', agentId: 'a06e5ae9xyz', hasFailed: false })
  const text = formatPack({ stats, engine: 'x', surfaces: [], repo: null, agents: [] })

  expect(text).toContain('  Explore: 0 runs, 1 tool call')
  expect(text).not.toContain('agent a06e5ae9')
})

test('state from 0.2.0 without agentTypes still formats', () => {
  const { agentTypes: _, ...old } = recordToolCall(emptyStats(), {
    tool: 'Read',
    agentId: 'abcdef123456',
    hasFailed: false,
  })
  const text = formatPack({ stats: old as never, engine: 'x', surfaces: [], repo: null, agents: [] })

  expect(text).toContain('  agent abcdef12: 0 runs, 1 tool call')
  expect(recordAgentStart(old as never, { agentId: 'b', agentType: 'Plan' }).agentTypes).toEqual({ b: 'Plan' })
})

test('a stopped subagent the engine no longer lists shows as finished', () => {
  let stats = recordAgentStart(emptyStats(), { agentId: 'a1', agentType: 'agent-pack:scout' })
  stats = recordAgentStop(stats, 'a1')
  const text = formatPack({ stats, engine: '2.1.292', surfaces: [], repo: null, agents: [] })

  expect(text).toContain('  agent-pack:scout (finished): 0 runs, 0 tool calls')
})

const sample = (): SessionStats => ({
  ...emptyStats(),
  epoch: 'old',
  turns: 3,
  toolCalls: 10,
  failed: 1,
  tools: { Bash: 6, Read: 4 },
  loops: { main: { turns: 2, toolCalls: 7, failed: 1 }, a1: { turns: 1, toolCalls: 3, failed: 0 } },
  tokens: { m: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } },
  agentTypes: { a1: 'agent-pack:coder' },
  finished: { a1: true },
})

test('counts saved before a reload are added to what came after', () => {
  const now = { ...emptyStats(), epoch: 'new', turns: 1, toolCalls: 2, tools: { Bash: 2 }, loops: { main: { turns: 1, toolCalls: 2, failed: 0 } } }
  const merged = mergeRestored(now, sample(), 1_000)

  expect(merged.toolCalls).toBe(12)
  expect(merged.tools).toEqual({ Bash: 8, Read: 4 })
  expect(merged.loops.main).toEqual({ turns: 3, toolCalls: 9, failed: 1 })
  expect(merged.tokens.m?.cacheWrite).toBe(4)
  expect(merged.agentTypes.a1).toBe('agent-pack:coder')
  expect(merged.epoch).toBe('new')
  expect(merged.restoredAt).toBe(1_000)
})

test('restores only into a fresh counter set, once', () => {
  const saved = { savedAt: 1, stats: sample() }
  expect(needsRestore({ ...emptyStats(), epoch: 'new' }, saved)).toBe(true)
  expect(needsRestore({ ...emptyStats(), epoch: 'old' }, saved)).toBe(false)
  expect(needsRestore({ ...emptyStats(), epoch: 'new', restoredAt: 5 }, saved)).toBe(false)
  expect(needsRestore(emptyStats(), saved)).toBe(false)
  expect(isSaved({ savedAt: 1 })).toBe(false)
  expect(isSaved(saved)).toBe(true)
})

test('saved sessions older than 30 days are dropped, other keys kept', () => {
  const day = 24 * 60 * 60 * 1000
  const keys = staleKeys(
    [
      { key: 'stats:old', savedAt: 0 },
      { key: 'stats:new', savedAt: 40 * day },
      { key: 'stats:broken' },
      { key: 'other', savedAt: 0 },
    ],
    41 * day,
  )
  expect(keys).toEqual(['stats:old', 'stats:broken'])
})

test('the status line and the attached screens', () => {
  let stats = recordAttach(sample(), 'mobile')
  stats = recordAttach(stats, 'mobile')
  expect(stats.attached).toEqual(['mobile'])
  const line = statusLine({
    stats,
    agents: [{ id: 'a', status: 'running' } as never, { id: 'b', status: 'completed' } as never],
    costUsd: 2.1,
    context: { window: 1000, percent: 34.4 },
  })
  expect(line).toBe('agent-pack: 1 running · 3 runs · 10 tool calls · $2.10 · ctx 34%')
  const text = formatPack({ stats: { ...stats, restoredAt: 0 }, engine: 'x', surfaces: [], repo: null, agents: [] })
  expect(text).toContain('Screens attached: mobile')
  expect(text).toContain('Counts restored after a reload at 00:00 UTC')
})
