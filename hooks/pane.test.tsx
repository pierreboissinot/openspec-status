import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { applyNoTasks } from './fixtures/apply-no-tasks'
import { applyTasks } from './fixtures/apply-tasks'
import { doctorReferenceUnresolved } from './fixtures/doctor-reference-unresolved'
import { doctorStoreBehind } from './fixtures/doctor-store-behind'
import { localList } from './fixtures/local'
import { noRootList } from './fixtures/no-root'
import { statusProposalOnly } from './fixtures/status-proposal-only'
import { storeList } from './fixtures/store'
import { unknownStoreList } from './fixtures/unknown-store'
import { clear, createWorld, endTurn, mountPane, paneLines, pendingOutput, runBash, runCommand, startSession } from './test-world'

/** The engine's `$` in a test has no `ui.close`, so a plugin raises it as the close mark would. */
const closer = {
  name: 'closer',
  register(on: On) {
    on('command.run', { command: 'close-openspec-pane' }, async $ => {
      await $.ui.close({ id: 'openspec' })
      return {}
    })
  },
}

const closePane = ($: Engine) => runCommand($, 'close-openspec-pane')

const until = async (isDone: () => boolean) => {
  for (let tries = 0; !isDone(); tries++) {
    if (tries > 1_000) throw new Error('never happened')
    await new Promise(resolve => (globalThis as unknown as { setTimeout: (done: (value: unknown) => void) => void }).setTimeout(resolve))
  }
}

const ticked = (count: number) => {
  const output = structuredClone(applyTasks)
  output.tasks.forEach((task, index) => {
    task.done = index < count
  })
  return output
}

describe('pane refresh', () => {
  test('a task ticked during the turn shows as ticked once the turn ends', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    world.apply['add-global-install-scope'] = ticked(2)
    await endTurn($)

    const tasks = world.state.pane?.shown?.tasks
    expect(Array.isArray(tasks) && tasks.filter(task => task.done)).toHaveLength(2)
  })

  test('with the pane closed, a turn end runs nothing beyond the status line read', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await endTurn($)

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec'])
  })

  test('in a store of thirty changes, artifacts and tasks are read for the shown change only', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    world.openspecRuns.length = 0

    await endTurn($)

    expect([...world.openspecRuns].sort()).toEqual(
      [
        'list /home/dev/OpenSpec',
        'list --specs /home/dev/OpenSpec',
        'status add-global-install-scope /home/dev/OpenSpec',
        'instructions add-global-install-scope /home/dev/OpenSpec',
      ].sort(),
    )
  })

  test('a subagent turn end reads nothing for the pane', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    world.openspecRuns.length = 0

    await endTurn($, 'agent-1')

    expect(world.openspecRuns).toEqual([])
  })

  test('/clear reads the open pane again', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    world.openspecRuns.length = 0

    await clear($)

    expect(world.openspecRuns).toContain('list --specs /home/dev/OpenSpec')
  })

  test('a cwd change shows the changes and specs of the new project', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    world.list = localList
    world.cwd = '/home/dev/project'
    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/project' })

    expect(world.state.pane?.cwd).toBe('/home/dev/project')
    expect(world.openspecRuns).toContain('list --specs /home/dev/project')
    expect(world.state.pane?.shown).toBe(null)
  })

  test('closing the pane forgets its data and stops the reads', { plugins: [closer] }, async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    await closePane($)
    world.openspecRuns.length = 0
    await endTurn($)

    expect(world.panes).toEqual([])
    expect(world.state.pane).toBe(null)
    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec'])
  })

  test('a read that ends after a newer one started is dropped', async ($, on) => {
    const slow = pendingOutput()
    const world = createWorld(on, {
      list: storeList,
      branch: 'add-global-install-scope',
    })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    world.openspecRuns.length = 0

    world.apply['add-global-install-scope'] = slow
    const first = endTurn($)
    await until(() => world.openspecRuns.includes('instructions add-global-install-scope /home/dev/OpenSpec'))
    world.apply['add-global-install-scope'] = ticked(3)
    await runCommand($, 'openspec', 'view')
    slow.resolve(applyNoTasks)
    await first

    const tasks = world.state.pane?.shown?.tasks
    expect(Array.isArray(tasks) && tasks.filter(task => task.done)).toHaveLength(3)
  })
})

const withDarkMode = () => {
  const list = structuredClone(storeList)
  list.changes.unshift({
    name: 'add-dark-mode',
    completedTasks: 3,
    totalTasks: 7,
    lastModified: '2026-10-06T00:00:00.000Z',
    status: 'in-progress',
  })
  return list
}

describe('pane opening', () => {
  test('/openspec view opens it closable by Esc, without taking the keyboard', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    await runCommand($, 'openspec', 'view')

    expect(world.opens).toEqual([{ id: 'openspec', title: 'OpenSpec', closeOnEscape: true }])
  })

  test('a session that never runs /openspec view opens no pane', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec')
    await endTurn($)

    expect(world.opens).toEqual([])
  })
})

