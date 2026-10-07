// The mod's state contract: self-contained, no imports (the validator's rule).

export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type LoopStats = { turns: number; toolCalls: number; failed: number }

export type SessionStats = {
  turns: number
  toolCalls: number
  failed: number
  tools: Record<string, number>
  loops: Record<string, LoopStats>
  tokens: Record<string, Tokens>
  /** Subagent type by agent id, recorded when the subagent starts. */
  agentTypes: Record<string, string>
  /** Subagents that stopped (SubagentStop); absent in state from 0.9 and older. */
  finished?: Record<string, true>
}

export type TurnUsage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type AgentRow = { id: string; type: string; name?: string; status: string }

export type PackView = {
  stats: SessionStats
  engine: string
  surfaces: readonly string[]
  repo: string | null
  agents: readonly AgentRow[]
  context?: { tokens?: number; window: number; percent?: number }
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-pack': { session: SessionStats }
  }
}
