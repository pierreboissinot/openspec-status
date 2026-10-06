import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangeSummary, ContextKind, HealthFinding, OpenSpecContext, OpenSpecHealth } from '../types'

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

type Diagnostic = { severity?: unknown; code?: unknown; message?: unknown; fix?: unknown }

type DoctorJson = {
  root?: { status?: unknown } | null
  store?: { drift?: { behind?: unknown }; status?: unknown } | null
  references?: unknown
  status?: unknown
}

const diagnostics = (status: unknown): Diagnostic[] =>
  Array.isArray(status) ? status.filter((entry): entry is Diagnostic => typeof entry === 'object' && entry !== null) : []

const SUMMARIES: Record<string, string> = {
  reference_invalid_id: 'invalid reference',
  reference_registry_unreadable: 'store registry unreadable',
  relationship_registry_unreadable: 'store registry unreadable',
  root_pointer_ignored: 'store: line ignored',
  root_pointer_invalid: 'store: line invalid',
  pointer_declarations_inert: 'references inert',
  openspec_config_missing: 'config.yaml missing',
  openspec_config_not_file: 'config.yaml not a file',
  openspec_specs_not_directory: 'specs/ not a directory',
  openspec_changes_not_directory: 'changes/ not a directory',
  openspec_archive_not_directory: 'archive/ not a directory',
}

const summarize = (code: string, storeId: string | undefined, behind: number): string => {
  if (code === 'store_checkout_drift') return `store ${behind} commit${behind === 1 ? '' : 's'} behind`
  if (code === 'reference_unresolved') return `${storeId ?? 'reference'} not registered`
  if (code === 'reference_root_unhealthy') return `${storeId ?? 'reference'} unusable`
  return SUMMARIES[code] ?? (code.startsWith('openspec_') ? 'root unhealthy' : code)
}

