import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangeSummary, ContextKind, OpenSpecContext } from '../types'

export type ParsedList = Pick<OpenSpecContext, 'kind' | 'storeId' | 'fix' | 'changes'>

type ListJson = {
  changes?: unknown
  root?: { source?: string; store_id?: string } | null
  status?: { code?: string; message?: string; fix?: string }[]
}

const toSummary = (raw: Record<string, unknown>): ChangeSummary => ({
  name: String(raw.name ?? ''),
  completedTasks: Number(raw.completedTasks ?? 0),
  totalTasks: Number(raw.totalTasks ?? 0),
  lastModified: String(raw.lastModified ?? ''),
  status: String(raw.status ?? ''),
})

export const parseListOutput = (stdout: string): ParsedList | null => {
  let json: ListJson
  try {
    json = JSON.parse(stdout)
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null || !('root' in json)) {
    return null
  }

  if (json.root) {
    const changes = Array.isArray(json.changes) ? json.changes.map(toSummary) : []
    if (json.root.source === 'declared') {
      return json.root.store_id
        ? { kind: 'store', storeId: json.root.store_id, changes }
        : { kind: 'store', changes }
    }
    return { kind: 'local', changes }
  }

  const unknownStore = json.status?.find(s => s.code === 'unknown_store')
  if (unknownStore) {
    return { kind: 'unknown-store', fix: unknownStore.fix ?? unknownStore.message ?? '', changes: [] }
  }
  return { kind: 'none', changes: [] }
}