describe('pane tabs', () => {
  test('opens on Overview', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    const pane = await mountPane($)

    expect((await pane.find({ key: 'tab-overview' }))?.props.dimColor).toBe(false)
    expect((await pane.find({ key: 'tab-change' }))?.props.dimColor).toBe(true)
    expect(await paneLines(pane)).toContain('store:demo-plans')
  })

  test('pressing 2 shows the Change tab', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)

    await pane.press({ key: 'tab-change' })

    expect((await pane.find({ key: 'tab-change' }))?.props.dimColor).toBe(false)
    expect(await paneLines(pane)).toContain('add-global-install-scope')
    expect(await paneLines(pane)).not.toContain('store:demo-plans')
  })
})

describe('Overview', () => {
  test('shows the source, the spec and requirement counts, and each change with its tasks', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode() })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    const pane = await mountPane($)
    const lines = await paneLines(pane)

    expect(lines).toContain('store:demo-plans')
    expect(lines).toContain('4 specs, 17 requirements')
    expect((await pane.find({ key: 'change-add-dark-mode' }))?.text.trim()).toBe('add-dark-mode')
    const row = await pane.find({ key: 'row-add-dark-mode' })
    expect(row?.text).toContain('3/7')
    expect(row?.text).toMatch(/█+░+/)
  })

  test('a change without tasks says no tasks and has no bar', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    const row = await (await mountPane($)).find({ key: 'row-schema-alias-support' })

    expect(row?.text).toContain('no tasks')
    expect(row?.text).not.toMatch(/[█░]/)
  })

  test('the active change stands out from the others', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)

    expect((await pane.find({ key: 'change-add-dark-mode' }))?.text).toStartWith('● add-dark-mode')
    expect((await pane.find({ key: 'change-schema-alias-support' }))?.text).toStartWith('  schema-alias-support')
  })

  test('the bar is left out when the pane is too narrow for it', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode() })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    const row = await (await mountPane($, 40)).find({ key: 'row-add-dark-mode' })

    expect(row?.text).toContain('3/7')
    expect(row?.text).not.toMatch(/[█░]/)
  })

  test('lists each health finding with its full message', async ($, on) => {
    const world = createWorld(on, { list: storeList, doctor: doctorStoreBehind })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    expect(await paneLines(await mountPane($))).toContain(
      'This store checkout is 3 commits behind its upstream tracking branch; teammates on newer commits may resolve different specs.',
    )
  })

  test('follows a finding with its fix', async ($, on) => {
    const world = createWorld(on, { list: storeList, doctor: doctorReferenceUnresolved })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    expect(await paneLines(await mountPane($))).toContain(`Fix: ${doctorReferenceUnresolved.references[0]?.status[0]?.fix}`)
  })

  test('shows no health section without a finding', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    expect(await paneLines(await mountPane($))).not.toContain('Health')
  })
})

describe('Change: which change it shows', () => {
  test('a change picked in Overview is shown, and the status line stays on the active one', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)
    world.openspecRuns.length = 0
    const statusLine = world.statusLines.at(-1)

    await pane.press({ key: 'change-add-global-install-scope' })

    expect((await pane.find({ key: 'tab-change' }))?.props.dimColor).toBe(false)
    expect(await paneLines(pane)).toContain('add-global-install-scope')
    expect(world.statusLines.at(-1)).toBe(statusLine)
    expect(statusLine).toStartWith('openspec  add-dark-mode')
    expect([...world.openspecRuns].sort()).toEqual([
      'instructions add-global-install-scope /home/dev/OpenSpec',
      'status add-global-install-scope /home/dev/OpenSpec',
    ])
  })

  test('without a pick, the active change is shown', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)

    await pane.press({ key: 'tab-change' })

    expect(await paneLines(pane)).toContain('add-dark-mode')
  })

  test('a picked change that is no longer listed gives way to the active one', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)
    await pane.press({ key: 'change-add-global-install-scope' })

    const archived = withDarkMode()
    archived.changes = archived.changes.filter(change => change.name !== 'add-global-install-scope')
    world.list = archived
    await endTurn($)

    expect(await paneLines(pane)).toContain('add-dark-mode')
    expect(await paneLines(pane)).not.toContain('add-global-install-scope')
  })

  test('reopening the pane forgets the pick', { plugins: [closer] }, async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const before = await mountPane($)
    await before.press({ key: 'change-add-global-install-scope' })

    await closePane($)
    await before.unmount()
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)

    expect((await pane.find({ key: 'tab-overview' }))?.props.dimColor).toBe(false)
    await pane.press({ key: 'tab-change' })
    expect(await paneLines(pane)).toContain('add-dark-mode')
  })

  test('a cwd change forgets the pick', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    await (await mountPane($)).press({ key: 'change-add-global-install-scope' })

    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/OpenSpec' })

    expect(world.state.pane?.shown?.name).toBe('add-dark-mode')
  })

  test('with no active change and no pick, it points to Overview', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)

    await pane.press({ key: 'tab-change' })

    expect(await paneLines(pane)).toContain('No active change: pick one in Overview (1).')
  })
})

