#!/usr/bin/env node
// Checks the agent-pack role files in agents/: frontmatter, tool limits per role,
// models, the shared rule blocks, references between roles, and that nothing
// machine- or vendor-specific slipped in. `claude plugin validate` doesn't check
// agent files this closely, so CI runs this too.
//
// Usage: node scripts/check-agents.mjs [--fix]
//   --fix  rewrites the shared blocks from scripts/shared/*.md, then checks.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fix = process.argv.includes('--fix')
const errors = []
const fail = (file, message) => errors.push(`${file}: ${message}`)

const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).name

// What each role may be. Change it here and in agents/ together.
const ROSTER = {
  orchestrator: { kind: 'main' },
  'build-lead': { kind: 'lead', writes: 'scratch' },
  'review-lead': { kind: 'lead', writes: 'none' },
  coder: { kind: 'worker', writes: 'code', coding: true },
  'test-writer': { kind: 'worker', writes: 'code', coding: true },
  'docs-writer': { kind: 'worker', writes: 'docs' },
  researcher: { kind: 'worker', writes: 'none' },
  verifier: { kind: 'worker', writes: 'none' },
  'security-reviewer': { kind: 'worker', writes: 'none' },
  'compliance-reviewer': { kind: 'worker', writes: 'none' },
  'deep-reviewer': { kind: 'worker', writes: 'none' },
  scout: { kind: 'worker', writes: 'none' },
  housekeeper: { kind: 'worker', writes: 'none' },
}

const MODELS = /^(inherit|opus|sonnet|haiku|fable|claude-[a-z0-9.-]+)$/
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit']

// A generic pack names no machine, person's setup, private tool or vendor connector.
const FORBIDDEN = [
  /\/home\/[a-z]/i,
  /\/Users\//,
  /\b[A-Z]:\\/,
  /\b\d{1,3}(\.\d{1,3}){3}\b/,
  /\bmcp__/,
  /tailscale|ollama|opencode|repowise|ubersuggest|firecrawl|telegram/i,
  /supabase|cloudflare|wrangler|homelab|ai-workspace|agent-office|rasofi/i,
]

const SHARED = Object.fromEntries(
  ['rules', 'report'].map(name => [
    name,
    readFileSync(join(root, 'scripts/shared', `${name}.md`), 'utf8').trim(),
  ]),
)
const blockOf = name =>
  new RegExp(`(<!-- ${plugin}:shared ${name} -->\\n)([\\s\\S]*?)(<!-- /${plugin}:shared ${name} -->)`)

const parse = text => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  if (!match) return null
  const fields = {}
  for (const line of match[1].split('\n')) {
    const field = /^([A-Za-z]+):\s*(.*)$/.exec(line)
    if (field) fields[field[1]] = field[2].trim()
  }
  return { fields, body: match[2] }
}
const list = value => (value ?? '').split(',').map(item => item.trim()).filter(Boolean)

const dir = join(root, 'agents')
const files = readdirSync(dir).filter(file => file.endsWith('.md')).sort()
const names = files.map(file => file.replace(/\.md$/, ''))
for (const name of Object.keys(ROSTER)) {
  if (!names.includes(name)) fail('agents/', `missing ${name}.md`)
}