const unquote = (token: string): string => token.replace(/^["']+|["']+$/g, '')

const LAUNCHERS = new Set(['npx', 'pnpx', 'bunx', 'npm', 'pnpm', 'yarn', 'bun', 'exec', 'dlx', 'command', 'env', 'time', 'sudo'])

const isLauncher = (token: string): boolean =>
  LAUNCHERS.has(token) || token.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)

const isOpenspec = (token: string): boolean => /(?:^|\/)openspec(?:@[^/]*)?$/.test(token)

const shellSegments = (command: string): string[][] => {
  const segments: string[][] = [[]]
  let token: string | null = null
  let quote: string | null = null
  const endToken = () => {
    if (token !== null) segments[segments.length - 1]?.push(token)
    token = null
  }
  for (let i = 0; i < command.length; i++) {
    const char = command.charAt(i)
    if (quote !== null) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && /["\\$`]/.test(command.charAt(i + 1))) token = (token ?? '') + command.charAt(++i)
      else token = (token ?? '') + char
    } else if (char === '"' || char === "'") {
      quote = char
      token ??= ''
    } else if (char === '\\') {
      token = (token ?? '') + command.charAt(++i)
    } else if (char === '\n' || /[;&|()]/.test(char)) {
      endToken()
      segments.push([])
    } else if (/\s/.test(char)) {
      endToken()
    } else {
      token = (token ?? '') + char
    }
  }
  endToken()
  return segments
}

export const changeFromOpenspecCommand = (command: string, knownNames: readonly string[]): string | undefined => {
  for (const tokens of shellSegments(command)) {
    const start = tokens.findIndex(isOpenspec)
    if (start === -1 || !tokens.slice(0, start).every(isLauncher)) continue
    const args = tokens.slice(start + 1)

    const flag = args.findIndex(arg => arg === '--change' || arg.startsWith('--change='))
    if (flag !== -1) {
      const value = args[flag] === '--change' ? args[flag + 1] : args[flag]?.slice('--change='.length)
      if (value && !value.startsWith('-')) return value
    }
    if (args[0] === 'new' && args[1] === 'change' && args[2] && !args[2].startsWith('-')) {
      return args[2]
    }
    const named = args.find(arg => knownNames.includes(arg))
    if (named) return named
  }
  return undefined
}

export const contextAtom = atom({ plugin: 'openspec-status', key: 'context' } as const, null)
export const workflowChangeAtom = atom({ plugin: 'openspec-status', key: 'workflowChange' } as const, null)
export const lastErrorAtom = atom({ plugin: 'openspec-status', key: 'lastError' } as const, null)

const hasRoot = (kind: ContextKind): boolean => kind === 'local' || kind === 'store'

const withCurrent = (context: OpenSpecContext, workflowChange: string | null): OpenSpecContext => {
  const { currentChange: _previous, ...rest } = context
  const isListed = (name: string | null | undefined): name is string =>
    typeof name === 'string' && context.changes.some(change => change.name === name)
  const current = isListed(workflowChange) ? workflowChange : isListed(context.branch) ? context.branch : undefined
  return current === undefined ? rest : { ...rest, currentChange: current }
}

export const statusText = (context: OpenSpecContext | null): string | undefined => {
  if (context === null || !hasRoot(context.kind)) return undefined
  const change = context.changes.find(candidate => candidate.name === context.currentChange)
  if (!change) return undefined
  const progress = change.totalTasks === 0 ? 'no tasks' : `${change.completedTasks}/${change.totalTasks} tasks`
  return `openspec  ${change.name}  ${progress}`
}

const writeContext = async ($: EngineInterface, context: OpenSpecContext): Promise<void> => {
  const previous = await read($, contextAtom)
  await update($, contextAtom, () => context)
  const text = statusText(context)
  if (text !== undefined) {
    $.ui.status(text)
  } else if (statusText(previous) !== undefined) {
    $.ui.status(undefined)
  }
}

const readBranch = async ($: EngineInterface, cwd: string): Promise<string | undefined> => {
  try {
    const { exitCode, stdout } = await $.process.run(['git', 'branch', '--show-current'], { cwd, timeoutMs: 5_000 })
    const branch = stdout.trim()
    return exitCode === 0 && branch !== '' ? branch : undefined
  } catch {
    return undefined
  }
}

const listChanges = async ($: EngineInterface, cwd: string): Promise<ParsedList | string> => {
  try {
    const { stdout } = await $.process.run(['openspec', 'list', '--json'], { cwd, timeoutMs: 10_000 })
    return parseListOutput(stdout) ?? `unparsable \`openspec list --json\` output in ${cwd}`
  } catch (error) {
    return `\`openspec list --json\` failed in ${cwd}: ${error instanceof Error ? error.message : String(error)}`
  }
}

export const refresh = async ($: EngineInterface, cwd: string): Promise<OpenSpecContext> => {
  const listed = await listChanges($, cwd)

  if (typeof listed === 'string') {
    await update($, lastErrorAtom, () => listed)
    $.ui.log(`openspec-status: ${listed}`, { to: 'debug' })
    const kept = withCurrent((await read($, contextAtom)) ?? { kind: 'none', cwd, changes: [] }, await read($, workflowChangeAtom))
    await writeContext($, kept)
    return kept
  }

  const branch = hasRoot(listed.kind) ? await readBranch($, cwd) : undefined
  const resolved: OpenSpecContext = branch === undefined ? { ...listed, cwd } : { ...listed, cwd, branch }
  const context = withCurrent(resolved, await read($, workflowChangeAtom))

  await update($, lastErrorAtom, () => null)
  await writeContext($, context)
  if (context.kind !== 'none') {
    await $.command.register({ name: 'openspec', description: 'Refresh the active OpenSpec change and summarize the changes' })
  }
  return context
}

const nameWorkflowChange = async ($: EngineInterface, name: string): Promise<void> => {
  await update($, workflowChangeAtom, () => name)
  const context = await read($, contextAtom)
  if (context !== null && hasRoot(context.kind)) {
    await writeContext($, withCurrent(context, name))
  }
}

const knownNames = (context: OpenSpecContext | null): string[] =>
  context !== null && hasRoot(context.kind) ? context.changes.map(change => change.name) : []

export const commandAnswer = (context: OpenSpecContext): string => {
  if (context.kind === 'none') return `openspec: no OpenSpec root resolved from ${context.cwd}`
  if (context.kind === 'unknown-store') return `openspec: unknown store, ${context.fix ?? ''}`
  const source = context.kind === 'store' ? (context.storeId ? `store:${context.storeId}` : 'store') : 'local'
  const count = context.changes.length
  return `openspec: ${source}, ${count} active change${count === 1 ? '' : 's'}`
}

export const register: Register = on => {
  on('command.run', { command: 'openspec' }, async $ => {
    const answer = commandAnswer(await refresh($, await $.session.cwd()))
    const error = await read($, lastErrorAtom)
    return { text: error === null ? answer : `${answer} (refresh failed: ${error})` }
  })

  on('command.run', { command: /^opsx:/ }, async ($, e, next) => {
    const context = await read($, contextAtom)
    const first = unquote(e.args.trim().split(/\s+/)[0] ?? '')
    if (knownNames(context).includes(first)) {
      await nameWorkflowChange($, first)
    }
    return next(e)
  })

  on('tool.call', { tool: 'Bash', command: /\bopenspec\b/ }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined) return result
    const name = changeFromOpenspecCommand(e.command, knownNames(await read($, contextAtom)))
    if (name !== undefined) {
      await nameWorkflowChange($, name)
    }
    return result
  })

  on('session.start', async ($, e, next) => {
    await refresh($, e.cwd)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') {
      await update($, workflowChangeAtom, () => null)
      await refresh($, await $.session.cwd())
    }
    return next(e)
  })

  on('classic.CwdChanged', async ($, e, next) => {
    await update($, workflowChangeAtom, () => null)
    await refresh($, e.new_cwd)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      await refresh($, await $.session.cwd())
    }
    return result
  })
}
