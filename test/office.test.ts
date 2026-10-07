import { expect, test } from 'claude-code/testing'
import type { CommandRunInput, On, SessionRepo } from 'claude-code'

const office: CommandRunInput = {
  command: 'office',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
}

const engine = (on: On, repo: SessionRepo | null = null) => {
  on('session.version', () => ({ value: { version: '2.1.292' } }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.repo', () => ({ value: repo }))
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 50_000, window: 200_000, percent: 25 },
      rateLimits: [],
      cost: { usd: 0.5 },
    },
  }))
}

test('/office reports the engine, surfaces, repository and context', async ($, on) => {
  engine(on, { root: '/repo', remote: 'https://github.com/Rasofi/agent-office-mod', internal: false, name: 'Rasofi/agent-office-mod' })

  const { text } = await $.command.run(office)

  expect(text).toContain('agent-office is loaded.')
  expect(text).toContain('Claude Code: 2.1.292')
  expect(text).toContain('Surfaces: terminal')
  expect(text).toContain('Repository: https://github.com/Rasofi/agent-office-mod')
  expect(text).toContain('Context: 25% of 200.0k tokens · cost $0.50')
  expect(text).toContain('Turns: 0 · tool calls: 0')
})

test('/office counts the tool calls the session made', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: 'ok' as never }))

  await $.tool.call({ tool: 'Read', file_path: '/repo/a.md' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/b.md' })
  const { text } = await $.command.run(office)

  expect(text).toContain('tool calls: 2')
  expect(text).toContain('Top tools: Read 2')
  expect(text).not.toContain('/repo/a.md')
})

test('/office names a subagent by the type it started with', async ($, on) => {
  engine(on)
  on('classic.SubagentStart', () => ({}))

  await $.classic.SubagentStart({ agent_id: 'a06e5ae9xyz', agent_type: 'Explore' })
  const { text } = await $.command.run(office)

  expect(text).toContain('  Explore: 0 turns, 0 tool calls')
})
