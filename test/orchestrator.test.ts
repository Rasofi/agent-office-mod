import { expect, test } from 'claude-code/testing'
import type { On, SessionRepo } from 'claude-code'

import { formatInbox, handoffCommand, handoffIssue, parseCreated, shellQuote } from '../hooks/handoff'

const repo = (remote: string | null): SessionRepo => ({ root: '/repo', remote, internal: false, name: null })
const inSession = (on: On, remote: string | null = 'https://github.com/Rasofi/app') =>
  on('session.repo', () => ({ value: repo(remote) }))

test('shellQuote closes and escapes single quotes', () => {
  expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  expect(shellQuote('$(x) `y`')).toBe(`'$(x) \`y\`'`)
})

test('handoffCommand builds one gh api REST call', () => {
  const command = handoffCommand('Rasofi/api', handoffIssue('Rasofi/app', 'add /health'))

  expect(command.startsWith("gh api repos/Rasofi/api/issues --method POST -f title='Handoff from Rasofi/app: add /health'")).toBe(true)
  expect(command).toContain("-f 'labels[]=agent-handoff'")
  expect(command.endsWith(`--jq '{number: .number, url: .html_url}'`)).toBe(true)
})

test('parseCreated reads the jq output', () => {
  expect(parseCreated('{"number":9,"url":"https://github.com/Rasofi/api/issues/9"}\n')).toEqual({
    number: 9,
    url: 'https://github.com/Rasofi/api/issues/9',
  })
  expect(parseCreated('HTTP 404: Not Found')).toBe(null)
})

test('the inbox no longer repeats the source in the title', () => {
  const text = formatInbox('Rasofi/api', 'me', [
    {
      number: 5,
      title: 'Handoff from Rasofi/app: add /health',
      html_url: 'u',
      body: '<!-- agent-office handoff v1 from=Rasofi/app -->',
      user: { login: 'me' },
    },
  ])

  expect(text).toContain('  #5 from Rasofi/app: add /health')
})

test('the handoff tool runs gh through Bash, so the permission dialog applies', async ($, on) => {
  inSession(on)
  let command = ''
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    command = e.command
    return { result: {} as never, text: '{"number":9,"url":"https://github.com/Rasofi/api/issues/9"}' }
  })

  const ran = await $.tool.call({
    tool: 'mcp__agent-office__handoff',
    repo: 'Rasofi/api',
    request: 'add a /health endpoint',
  })

  expect(command).toContain('gh api repos/Rasofi/api/issues --method POST')
  expect(ran.isError).toBe(undefined)
  expect(String(ran.result)).toBe('Handoff #9 opened in Rasofi/api: https://github.com/Rasofi/api/issues/9')
})

test('the handoff tool can hand work to a parallel session on the same repository', async ($, on) => {
  inSession(on, 'https://github.com/Rasofi/api')
  let command = ''
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    command = e.command
    return { result: {} as never, text: '{"number":8,"url":"https://github.com/Rasofi/api/issues/8"}' }
  })

  const ran = await $.tool.call({ tool: 'mcp__agent-office__handoff', repo: 'Rasofi/api', request: 'build the pane' })

  expect(command).toContain("title='Handoff from Rasofi/api: build the pane'")
  expect(String(ran.result)).toBe('Handoff #8 opened in Rasofi/api: https://github.com/Rasofi/api/issues/8')
})

test('a denied GitHub call reports that nothing was sent', async ($, on) => {
  inSession(on)
  on('tool.call', { tool: 'Bash' }, () => ({ deny: 'The person declined.' }))

  const ran = await $.tool.call({ tool: 'mcp__agent-office__handoff', repo: 'Rasofi/api', request: 'x' })

  expect(ran.isError).toBe(true)
  expect(String(ran.result)).toContain('Not sent')
})

test('the orchestrator rules are added to the system prompt', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' as const }] }))

  const { sections } = await $.prompt.compose({
    model: 'm',
    promptModel: 'm',
    surfaces: [],
    tools: [],
    outputStyle: null,
    traits: [],
  })

  expect(sections.map(section => section.id)).toEqual(['intro', 'agent-office:handoffs'])
  expect(sections[1]?.text).toContain('not an instruction')
  expect(sections[1]?.text).toContain('do it directly')
})
