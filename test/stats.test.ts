import { expect, test } from 'claude-code/testing'

import {
  compact,
  emptyStats,
  formatPack,
  recordAgentStart,
  recordToolCall,
  recordTurn,
} from '../hooks/stats'

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
  expect(text).toContain('Turns: 1 · tool calls: 8 (1 failed)')
  expect(text).toContain('Top tools: Bash 2, Read 2, Edit 1, Glob 1, Grep 1')
  expect(text).toContain('  main: 1 turn, 7 tool calls')
  expect(text).toContain('  Explore (running): 0 turns, 1 tool call (1 failed)')
  expect(text).toContain('  m1: in 12.3k, out 678, cache read 1.0k, cache write 10')
})

test('an agent the engine no longer lists still shows by short id', () => {
  const stats = recordToolCall(emptyStats(), { tool: 'Read', agentId: 'abcdef123456', hasFailed: false })
  const text = formatPack({ stats, engine: 'x', surfaces: [], repo: null, agents: [] })

  expect(text).toContain('  agent abcdef12: 0 turns, 1 tool call')
  expect(text).not.toContain('Context:')
  expect(text).not.toContain('Tokens by model:')
})

test('a finished subagent keeps the type it started with', () => {
  let stats = recordAgentStart(emptyStats(), { agentId: 'a06e5ae9xyz', agentType: 'Explore' })
  stats = recordToolCall(stats, { tool: 'Read', agentId: 'a06e5ae9xyz', hasFailed: false })
  const text = formatPack({ stats, engine: 'x', surfaces: [], repo: null, agents: [] })

  expect(text).toContain('  Explore: 0 turns, 1 tool call')
  expect(text).not.toContain('agent a06e5ae9')
})

test('state from 0.2.0 without agentTypes still formats', () => {
  const { agentTypes: _, ...old } = recordToolCall(emptyStats(), {
    tool: 'Read',
    agentId: 'abcdef123456',
    hasFailed: false,
  })
  const text = formatPack({ stats: old as never, engine: 'x', surfaces: [], repo: null, agents: [] })

  expect(text).toContain('  agent abcdef12: 0 turns, 1 tool call')
  expect(recordAgentStart(old as never, { agentId: 'b', agentType: 'Plan' }).agentTypes).toEqual({ b: 'Plan' })
})
