import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangeSummary, ContextFill, ContextKind, HealthFinding, OpenSpecContext, OpenSpecHealth } from '../types'

export type ParsedList = Pick<OpenSpecContext, 'kind' | 'storeId' | 'fix' | 'message' | 'code' | 'changes'>

type ListJson = {
  changes?: unknown
  root?: { source?: string; store_id?: string } | null
  status?: { severity?: string; code?: string; message?: string; fix?: string }[]
}

const DECLARED_PREFIX = 'Declared in '

const UNREGISTERED_CODES = ['unknown_store', 'no_registered_stores']

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

  const error = json.status?.find(s => s.severity === 'error')
  const declared = error?.message?.startsWith(DECLARED_PREFIX) === true
  if (declared && UNREGISTERED_CODES.includes(error?.code ?? '')) {
    return { kind: 'unknown-store', fix: error?.fix ?? error?.message ?? '', changes: [] }
  }
  if (error && (declared || error.code === 'invalid_store_pointer')) {
    return {
      kind: 'unusable-store',
      message: error.message ?? '',
      ...(error.code === undefined ? {} : { code: error.code }),
      ...(error.fix === undefined ? {} : { fix: error.fix }),
      changes: [],
    }
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
export const contextFillAtom = atom({ plugin: 'openspec-status', key: 'contextFill' } as const, null)

export type ContextThresholds = { warning: number; critical: number }

export const levelOf = (percent: number | undefined, thresholds: ContextThresholds): ContextFill | null => {
  if (percent === undefined) return null
  if (thresholds.critical > 0 && percent >= thresholds.critical) return { percent, level: 'critical' }
  if (thresholds.warning > 0 && percent >= thresholds.warning) return { percent, level: 'warning' }
  return null
}

const rank = (fill: ContextFill | null): number => (fill === null ? 0 : fill.level === 'warning' ? 1 : 2)

export const contextToast = (context: OpenSpecContext | null, percent: number): string => {
  const change = context !== null && hasRoot(context.kind) ? context.currentChange : undefined
  const advice =
    change === undefined
      ? 'Write down what matters in an artifact, then start a fresh session or /clear.'
      : `Capture where you are in ${change} (/opsx:update ${change}), then /clear and resume with /opsx:apply ${change}.`
  return `Context ${percent}% full. ${advice}`
}

const hasRoot = (kind: ContextKind): boolean => kind === 'local' || kind === 'store'

const withCurrent = (context: OpenSpecContext, workflowChange: string | null): OpenSpecContext => {
  const { currentChange: _previous, ...rest } = context
  const isListed = (name: string | null | undefined): name is string =>
    typeof name === 'string' && context.changes.some(change => change.name === name)
  const current = isListed(workflowChange) ? workflowChange : isListed(context.branch) ? context.branch : undefined
  return current === undefined ? rest : { ...rest, currentChange: current }
}

export const statusText = (
  context: OpenSpecContext | null,
  health: OpenSpecHealth | null,
  fill: ContextFill | null,
): string | undefined => {
  const fillSegment = fill === null ? undefined : `context ${fill.percent}%${fill.level === 'critical' ? '⚠' : '!'}`
  if (context === null || context.kind === 'none') {
    return fillSegment && `${fillSegment}, write down and /clear`
  }
  const change = context.changes.find(candidate => candidate.name === context.currentChange)
  const progress = change && (change.totalTasks === 0 ? 'no tasks' : `${change.completedTasks}/${change.totalTasks} tasks`)
  const head = change && `${change.name}  ${progress}`
  const [first, ...others] = hasRoot(context.kind) && health?.cwd === context.cwd ? health.findings : []
  const finding = first && `${first.summary}${others.length > 0 ? ` +${others.length}` : ''}`
  const tail =
    context.kind === 'unknown-store'
      ? 'store not registered'
      : context.kind === 'unusable-store'
        ? context.code === 'invalid_store_pointer'
          ? 'store: line invalid'
          : 'store unusable'
        : finding
  const segments = [head, fillSegment, tail].filter(segment => segment !== undefined)
  return segments.length === 0 ? undefined : `openspec  ${segments.join(' · ')}`
}

const writeLine = ($: EngineInterface, before: string | undefined, after: string | undefined): void => {
  if (after !== undefined) {
    $.ui.status(after)
  } else if (before !== undefined) {
    $.ui.status(undefined)
  }
}

const currentLine = async ($: EngineInterface): Promise<string | undefined> =>
  statusText(await read($, contextAtom), await read($, healthAtom), await read($, contextFillAtom))

const writeContext = async ($: EngineInterface, context: OpenSpecContext): Promise<void> => {
  const before = await currentLine($)
  await update($, contextAtom, () => context)
  writeLine($, before, await currentLine($))
}

const writeHealth = async ($: EngineInterface, health: OpenSpecHealth | null): Promise<void> => {
  const before = await currentLine($)
  await update($, healthAtom, () => health)
  const after = await currentLine($)
  if (after !== before) writeLine($, before, after)
}

const writeFill = async ($: EngineInterface, fill: ContextFill | null): Promise<void> => {
  const before = await currentLine($)
  await update($, contextFillAtom, () => fill)
  const after = await currentLine($)
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


/**
 * Resolves the cleared session after `/clear`'s own run. There, `$.state` still reads as before the clear while
 * writes land in the cleared session, so every value is passed along rather than read back; the line on screen
 * is the one `session.end` left, computed from that same pre-clear state.
 */
const afterClear = async ($: EngineInterface, cwd: string): Promise<void> => {
  const previous = await read($, contextAtom)
  const shown = statusText(previous && withCurrent(previous, null), await read($, healthAtom), null)

  const listed = await listChanges($, cwd)
  if (typeof listed === 'string') $.ui.log(`openspec-status: ${listed}`, { to: 'debug' })
  const parsed: ParsedList = typeof listed === 'string' ? { kind: 'none', changes: [] } : listed
  const branch = hasRoot(parsed.kind) ? await readBranch($, cwd) : undefined
  const context = withCurrent(branch === undefined ? { ...parsed, cwd } : { ...parsed, cwd, branch }, null)

  await update($, contextAtom, () => context)
  await update($, workflowChangeAtom, () => null)
  await update($, healthAtom, () => null)
  await update($, contextFillAtom, () => null)
  await update($, lastErrorAtom, () => (typeof listed === 'string' ? listed : null))
  const line = statusText(context, null, null)
  if (line !== shown) writeLine($, shown, line)
  if (context.kind !== 'none') {
    await $.command.register({ name: 'openspec', description: 'Refresh the active OpenSpec change and summarize the changes' })
  }
  if (!hasRoot(context.kind)) return

  const health = await diagnose($, cwd)
  await update($, healthAtom, () => health)
  const withHealth = statusText(context, health, null)
  if (withHealth !== line) writeLine($, line, withHealth)
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
  if (context.kind === 'unusable-store') return 'openspec: unusable store'
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
  const storeError = context.kind === 'unusable-store' ? [{ message: context.message ?? '', fix: context.fix }] : []
  const findings = [...storeError, ...(current?.findings ?? [])].flatMap(finding =>
    finding.fix === undefined ? [`- ${finding.message}`] : [`- ${finding.message}`, `  Fix: ${finding.fix}`],
  )
  return [summary, ...findings].join('\n')
}

export const register: Register = (on, options) => {
  const thresholds: ContextThresholds = {
    warning: Number(options.contextWarningPercent),
    critical: Number(options.contextCriticalPercent),
  }

  on('session.measure', async ($, e, next) => {
    const fill = levelOf(e.context.percent, thresholds)
    const previous = await read($, contextFillAtom)
    if (fill !== null && rank(fill) > rank(previous)) {
      $.ui.toast(contextToast(await read($, contextAtom), fill.percent), { timeoutMs: 10_000 })
    }
    if (fill?.percent !== previous?.percent || fill?.level !== previous?.level) {
      await writeFill($, fill)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const before = await currentLine($)
      await update($, contextFillAtom, () => null)
      const context = await read($, contextAtom)
      const after = statusText(context && withCurrent(context, null), await read($, healthAtom), null)
      if (after !== before) writeLine($, before, after)
    }
    return next(e)
  })

  on('command.run', { command: 'clear' }, async ($, e, next) => {
    const result = await next(e)
    await afterClear($, await $.session.cwd())
    return result
  })

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

  on('tool.call', { tool: ['Edit', 'Write'], file_path: /(^|\/)tasks\.md$/ }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) {
      await refresh($, await $.session.cwd())
    }
    return result
  })

  on('tool.call', { tool: 'Bash', command: /\btasks\.md\b/ }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) {
      await refresh($, await $.session.cwd())
    }
    return result
  })

  on('session.start', async ($, e, next) => {
    startHealthRead($, await refresh($, e.cwd))
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
      const cwd = await $.session.cwd()
      const previous = await read($, contextAtom)
      const hasMoved = previous !== null && previous.cwd !== cwd
      if (hasMoved) await update($, workflowChangeAtom, () => null)
      const context = await refresh($, cwd)
      if (hasMoved) startHealthRead($, context)
    }
    return result
  })
}
