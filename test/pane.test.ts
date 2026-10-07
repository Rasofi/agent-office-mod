import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { CommandRunInput, On, RenderPropsOf, RenderSurface } from 'claude-code'

const office: CommandRunInput = {
  command: 'office',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
}

const PANE: RenderPropsOf['Pane'] = {
  title: 'Office',
  isFocused: false,
  bodyColumns: 80,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const engine = (on: On, surfaces: RenderSurface[] = ['terminal']) => {
  on('session.version', () => ({ value: { version: '2.1.292' } }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.repo', () => ({ value: null }))
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
}

const mount = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'agent-office', surface, component: 'Pane', requestId: 'office', props: PANE })

test('/office opens the pane where one can be placed', async ($, on) => {
  engine(on)
  let opened: string | undefined
  on('ui.open', (_, e) => {
    opened = e.id
    return { value: { isPlaced: true } }
  })

  const { text } = await $.command.run(office)

  expect(opened).toBe('office')
  expect(text).toContain('Office pane opened')
  expect(text).not.toContain('Turns:')
})

test('/office answers as text where no surface draws', async ($, on) => {
  engine(on, [])
  let isOpened = false
  on('ui.open', () => {
    isOpened = true
    return { value: { isPlaced: true } }
  })

  const { text } = await $.command.run(office)

  expect(isOpened).toBe(false)
  expect(text).toContain('Turns: 0 · tool calls: 0')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the office pane draws the session view on ${surface}`, async ($, on) => {
    engine(on)
    on('tool.call', () => ({ result: 'ok' as never }))
    on('classic.SubagentStart', () => ({}))

    await $.tool.call({ tool: 'Grep', pattern: 'secret-pattern' })
    await $.classic.SubagentStart({ agent_id: 'a06e5ae9xyz', agent_type: 'Explore' })
    const pane = await mount($, surface)

    expect((await pane.find({ type: 'Text', text: /^Turns:/ }))?.text).toBe('Turns: 0 · tool calls: 1')
    expect((await pane.find({ type: 'Text', text: 'Top tools: Grep 1' }))?.text).toBe('Top tools: Grep 1')
    expect((await pane.find({ type: 'Text', text: 'Agents:' }))?.props.bold).toBe(true)
    expect(await pane.find({ type: 'Text', text: /Explore: 0 turns, 0 tool calls/ })).toBeDefined()
    expect(JSON.stringify(await pane.drawn())).not.toContain('secret-pattern')
  })
}

test('the office pane redraws as the session records tool calls', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: 'ok' as never }))

  const pane = await mount($, 'terminal')
  expect((await pane.find({ type: 'Text', text: /^Turns:/ }))?.text).toBe('Turns: 0 · tool calls: 0')

  await $.tool.call({ tool: 'Read', file_path: '/repo/a.md' })

  expect((await pane.find({ type: 'Text', text: /^Turns:/ }))?.text).toBe('Turns: 0 · tool calls: 1')
})
