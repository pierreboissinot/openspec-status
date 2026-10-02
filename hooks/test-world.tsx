import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { OpenSpecContext } from '../types'

export type World = {
  /** What `openspec list --json` prints, or `'reject'` when the CLI cannot start. */
  list: { root: unknown; changes?: unknown } | 'reject'
  /** The current git branch; absent outside a repository or on a detached HEAD. */
  branch?: string
  cwd: string
  openspecRuns: string[]
  registeredCommands: string[]
  logs: { text: string; to: string | undefined }[]
  statusAndToasts: string[]
  /** Every `$.ui.status` the mod made, in order; `undefined` for a removal. */
  statusLines: (string | undefined)[]
  /** The mod's `$.state` as last written, by key. */
  state: { context?: OpenSpecContext | null; workflowChange?: string | null; lastError?: string | null }
}

const ran = (stdout: string, exitCode: number) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

export const createWorld = (on: On, given: Pick<World, 'list'> & Partial<Pick<World, 'branch' | 'cwd'>>): World => {
  const world: World = {
    cwd: '/home/dev/OpenSpec',
    ...given,
    openspecRuns: [],
    registeredCommands: [],
    logs: [],
    statusAndToasts: [],
    statusLines: [],
    state: {},
  }

  on('process.run', (_$, e) => {
    const [command] = e.argv
    if (command === 'openspec') {
      world.openspecRuns.push(e.init?.cwd ?? world.cwd)
      if (world.list === 'reject') {
        return { deny: 'spawn openspec ENOENT' }
      }
      return ran(JSON.stringify(world.list), world.list.root ? 0 : 1)
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

export const runCommand = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
