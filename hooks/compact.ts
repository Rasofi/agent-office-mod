// When the orchestrator's conversation gets long, every step re-reads all of
// it, and that, not the workers, is what makes long sessions expensive. So the
// pack compacts the main session once it passes COMPACT_AT_PERCENT of its
// context window, between turns and only while no agent is still working. The
// orchestrator keeps its plan in state.md in the scratch directory, so little
// is lost.

export const COMPACT_AT_PERCENT = 35

export const COMPACT_INSTRUCTIONS =
  'Keep: the task and its acceptance criteria, the scratch directory and its state.md, ' +
  'the branch, the waves done and the next one, open findings and blockers, decisions the ' +
  'person made, and anything still waiting for the person. Drop tool output and worker report details.'

const BUSY = new Set(['pending', 'running', 'waiting'])

export const shouldCompact = (s: {
  agentId?: string
  percent?: number
  agents: readonly { status: string }[]
}): boolean =>
  s.agentId === undefined &&
  (s.percent ?? 0) >= COMPACT_AT_PERCENT &&
  !s.agents.some(agent => BUSY.has(agent.status))
