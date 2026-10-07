import { expect, test } from 'claude-code/testing'

import { holdsInForeground } from '../hooks/spawn'

test("a lead's background worker is held in the foreground", () => {
  expect(holdsInForeground({ parentAgentId: 'lead-1', background: true })).toBe(true)
})

test('the main session keeps background agents', () => {
  expect(holdsInForeground({ background: true })).toBe(false)
})

test('a foreground spawn is left alone', () => {
  expect(holdsInForeground({ parentAgentId: 'lead-1', background: false })).toBe(false)
})

test('teammates and workflow agents keep what they asked for', () => {
  expect(holdsInForeground({ parentAgentId: 'lead-1', background: true, isTeammate: true })).toBe(false)
  expect(
    holdsInForeground({ parentAgentId: 'lead-1', background: true, workflow: { runId: 'wf_1', agentIndex: 1 } }),
  ).toBe(false)
})