describe('Change: artifacts and tasks', () => {
  const openOnChange = async ($: Engine, world: ReturnType<typeof createWorld>, columns = 80) => {
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($, columns)
    await pane.press({ key: 'tab-change' })
    return pane
  }

  test('a planned change shows its schema and every artifact done', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    const lines = await paneLines(await openOnChange($, world))

    expect(lines).toContain('spec-driven')
    expect(lines).toEqual(expect.arrayContaining(['proposal  done', 'specs     done', 'design    done', 'tasks     done']))
  })

  test('a change with only its proposal shows ready and blocked artifacts', async ($, on) => {
    const world = createWorld(on, {
      list: withDarkMode(),
      branch: 'add-dark-mode',
      status: { 'add-dark-mode': statusProposalOnly },
      apply: { 'add-dark-mode': applyNoTasks },
    })
    const lines = await paneLines(await openOnChange($, world))

    expect(lines).toEqual(expect.arrayContaining(['proposal  done', 'specs     ready', 'design    ready', 'tasks     blocked']))
  })

  test('lists every task, ticked or not, in order and read-only', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    const pane = await openOnChange($, world)
    const tasks = (await paneLines(pane)).filter(line => line.startsWith('[x] ') || line.startsWith('[ ] '))

    expect(tasks).toHaveLength(12)
    expect(tasks.map(line => line.startsWith('[x]'))).toEqual([true, ...Array(11).fill(false)])
    expect(tasks[0]).toStartWith('[x] 1.1 ')
    expect((await pane.findAll({ type: 'Button' })).map(button => button.key)).toEqual(['tab-overview', 'tab-change'])
  })

  test('a task longer than the pane keeps to one truncated line', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    const pane = await openOnChange($, world, 40)
    const task = (await pane.findAll({ type: 'Text' })).find(element => element.text.startsWith('[x] 1.1 '))

    expect(task?.props.wrap).toBe('truncate-end')
  })

  test('a change without tasks.md says it has no task', async ($, on) => {
    const world = createWorld(on, {
      list: withDarkMode(),
      branch: 'add-dark-mode',
      status: { 'add-dark-mode': statusProposalOnly },
      apply: { 'add-dark-mode': applyNoTasks },
    })

    expect(await paneLines(await openOnChange($, world))).toContain('No tasks yet.')
  })
})

describe('pane without a usable root', () => {
  test('a declared store that is not registered shows the CLI fix and no tab', async ($, on) => {
    const world = createWorld(on, { list: unknownStoreList })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)

    expect(await paneLines(pane)).toContain(`Fix: ${unknownStoreList.status[0]?.fix}`)
    expect(await pane.findAll({ type: 'Button' })).toEqual([])
  })

  test('after leaving for a folder without OpenSpec, it says no root is resolved', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')

    world.list = noRootList
    world.cwd = '/home/dev/elsewhere'
    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/elsewhere' })

    expect(await paneLines(await mountPane($))).toEqual(['openspec: no OpenSpec root resolved from /home/dev/elsewhere'])
  })
})

describe('pane read failures', () => {
  test('a failed task read shows unavailable, keeps the artifacts, and goes to debug only', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode', apply: { 'add-dark-mode': 'reject' } })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)
    await pane.press({ key: 'tab-change' })
    const lines = await paneLines(pane)

    expect(lines.some(line => line.startsWith('unavailable: '))).toBe(true)
    expect(lines).toContain('proposal  done')
    expect(world.logs.some(log => log.to === 'debug' && log.text.includes('instructions apply'))).toBe(true)
    expect(world.statusAndToasts.filter(entry => entry.startsWith('toast:'))).toEqual([])
  })

  test('a failed specs read shows unavailable in Overview and keeps the changes', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), specs: 'reject' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)

    expect((await paneLines(pane)).some(line => line.startsWith('unavailable: '))).toBe(true)
    expect(await pane.find({ key: 'row-add-dark-mode' })).toBeDefined()
  })
})

describe('pane and the workflow change', () => {
  test('a workflow naming another change shows it in the Change tab before the turn ends', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    const pane = await mountPane($)
    await pane.press({ key: 'tab-change' })
    world.openspecRuns.length = 0

    await runBash($, 'openspec status --change "add-global-install-scope" --json')

    expect(await paneLines(pane)).toContain('add-global-install-scope')
    expect([...world.openspecRuns].sort()).toEqual([
      'instructions add-global-install-scope /home/dev/OpenSpec',
      'status add-global-install-scope /home/dev/OpenSpec',
    ])
  })

  test('with the pane closed, a workflow naming a change reads nothing more', async ($, on) => {
    const world = createWorld(on, { list: withDarkMode(), branch: 'add-dark-mode' })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await runBash($, 'openspec status --change "add-global-install-scope" --json')

    expect(world.openspecRuns).toEqual([])
  })
})