for (const file of files) {
  const name = file.replace(/\.md$/, '')
  const rel = `agents/${file}`
  const path = join(dir, file)
  const role = ROSTER[name]
  if (role === undefined) {
    fail(rel, 'not in the roster in scripts/check-agents.mjs')
    continue
  }

  let text = readFileSync(path, 'utf8')

  // Shared blocks: byte-identical to scripts/shared/*.md.
  const wanted = role.kind === 'main' ? ['rules'] : ['rules', 'report']
  for (const shared of wanted) {
    const opens = text.split(`<!-- ${plugin}:shared ${shared} -->`).length - 1
    const match = blockOf(shared).exec(text)
    if (opens !== 1 || match === null) {
      fail(rel, `needs exactly one shared ${shared} block (its two marker lines)`)
      continue
    }
    if (match[2].trim() !== SHARED[shared]) {
      if (fix) {
        text = text.replace(blockOf(shared), (_, open, _old, close) => `${open}${SHARED[shared]}\n${close}`)
      } else {
        fail(rel, `shared ${shared} block differs from scripts/shared/${shared}.md (run with --fix)`)
      }
    }
  }
  if (fix) writeFileSync(path, text)

  const parsed = parse(text)
  if (parsed === null) {
    fail(rel, 'no frontmatter')
    continue
  }
  const { fields, body } = parsed

  if (fields.name !== name) fail(rel, `name must be "${name}" (the file name)`)
  if (!fields.description) fail(rel, 'description missing')
  else if (!fields.description.includes(`(${plugin})`)) fail(rel, `description should name "(${plugin})"`)
  if (!MODELS.test(fields.model ?? '')) {
    fail(rel, `model "${fields.model ?? ''}" is not inherit, an alias or a claude-* id`)
  }

  const tools = list(fields.tools)
  const denied = list(fields.disallowedTools)

  if (role.kind === 'main') {
    if (fields.tools) fail(rel, 'the main-session agent keeps every tool: use disallowedTools, not tools')
    for (const tool of WRITE_TOOLS) {
      if (!denied.includes(tool)) fail(rel, `disallowedTools must include ${tool}`)
    }
    const template = readFileSync(join(root, 'templates/project-profile.md'), 'utf8').trim()
    if (!body.includes(template)) fail(rel, 'project profile block differs from templates/project-profile.md')
  } else {
    if (!fields.tools) fail(rel, 'tools list missing')
    if (!/^\d+$/.test(fields.maxTurns ?? '')) fail(rel, 'maxTurns missing')

    const hasAgent = tools.includes('Agent')
    if (role.kind === 'lead' && !hasAgent) fail(rel, 'a lead needs the Agent tool')
    // Agents may start in the background by default; a lead that doesn't wait answers before its workers report.
    if (role.kind === 'lead' && !body.includes('`run_in_background: false`')) {
      fail(rel, 'a lead must start its workers with `run_in_background: false`')
    }
    if (role.kind === 'worker' && hasAgent) fail(rel, 'workers never start agents: remove Agent')

    const writes = WRITE_TOOLS.filter(tool => tools.includes(tool))
    if (role.writes === 'none' && writes.length > 0) fail(rel, `read-only role has ${writes.join(', ')}`)
    if (role.writes === 'scratch' && (tools.includes('Edit') || tools.includes('NotebookEdit'))) {
      fail(rel, 'writes only its scratch files: Write, not Edit')
    }
    if ((role.writes === 'code' || role.writes === 'docs') && !(tools.includes('Edit') && tools.includes('Write'))) {
      fail(rel, 'a builder needs Edit and Write')
    }
    if ((role.coding || role.kind === 'lead') && fields.model === 'haiku') {
      fail(rel, 'no haiku for coding or leading')
    }
  }

  for (const ref of text.matchAll(new RegExp(`${plugin}:([a-z][a-z-]*)`, 'g'))) {
    if (ref[1] !== 'shared' && ROSTER[ref[1]] === undefined) fail(rel, `refers to unknown agent ${plugin}:${ref[1]}`)
  }

  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) fail(rel, `mentions something machine- or vendor-specific (${pattern})`)
  }
}

const settings = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8'))
if (settings.agent !== `${plugin}:orchestrator`) fail('settings.json', `agent must be "${plugin}:orchestrator"`)

if (errors.length > 0) {
  console.error(errors.join('\n'))
  console.error(`check-agents: ${errors.length} problem(s)`)
  process.exit(1)
}
console.log(`check-agents: OK, ${files.length} agents${fix ? ' (shared blocks rewritten)' : ''}`)
