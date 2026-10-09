import { atom, read, update } from 'claude-code'
import type {
  BoxProps,
  ButtonProps,
  ElementConstructor,
  EngineInterface,
  Register,
  RenderElement,
  TextProps,
} from 'claude-code'

import type {
  ChangeStatus,
  ChangeSummary,
  ChangeTask,
  ContextFill,
  ContextKind,
  Failed,
  HealthFinding,
  OpenSpecContext,
  OpenSpecHealth,
  PaneData,
  PaneTab,
  PaneView,
  ShownChange,
  SpecsSummary,
} from '../types'

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

const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    : []

const diagnostics = (status: unknown): Diagnostic[] => objects(status)

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

const parseJsonObject = (stdout: string): Record<string, unknown> | null => {
  try {
    const json: unknown = JSON.parse(stdout)
    return typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const parseSpecsOutput = (stdout: string): SpecsSummary | string => {
  const json = parseJsonObject(stdout)
  if (json === null || !Array.isArray(json.specs)) return 'unparsable `openspec list --specs --json` output'
  const specs = objects(json.specs)
  return { count: specs.length, requirements: specs.reduce((sum, spec) => sum + (Number(spec.requirementCount) || 0), 0) }
}

export const parseStatusOutput = (stdout: string): ChangeStatus | string => {
  const json = parseJsonObject(stdout)
  if (json === null || typeof json.schemaName !== 'string' || !Array.isArray(json.artifacts)) {
    return 'unparsable `openspec status --json` output'
  }
  const artifacts = objects(json.artifacts).flatMap(artifact =>
    typeof artifact.id === 'string' && typeof artifact.status === 'string' ? [{ id: artifact.id, status: artifact.status }] : [],
  )
  return { schema: json.schemaName, artifacts }
}

export const parseApplyOutput = (stdout: string): ChangeTask[] | string => {
  const json = parseJsonObject(stdout)
  if (json === null || !Array.isArray(json.tasks)) return 'unparsable `openspec instructions apply --json` output'
  return objects(json.tasks).flatMap(task =>
    typeof task.description === 'string' ? [{ description: task.description, done: task.done === true }] : [],
  )
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
export const paneAtom = atom({ plugin: 'openspec-status', key: 'pane' } as const, null)
const FRESH_VIEW: PaneView = { tab: 'overview', pick: null }
export const paneViewAtom = atom({ plugin: 'openspec-status', key: 'paneView' } as const, FRESH_VIEW)

export const PANE = 'openspec'
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
    await $.command.register({
      name: 'openspec',
      description: 'Refresh the active OpenSpec change and summarize the changes',
      argumentHint: '[view]',
    })
  }
  return context
}


/**
 * Resolves the cleared session after `/clear`'s own run. There, `$.state` still reads as before the clear while
 * writes land in the cleared session, so every value is passed along rather than read back; the line on screen
 * is the one `session.end` left, computed from that same pre-clear state.
 */
const afterClear = async ($: EngineInterface, cwd: string): Promise<OpenSpecContext> => {
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
  if (!hasRoot(context.kind)) return context

  const health = await diagnose($, cwd)
  await update($, healthAtom, () => health)
  const withHealth = statusText(context, health, null)
  if (withHealth !== line) writeLine($, line, withHealth)
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

const readCli = async <T extends object>(
  $: EngineInterface,
  args: string[],
  cwd: string,
  parse: (stdout: string) => T | string,
): Promise<T | Failed> => {
  let error: string
  try {
    const { stdout, stderr } = await $.process.run(['openspec', ...args], { cwd, timeoutMs: 10_000 })
    const parsed = parse(stdout)
    if (typeof parsed !== 'string') return parsed
    error = stderr.trim().split('\n')[0] || `${parsed} in ${cwd}`
  } catch (reason) {
    error = `\`openspec ${args.join(' ')}\` failed in ${cwd}: ${reason instanceof Error ? reason.message : String(reason)}`
  }
  $.ui.log(`openspec-status: ${error}`, { to: 'debug' })
  return { error }
}

// Every $.state read of one dispatch sees one moment, so a counter kept there cannot tell a long read that a newer one started.
let paneReads = 0

export const shownName = (context: OpenSpecContext, pick: string | null): string | null =>
  pick !== null && context.changes.some(change => change.name === pick) ? pick : (context.currentChange ?? null)

const readShown = async ($: EngineInterface, cwd: string, name: string): Promise<ShownChange> => {
  const [status, tasks] = await Promise.all([
    readCli($, ['status', '--change', name, '--json'], cwd, parseStatusOutput),
    readCli($, ['instructions', 'apply', '--change', name, '--json'], cwd, parseApplyOutput),
  ])
  return { name, status, tasks }
}

export const refreshPane = async (
  $: EngineInterface,
  context: OpenSpecContext,
  { withSpecs = true }: { withSpecs?: boolean } = {},
): Promise<void> => {
  const ticket = ++paneReads
  const previous = await read($, paneAtom)
  const kept = previous?.cwd === context.cwd ? previous : null
  let data: PaneData
  if (!hasRoot(context.kind)) {
    data = { cwd: context.cwd, specs: null, shown: null }
  } else {
    const name = shownName(context, (await read($, paneViewAtom)).pick)
    const [specs, shown] = await Promise.all([
      withSpecs || kept === null
        ? readCli($, ['list', '--specs', '--json'], context.cwd, parseSpecsOutput)
        : kept.specs,
      name === null ? null : readShown($, context.cwd, name),
    ])
    data = { cwd: context.cwd, specs, shown }
  }
  if (ticket !== paneReads) return
  await update($, paneAtom, () => data)
}

const isPaneOpen = async ($: EngineInterface): Promise<boolean> => (await $.ui.panes()).some(pane => pane.id === PANE)

const refreshOpenPane = async ($: EngineInterface, context: OpenSpecContext): Promise<void> => {
  if (await isPaneOpen($)) await refreshPane($, context)
}

const nameWorkflowChange = async ($: EngineInterface, name: string): Promise<void> => {
  await update($, workflowChangeAtom, () => name)
  const context = await read($, contextAtom)
  if (context !== null && hasRoot(context.kind)) {
    const named = withCurrent(context, name)
    await writeContext($, named)
    const pane = await read($, paneAtom)
    if (pane !== null && pane.shown?.name !== shownName(named, (await read($, paneViewAtom)).pick) && (await isPaneOpen($))) {
      await refreshPane($, named, { withSpecs: false })
    }
  }
}

const knownNames = (context: OpenSpecContext | null): string[] =>
  context !== null && hasRoot(context.kind) ? context.changes.map(change => change.name) : []

const sourceOf = (context: OpenSpecContext): string =>
  context.kind === 'store' ? (context.storeId ? `store:${context.storeId}` : 'store') : 'local'

const summaryLine = (context: OpenSpecContext): string => {
  if (context.kind === 'none') return `openspec: no OpenSpec root resolved from ${context.cwd}`
  if (context.kind === 'unknown-store') return `openspec: unknown store, ${context.fix ?? ''}`
  if (context.kind === 'unusable-store') return 'openspec: unusable store'
  const source = sourceOf(context)
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

export type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type PaneInput = {
  context: OpenSpecContext | null
  health: OpenSpecHealth | null
  pane: PaneData | null
  view: PaneView
  columns: number
  onTab: (tab: PaneTab) => Promise<void>
  onPick: (name: string) => Promise<void>
}

const isFailed = (value: object): value is Failed => 'error' in value

const progressOf = (change: ChangeSummary): string =>
  change.totalTasks === 0 ? 'no tasks' : `${change.completedTasks}/${change.totalTasks}`

const fitted = (text: string, width: number): string =>
  text.length <= width ? text.padEnd(width) : `${text.slice(0, Math.max(0, width - 1))}…`

const MIN_BAR = 5

const overviewOf = (el: PaneElements, input: PaneInput, context: OpenSpecContext, pane: PaneData): RenderElement[] => {
  const { Box, Text, Button } = el
  const source = sourceOf(context)
  const specs =
    pane.specs === null ? '' : isFailed(pane.specs) ? `unavailable: ${pane.specs.error}` : `${pane.specs.count} specs, ${pane.specs.requirements} requirements`
  const countWidth = Math.max(0, ...context.changes.map(change => progressOf(change).length))
  const labelWidth = Math.min(
    Math.max(0, ...context.changes.map(change => change.name.length + 2)),
    Math.max(4, input.columns - countWidth - 1),
  )
  const barWidth = input.columns - labelWidth - countWidth - 2
  const rows = context.changes.map(change => {
    const marker = change.name === context.currentChange ? '● ' : '  '
    const share = change.totalTasks === 0 ? undefined : Math.min(1, Math.max(0, change.completedTasks / change.totalTasks))
    const filled = share === undefined ? 0 : Math.round(share * barWidth)
    return Box({
      key: `row-${change.name}`,
      flexDirection: 'row',
      columnGap: 1,
      children: [
        Button({
          key: `change-${change.name}`,
          label: fitted(marker + change.name, labelWidth),
          plain: true,
          onPress: () => input.onPick(change.name),
        }),
        Text({ dimColor: change.totalTasks === 0, children: [progressOf(change).padStart(countWidth)] }),
        ...(share === undefined || barWidth < MIN_BAR ? [] : [Text({ children: ['█'.repeat(filled) + '░'.repeat(barWidth - filled)] })]),
      ],
    })
  })
  const findings = input.health?.cwd === context.cwd ? input.health.findings : []
  const health = findings.flatMap(finding => [
    Text({ color: finding.severity === 'error' ? 'error' : 'warning', wrap: 'wrap', children: [finding.message] }),
    ...(finding.fix === undefined ? [] : [Text({ dimColor: true, wrap: 'wrap', children: [`Fix: ${finding.fix}`] })]),
  ])
  return [
    Text({ bold: true, children: [source] }),
    ...(specs === '' ? [] : [Text({ dimColor: true, children: [specs] })]),
    Text({ children: [' '] }),
    ...(rows.length === 0 ? [Text({ dimColor: true, children: ['No active change.'] })] : rows),
    ...(health.length === 0 ? [] : [Text({ children: [' '] }), Text({ bold: true, children: ['Health'] }), ...health]),
  ]
}

const changeTabOf = (el: PaneElements, input: PaneInput, context: OpenSpecContext, pane: PaneData): RenderElement[] => {
  const { Text } = el
  const expected = shownName(context, input.view.pick)
  if (expected === null) return [Text({ dimColor: true, children: ['No active change: pick one in Overview (1).'] })]
  const shown = pane.shown
  if (shown === null || shown.name !== expected) return [Text({ dimColor: true, children: ['loading…'] })]
  const artifacts = isFailed(shown.status)
    ? [Text({ color: 'error', wrap: 'wrap', children: [`unavailable: ${shown.status.error}`] })]
    : (() => {
        const width = Math.max(0, ...shown.status.artifacts.map(artifact => artifact.id.length))
        return shown.status.artifacts.map(artifact =>
          Text({
            color: artifact.status === 'done' ? 'success' : undefined,
            dimColor: artifact.status === 'blocked' || artifact.status === 'skipped',
            children: [`${artifact.id.padEnd(width)}  ${artifact.status}`],
          }),
        )
      })()
  const tasks = isFailed(shown.tasks)
    ? [Text({ color: 'error', wrap: 'wrap', children: [`unavailable: ${shown.tasks.error}`] })]
    : shown.tasks.length === 0
      ? [Text({ dimColor: true, children: ['No tasks yet.'] })]
      : shown.tasks.map(task =>
          Text({ dimColor: task.done, wrap: 'truncate-end', children: [`${task.done ? '[x]' : '[ ]'} ${task.description}`] }),
        )
  const schema = isFailed(shown.status) ? [] : [Text({ dimColor: true, children: [shown.status.schema] })]
  return [
    Text({ bold: true, children: [shown.name] }),
    ...schema,
    Text({ children: [' '] }),
    ...artifacts,
    Text({ children: [' '] }),
    ...tasks,
  ]
}

export const paneTree = (el: PaneElements, input: PaneInput): RenderElement => {
  const { Box, Text, Button } = el
  const { context, pane } = input
  const column = (children: RenderElement[]) => Box({ flexDirection: 'column', children })
  if (context === null || pane === null || pane.cwd !== context.cwd) {
    return column([Text({ dimColor: true, children: ['loading…'] })])
  }
  if (context.kind === 'none') return column([Text({ children: [summaryLine(context)] })])
  if (context.kind === 'unknown-store') {
    return column([
      Text({ bold: true, children: ['store not registered'] }),
      Text({ wrap: 'wrap', children: [`Fix: ${context.fix ?? ''}`] }),
    ])
  }
  if (context.kind === 'unusable-store') {
    return column([
      Text({ bold: true, children: ['store unusable'] }),
      Text({ wrap: 'wrap', children: [context.message ?? ''] }),
      ...(context.fix === undefined ? [] : [Text({ wrap: 'wrap', children: [`Fix: ${context.fix}`] })]),
    ])
  }
  const tab = (name: PaneTab, label: string, hotkey: string) =>
    Button({
      key: `tab-${name}`,
      label,
      hotkey,
      plain: true,
      dimColor: input.view.tab !== name,
      onPress: () => input.onTab(name),
    })
  return column([
    Box({ flexDirection: 'row', columnGap: 3, children: [tab('overview', 'Overview', '1'), tab('change', 'Change', '2')] }),
    Text({ children: [' '] }),
    ...(input.view.tab === 'overview' ? overviewOf(el, input, context, pane) : changeTabOf(el, input, context, pane)),
  ])
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
    await refreshOpenPane($, await afterClear($, await $.session.cwd()))
    return result
  })

  on('command.run', { command: 'openspec' }, async ($, e) => {
    const context = await refresh($, await $.session.cwd())
    if (e.args.trim() === 'view' && context.kind !== 'none') {
      await Promise.all([readHealth($, context), refreshPane($, context)])
      await $.ui.open({ id: PANE, title: 'OpenSpec', closeOnEscape: true })
      return {}
    }
    await Promise.all([readHealth($, context), refreshOpenPane($, context)])
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
    await update($, paneViewAtom, view => ({ ...view, pick: null }))
    const context = await refresh($, e.new_cwd)
    startHealthRead($, context)
    await refreshOpenPane($, context)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const cwd = await $.session.cwd()
      const previous = await read($, contextAtom)
      const hasMoved = previous !== null && previous.cwd !== cwd
      if (hasMoved) {
        await update($, workflowChangeAtom, () => null)
        await update($, paneViewAtom, view => ({ ...view, pick: null }))
      }
      const context = await refresh($, cwd)
      if (hasMoved) startHealthRead($, context)
      await refreshOpenPane($, context)
    }
    return result
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const [context, health, pane, view] = await Promise.all([
      read($, contextAtom),
      read($, healthAtom),
      read($, paneAtom),
      read($, paneViewAtom),
    ])
    return paneTree(
      { Box, Text, Button },
      {
        context,
        health,
        pane,
        view,
        columns: e.props.bodyColumns,
        onTab: async tab => {
          await update($, paneViewAtom, current => ({ ...current, tab }))
        },
        onPick: async name => {
          await update($, paneViewAtom, (): PaneView => ({ tab: 'change', pick: name }))
          const current = await read($, contextAtom)
          if (current !== null) await refreshPane($, current, { withSpecs: false })
        },
      },
    )
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE) {
      paneReads++
      await update($, paneAtom, () => null)
      await update($, paneViewAtom, () => FRESH_VIEW)
    }
    return result
  })
}
