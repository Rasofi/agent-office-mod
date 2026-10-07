import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description: 'Agent Office: what this session sees',
    })

    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    const [engine, surfaces, repo] = await Promise.all([
      $.session.version(),
      $.session.surfaces(),
      $.session.repo(),
    ])
    const lines = [
      `${$.plugin.name} is loaded.`,
      `Claude Code: ${engine.version}`,
      `Surfaces: ${surfaces.join(', ') || 'none'}`,
      `Repository: ${repo?.remote ?? 'none'}`,
    ]

    return { text: lines.join('\n') }
  })
}
