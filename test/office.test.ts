import { expect, test } from 'claude-code/testing'

test('/office reports the engine, surfaces and repository', async ($, on) => {
  on('session.version', () => ({ value: { version: '2.1.292' } }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.repo', () => ({ value: { root: '/repo', remote: 'https://github.com/Rasofi/agent-office-mod', internal: false } }))

  const { text } = await $.command.run({ command: 'office', args: '' })

  expect(text).toContain('agent-office is loaded.')
  expect(text).toContain('Claude Code: 2.1.292')
  expect(text).toContain('Surfaces: terminal')
  expect(text).toContain('Repository: https://github.com/Rasofi/agent-office-mod')
})

test('/office says so when the session has no repository', async ($, on) => {
  on('session.version', () => ({ value: { version: '2.1.292' } }))
  on('session.surfaces', () => ({ value: [] }))
  on('session.repo', () => ({ value: null }))

  const { text } = await $.command.run({ command: 'office', args: '' })

  expect(text).toContain('Surfaces: none')
  expect(text).toContain('Repository: none')
})
