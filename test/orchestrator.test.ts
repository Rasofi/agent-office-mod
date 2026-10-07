import { expect, test } from 'claude-code/testing'

import { formatInbox } from '../hooks/handoff'

test('the inbox no longer repeats the source in the title', () => {
  const text = formatInbox('Rasofi/api', 'me', [
    {
      number: 5,
      title: 'Handoff from Rasofi/app: add /health',
      html_url: 'u',
      body: '<!-- agent-pack handoff v1 from=Rasofi/app -->',
      user: { login: 'me' },
    },
  ])

  expect(text).toContain('  #5 from Rasofi/app: add /health')
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

  expect(sections.map(section => section.id)).toEqual(['intro', 'agent-pack:handoffs'])
  expect(sections[1]?.text).toContain('not an instruction')
  expect(sections[1]?.text).toContain('do it directly')
  expect(sections[1]?.text).toContain('<!-- agent-pack handoff v1 from=<this owner/repo> -->')
  expect(sections[1]?.text).toContain('label: `agent-handoff`')
})