export const parseDoctorOutput = (stdout: string): HealthFinding[] | string => {
  let json: DoctorJson
  try {
    json = JSON.parse(stdout)
  } catch {
    return 'unparsable `openspec doctor --json` output'
  }
  if (typeof json !== 'object' || json === null) return 'unparsable `openspec doctor --json` output'
  if (!json.root) {
    const reason = diagnostics(json.status).find(entry => typeof entry.message === 'string')?.message
    return `\`openspec doctor --json\` resolved no root${reason ? `: ${String(reason)}` : ''}`
  }

  const behind = Number(json.store?.drift?.behind ?? 0) || 0
  const sourced: { diagnostic: Diagnostic; storeId?: string }[] = [
    ...diagnostics(json.root.status).map(diagnostic => ({ diagnostic })),
    ...diagnostics(json.store?.status).map(diagnostic => ({ diagnostic })),
    ...diagnostics(json.references).flatMap(reference => {
      const { store_id: storeId, status } = reference as { store_id?: unknown; status?: unknown }
      return diagnostics(status).map(diagnostic =>
        typeof storeId === 'string' ? { diagnostic, storeId } : { diagnostic },
      )
    }),
    ...diagnostics(json.status).map(diagnostic => ({ diagnostic })),
  ]

  const rank = ({ severity, code }: Diagnostic): number | undefined => {
    if (code === 'store_checkout_drift') return behind > 0 ? 2 : undefined
    if (code === 'reference_index_truncated') return undefined
    return severity === 'error' ? 0 : severity === 'warning' ? 1 : undefined
  }

  return sourced
    .flatMap(({ diagnostic, storeId }) => {
      const order = rank(diagnostic)
      const { severity, code, message, fix } = diagnostic
      if (order === undefined || typeof severity !== 'string' || typeof code !== 'string') return []
      const finding: HealthFinding = {
        severity,
        code,
        message: typeof message === 'string' ? message : code,
        summary: summarize(code, storeId, behind),
      }
      return [{ order, finding: typeof fix === 'string' ? { ...finding, fix } : finding }]
    })
    .sort((a, b) => a.order - b.order)
    .map(({ finding }) => finding)
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
export const healthAtom = atom({ plugin: 'openspec-status', key: 'health' } as const, null)
export const healthReadAtom = atom({ plugin: 'openspec-status', key: 'healthRead' } as const, 0)

const hasRoot = (kind: ContextKind): boolean => kind === 'local' || kind === 'store'

const withCurrent = (context: OpenSpecContext, workflowChange: string | null): OpenSpecContext => {
  const { currentChange: _previous, ...rest } = context
  const isListed = (name: string | null | undefined): name is string =>
    typeof name === 'string' && context.changes.some(change => change.name === name)
  const current = isListed(workflowChange) ? workflowChange : isListed(context.branch) ? context.branch : undefined
  return current === undefined ? rest : { ...rest, currentChange: current }
}

export const statusText = (context: OpenSpecContext | null, health: OpenSpecHealth | null): string | undefined => {
  if (context === null || !hasRoot(context.kind)) return undefined
  const change = context.changes.find(candidate => candidate.name === context.currentChange)
  const progress = change && (change.totalTasks === 0 ? 'no tasks' : `${change.completedTasks}/${change.totalTasks} tasks`)
  const head = change && `openspec  ${change.name}  ${progress}`
  const [first, ...others] = health?.cwd === context.cwd ? health.findings : []
  const tail = first && `${first.summary}${others.length > 0 ? ` +${others.length}` : ''}`
  if (head && tail) return `${head} · ${tail}`
  return head ?? (tail ? `openspec  ${tail}` : undefined)
}

const writeLine = ($: EngineInterface, before: string | undefined, after: string | undefined): void => {
  if (after !== undefined) {
    $.ui.status(after)
  } else if (before !== undefined) {
    $.ui.status(undefined)
  }
}

const writeContext = async ($: EngineInterface, context: OpenSpecContext): Promise<void> => {
  const before = statusText(await read($, contextAtom), await read($, healthAtom))
  await update($, contextAtom, () => context)
  writeLine($, before, statusText(context, await read($, healthAtom)))
}

const writeHealth = async ($: EngineInterface, health: OpenSpecHealth | null): Promise<void> => {
  const before = statusText(await read($, contextAtom), await read($, healthAtom))
  await update($, healthAtom, () => health)
  const after = statusText(await read($, contextAtom), health)
  if (after !== before) writeLine($, before, after)
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

const diagnose = async ($: EngineInterface, cwd: string): Promise<OpenSpecHealth> => {
  let findings: HealthFinding[] | string
  try {
    const { stdout } = await $.process.run(['openspec', 'doctor', '--json'], { cwd, timeoutMs: 10_000 })
    findings = parseDoctorOutput(stdout)
  } catch (error) {
    findings = `\`openspec doctor --json\` failed in ${cwd}: ${error instanceof Error ? error.message : String(error)}`
  }
  if (typeof findings !== 'string') return { cwd, findings }
  $.ui.log(`openspec-status: ${findings}`, { to: 'debug' })
  return { cwd, findings: [], error: findings }
}

const readHealth = async ($: EngineInterface, context: OpenSpecContext): Promise<void> => {
  const ticket = await update($, healthReadAtom, count => count + 1)
  const health = hasRoot(context.kind) ? await diagnose($, context.cwd) : null
  if ((await read($, healthReadAtom)) !== ticket) return
  const current = await read($, contextAtom)
  if (current === null || current.cwd !== context.cwd) return
  await writeHealth($, health)
}

const startHealthRead = ($: EngineInterface, context: OpenSpecContext): void => {
  // The mod may be unloaded before doctor answers; its state is then refused, with no one left to tell.
  readHealth($, context).catch(() => undefined)
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

const summaryLine = (context: OpenSpecContext): string => {
  if (context.kind === 'none') return `openspec: no OpenSpec root resolved from ${context.cwd}`
  if (context.kind === 'unknown-store') return `openspec: unknown store, ${context.fix ?? ''}`
  const source = context.kind === 'store' ? (context.storeId ? `store:${context.storeId}` : 'store') : 'local'
  const count = context.changes.length
  return `openspec: ${source}, ${count} active change${count === 1 ? '' : 's'}`
}

export const commandAnswer = (
  context: OpenSpecContext,
  refreshError: string | null,
  health: OpenSpecHealth | null,
): string => {
  const current = health?.cwd === context.cwd ? health : null
  let summary = summaryLine(context)
  if (refreshError !== null) summary += ` (refresh failed: ${refreshError})`
  if (current?.error !== undefined) summary += ` (doctor failed: ${current.error})`
  const findings = (current?.findings ?? []).flatMap(finding =>
    finding.fix === undefined ? [`- ${finding.message}`] : [`- ${finding.message}`, `  Fix: ${finding.fix}`],
  )
  return [summary, ...findings].join('\n')
}

export const register: Register = on => {
  on('command.run', { command: 'openspec' }, async $ => {
    const context = await refresh($, await $.session.cwd())
    await readHealth($, context)
    return { text: commandAnswer(context, await read($, lastErrorAtom), await read($, healthAtom)) }
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
    startHealthRead($, await refresh($, e.cwd))
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') {
      await update($, workflowChangeAtom, () => null)
      startHealthRead($, await refresh($, await $.session.cwd()))
    }
    return next(e)
  })

  on('classic.CwdChanged', async ($, e, next) => {
    await update($, workflowChangeAtom, () => null)
    startHealthRead($, await refresh($, e.new_cwd))
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
