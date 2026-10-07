import type { AgentSpawnInput } from 'claude-code'

// A subagent's final message ends its run, and it gets no notice when a
// background agent it started finishes. So an agent started inside another
// agent (a lead's worker) runs in the foreground: the lead waits for its
// report, and no worker is left editing files after its lead has answered.
// Main-thread spawns, teammates and workflow agents keep what they asked for.
export const holdsInForeground = (
  e: Pick<AgentSpawnInput, 'parentAgentId' | 'background' | 'isTeammate' | 'workflow'>,
): boolean =>
  e.parentAgentId !== undefined && e.background && e.isTeammate !== true && e.workflow === undefined
