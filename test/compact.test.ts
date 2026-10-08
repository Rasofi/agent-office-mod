import { expect, test } from 'claude-code/testing'

import { COMPACT_AT_PERCENT, shouldCompact } from '../hooks/compact'

const idle = [{ status: 'completed' }, { status: 'idle' }]

test('the main session compacts once it passes the threshold', () => {
  expect(shouldCompact({ percent: COMPACT_AT_PERCENT, agents: idle })).toBe(true)
  expect(shouldCompact({ percent: COMPACT_AT_PERCENT - 1, agents: idle })).toBe(false)
})

test('never while an agent is still working', () => {
  for (const status of ['pending', 'running', 'waiting']) {
    expect(shouldCompact({ percent: 90, agents: [...idle, { status }] })).toBe(false)
  }
})

test("never a subagent's own turn, and not without a known size", () => {
  expect(shouldCompact({ agentId: 'a1', percent: 90, agents: idle })).toBe(false)
  expect(shouldCompact({ agents: idle })).toBe(false)
})
