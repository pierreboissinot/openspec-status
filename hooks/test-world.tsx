import type { On, PaneOpenArgs } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { OpenSpecContext, OpenSpecHealth, PaneData } from '../types'
import { applyTasks } from './fixtures/apply-tasks'
import { doctorHealthy } from './fixtures/doctor-healthy'
import { specsList } from './fixtures/specs'
import { statusPlanned } from './fixtures/status-planned'

/** A printed JSON value, raw text when a string, or `'reject'` when the CLI cannot start. */
export type DoctorOutput = { root: unknown } | string

/** A printed JSON value, raw text, `'reject'` when the CLI cannot start, or a run the test resolves. */
export type CliOutput = object | string | PendingOutput

/** A run that answers once the test resolves it. */
export type PendingOutput = { pending: Promise<object | string>; resolve: (output: object | string) => void }

export const pendingOutput = (): PendingOutput => {
  let resolve: (output: object | string) => void = () => {}
  const pending = new Promise<object | string>(done => {
    resolve = done
  })
  return { pending, resolve }
}

/** A `doctor` run that answers once the test resolves it. */
export type PendingDoctor = { pending: Promise<DoctorOutput>; resolve: (output: DoctorOutput) => void }

export const pendingDoctor = (): PendingDoctor => {
  let resolve: (output: DoctorOutput) => void = () => {}
  const pending = new Promise<DoctorOutput>(done => {
    resolve = done
  })
  return { pending, resolve }
}

export type World = {
  /** What `openspec list --json` prints, or `'reject'` when the CLI cannot start. */
  list: { root: unknown; changes?: unknown } | 'reject'
  /** What `openspec doctor --json` answers, read when it starts. */
  doctor: DoctorOutput | PendingDoctor
  /** What `openspec list --specs --json` prints. */
  specs: CliOutput
  /** What `openspec status --change <name> --json` prints, by change, else `statusPlanned`. */
  status: Record<string, CliOutput>
  /** What `openspec instructions apply --change <name> --json` prints, by change, else `applyTasks`. */
  apply: Record<string, CliOutput>
  /** The ids of the panes the mod has open, in open order. */
  panes: string[]
  /** Every `$.ui.open` the mod made, as it passed it. */
  opens: PaneOpenArgs[]
  /** The current git branch; absent outside a repository or on a detached HEAD. */
  branch?: string
  cwd: string
  /** Every `openspec` run, as `'<subcommand> <cwd>'`, `'list --specs <cwd>'`, or `'<subcommand> <change> <cwd>'` for a change. */
  openspecRuns: string[]
  registeredCommands: string[]
  logs: { text: string; to: string | undefined }[]
  statusAndToasts: string[]
  /** Every `$.ui.status` the mod made, in order; `undefined` for a removal. */
  statusLines: (string | undefined)[]
  /** The mod's `$.state` as last written, by key. */
  state: {
    context?: OpenSpecContext | null
    workflowChange?: string | null
    lastError?: string | null
    health?: OpenSpecHealth | null
    pane?: PaneData | null
  }
  /** Lets the work the mod started without awaiting it run to its end. */
  settle: () => Promise<void>
}

const ran = (stdout: string, exitCode: number) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

export const createWorld = (
  on: On,
  given: Pick<World, 'list'> & Partial<Pick<World, 'doctor' | 'branch' | 'cwd' | 'specs' | 'status' | 'apply'>>,
): World => {
  const clock = mock.clock(on)
  const world: World = {
    cwd: '/home/dev/OpenSpec',
    doctor: doctorHealthy,
    specs: specsList,
    status: {},
    apply: {},
    ...given,
    panes: [],
    opens: [],
    openspecRuns: [],
    registeredCommands: [],
    logs: [],
    statusAndToasts: [],
    statusLines: [],
    state: {},
    settle: clock.settle,
  }

  on('process.run', async (_$, e) => {
    const [command, subcommand] = e.argv
    if (command === 'openspec') {
      const cwd = e.init?.cwd ?? world.cwd
      const flag = e.argv.indexOf('--change')
      const change = flag === -1 ? undefined : e.argv[flag + 1]
      const isSpecs = subcommand === 'list' && e.argv.includes('--specs')
      world.openspecRuns.push(
        isSpecs ? `list --specs ${cwd}` : change === undefined ? `${subcommand} ${cwd}` : `${subcommand} ${change} ${cwd}`,
      )
      const answer: CliOutput | DoctorOutput | PendingDoctor | World['list'] = isSpecs
        ? world.specs
        : subcommand === 'status'
          ? (world.status[change ?? ''] ?? statusPlanned)
          : subcommand === 'instructions'
            ? (world.apply[change ?? ''] ?? applyTasks)
            : subcommand === 'doctor'
              ? world.doctor
              : world.list
      const output = typeof answer === 'object' && 'pending' in answer ? await answer.pending : answer
      if (output === 'reject') {
        return { deny: 'spawn openspec ENOENT' }
      }
      if (typeof output === 'string') {
        return ran(output, 1)
      }
      return ran(JSON.stringify(output), 'root' in output && !output.root ? 1 : 0)
    }
    if (command === 'git') {
      return world.branch ? ran(`${world.branch}\n`, 0) : ran('', 128)
    }
    return { deny: `unexpected command ${command}` }
  })
  on('state.set', (_$, e, next) => {
    if (e.plugin === 'openspec-status') {
      Object.assign(world.state, { [e.key]: e.value })
    }
    return next(e)
  })
  on('command.register', (_$, e) => {
    world.registeredCommands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.log', (_$, e) => {
    world.logs.push({ text: e.text, to: e.to })
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    world.statusAndToasts.push(`status: ${String(e.text)}`)
    world.statusLines.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    world.opens.push(e)
    if (!world.panes.includes(e.id)) world.panes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    world.panes = world.panes.filter(id => id !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: world.panes.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.toast', (_$, e) => {
    world.statusAndToasts.push(`toast: ${String(e.text)}`)
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('command.run', { command: /^opsx:/ }, () => ({ text: '' }))
  on('session.cwd', () => ({ value: world.cwd }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('classic.SessionStart', () => ({}))
  on('classic.CwdChanged', () => ({}))

  return world
}

export const startSession = ($: Engine, world: World) =>
  $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

export const endTurn = ($: Engine, agentId?: string) =>
  $.turn.complete({
    answer: '',
    durationMs: 1,
    isAborted: false,
    turnId: 'turn',
    reason: 'answer',
    ...(agentId === undefined ? {} : { agentId }),
  })

export const runBash = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command })

export const mountPane = ($: Engine, bodyColumns = 80) =>
  $.ui.mount({
    plugin: 'openspec-status',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'openspec',
    props: { title: 'OpenSpec', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })

export type MountedPane = Awaited<ReturnType<typeof mountPane>>

/** The text of every Text and Button of the pane, in document order. */
export const paneLines = async (pane: MountedPane): Promise<string[]> =>
  (await pane.findAll({})).filter(element => element.type === 'Text' || element.type === 'Button').map(element => element.text)

export const runCommand = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
