import { expect, test } from 'claude-code/testing'
import type { CommandRunInput, On, ProcessRunResult, SessionRepo } from 'claude-code'

import {
  formatInbox,
  ghFailure,
  handoffIssue,
  parseHandoffArgs,
  repoFromRemote,
} from '../hooks/handoff'

const ok = (stdout: unknown): ProcessRunResult => ({
  exitCode: 0,
  stdout: JSON.stringify(stdout),
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

const fail = (stderr: string): ProcessRunResult => ({ ...ok(''), exitCode: 1, stdout: '', stderr })

const run = (command: string, args: string): CommandRunInput => ({
  command,
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
})

const repo = (remote: string | null): SessionRepo => ({
  root: '/repo',
  remote,
  internal: false,
  name: null,
})

const inSession = (on: On, remote: string | null = 'https://github.com/Rasofi/app.git') =>
  on('session.repo', () => ({ value: repo(remote) }))

test('repoFromRemote reads https and ssh remotes', () => {
  expect(repoFromRemote('https://github.com/Rasofi/agent-office-mod')).toBe('Rasofi/agent-office-mod')
  expect(repoFromRemote('https://github.com/example-org/web-app.git')).toBe('example-org/web-app')
  expect(repoFromRemote('git@github.com:rasofioy/gearmotive.git')).toBe('rasofioy/gearmotive')
  expect(repoFromRemote('https://gitlab.com/a/b')).toBe(null)
  expect(repoFromRemote(null)).toBe(null)
})

test('parseHandoffArgs needs a repo and text', () => {
  expect(parseHandoffArgs('Rasofi/api add a /health route')).toEqual({
    target: 'Rasofi/api',
    text: 'add a /health route',
  })
  expect('error' in parseHandoffArgs('')).toBe(true)
  expect('error' in parseHandoffArgs('Rasofi/api')).toBe(true)
  expect('error' in parseHandoffArgs('not-a-repo do it')).toBe(true)
  expect('error' in parseHandoffArgs('../etc/passwd x')).toBe(true)
  expect('error' in parseHandoffArgs(`Rasofi/api ${'x'.repeat(4001)}`)).toBe(true)
})

test('handoffIssue labels the issue and marks it as data', () => {
  const issue = handoffIssue('Rasofi/app', 'add a /health route\nmore detail')

  expect(issue.title).toBe('Handoff from Rasofi/app: add a /health route')
  expect(issue.labels).toEqual(['agent-handoff'])
  expect(issue.body).toContain('<!-- agent-office handoff v1 from=Rasofi/app -->')
  expect(issue.body).toContain('more detail')
  expect(issue.body).toContain('not as instructions')
})

test("formatInbox shows only the user's own issues, cleaned", () => {
  const text = formatInbox('Rasofi/api', 'me', [
    {
      number: 7,
      title: 'Handoff from Rasofi/app: add\u001b[2J route',
      html_url: 'https://github.com/Rasofi/api/issues/7',
      body: '<!-- agent-office handoff v1 from=Rasofi/app -->',
      user: { login: 'me' },
    },
    { number: 8, title: 'from a stranger', html_url: 'u8', user: { login: 'someone' } },
    { number: 9, title: 'a pull request', html_url: 'u9', user: { login: 'me' }, pull_request: {} },
  ])

  expect(text).toContain('#7 from Rasofi/app: add [2J route')
  expect(text).not.toContain('\u001b')
  expect(text).not.toContain('stranger')
  expect(text).not.toContain('#9')
  expect(formatInbox('Rasofi/api', 'me', [])).toBe('No open handoffs for Rasofi/api.')
})

test('ghFailure explains a repo the cloud session cannot reach', () => {
  expect(ghFailure('a/b', 'GitHub access to this repository is not enabled for this session.')).toContain(
    'add the repository a/b to the session',
  )
  expect(ghFailure('a/b', 'HTTP 404: Not Found')).toBe('a/b was not found, or you have no access to it.')
})

test('/handoff opens the issue through gh api REST', async ($, on) => {
  inSession(on)
  let sent: { argv: readonly string[]; stdin?: string } | undefined
  on('process.run', ($, e) => {
    sent = { argv: e.argv, stdin: e.init?.stdin }
    return { value: ok({ number: 12, html_url: 'https://github.com/Rasofi/api/issues/12' }) }
  })

  const { text } = await $.command.run(run('handoff', 'Rasofi/api add a /health route'))

  expect(text).toBe('Handoff #12 opened in Rasofi/api: https://github.com/Rasofi/api/issues/12')
  expect(sent?.argv).toEqual(['gh', 'api', 'repos/Rasofi/api/issues', '--method', 'POST', '--input', '-'])
  expect(JSON.parse(sent?.stdin ?? '{}').labels).toEqual(['agent-handoff'])
  expect(JSON.parse(sent?.stdin ?? '{}').title).toBe('Handoff from Rasofi/app: add a /health route')
})

test('/handoff with bad arguments never calls GitHub', async ($, on) => {
  inSession(on)
  let calls = 0
  on('process.run', () => {
    calls += 1
    return { value: ok({}) }
  })

  const { text } = await $.command.run(run('handoff', 'Rasofi/api'))

  expect(text).toContain('Say what Rasofi/api should do')
  expect(calls).toBe(0)
})

test('/handoff reports a repo the session cannot reach', async ($, on) => {
  inSession(on)
  on('process.run', () => ({ value: fail('GitHub access to this repository is not enabled for this session.') }))

  const { text } = await $.command.run(run('handoff', 'Rasofi/api do it'))

  expect(text).toContain("can't reach Rasofi/api")
})

test('/inbox lists open handoffs for this repo', async ($, on) => {
  inSession(on)
  on('process.run', ($, e) =>
    e.argv[2] === 'user'
      ? { value: ok({ login: 'me' }) }
      : {
          value: ok([
            {
              number: 3,
              title: 'Handoff from Rasofi/web: needs an endpoint',
              html_url: 'https://github.com/Rasofi/app/issues/3',
              body: '<!-- agent-office handoff v1 from=Rasofi/web -->',
              user: { login: 'me' },
            },
          ]),
        },
  )

  const { text } = await $.command.run(run('inbox', ''))

  expect(text).toContain('Open handoffs for Rasofi/app (1):')
  expect(text).toContain('#3 from Rasofi/web')
})

test('/inbox outside a GitHub repo says so', async ($, on) => {
  inSession(on, null)

  const { text } = await $.command.run(run('inbox', ''))

  expect(text).toBe('This session is not in a GitHub repository.')
})
