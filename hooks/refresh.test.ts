import { describe, expect, test } from 'claude-code/testing'

import { doctorStoreBehind } from './fixtures/doctor-store-behind'
import { noRootList } from './fixtures/no-root'
import { storeList } from './fixtures/store'
import { clear, createWorld, endTurn, runBash, runCommand, runEdit, runWrite, startSession } from './test-world'

describe('refresh', () => {
  test('marks the change named like the current branch', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)

    expect(world.state.context?.kind).toBe('store')
    expect(world.state.context?.storeId).toBe('demo-plans')
    expect(world.state.context?.currentChange).toBe('add-global-install-scope')
  })

  test('marks no change when the branch matches none', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'main' })
    await startSession($, world)

    expect(world.state.context?.kind).toBe('store')
    expect(world.state.context?.currentChange).toBe(undefined)
  })

  test('still resolves the context when git gives no branch', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    expect(world.state.context?.kind).toBe('store')
    expect(world.state.context?.changes).toHaveLength(30)
    expect(world.state.context?.currentChange).toBe(undefined)
  })

  test('a failing CLI with no previous context gives none and logs to debug only', async ($, on) => {
    const world = createWorld(on, { list: 'reject' })
    await startSession($, world)

    expect(world.state.context?.kind).toBe('none')
    expect(world.logs).toEqual([{ text: expect.stringContaining('openspec list --json'), to: 'debug' }])
    expect(world.state.lastError).toEqual(expect.stringContaining('openspec list --json'))
  })

  test('a failing CLI keeps the previous context', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)

    world.list = 'reject'
    await endTurn($)

    expect(world.state.context?.kind).toBe('store')
    expect(world.state.context?.currentChange).toBe('add-global-install-scope')
  })

  test('a failing CLI after /clear still forgets the workflow change', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'main' })
    await startSession($, world)
    await runBash($, 'openspec status --change add-global-install-scope --json')
    expect(world.state.context?.currentChange).toBe('add-global-install-scope')

    world.list = 'reject'
    await clear($)

    expect(world.state.context?.currentChange).toBe(undefined)
  })
})

describe('triggers', () => {
  test('session start runs list and doctor once each in the session cwd', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await world.settle()

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec', 'doctor /home/dev/OpenSpec'])
  })

  test('/clear runs list and doctor once each', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await clear($)
    await world.settle()

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec', 'doctor /home/dev/OpenSpec'])
  })

  test('a cwd change runs list and doctor once each in the new cwd and updates the context', async ($, on) => {
    const world = createWorld(on, { list: noRootList, cwd: '/home/dev/elsewhere' })
    await startSession($, world)
    await world.settle()
    expect(world.state.context?.kind).toBe('none')
    world.openspecRuns.length = 0

    world.list = storeList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/elsewhere', new_cwd: '/home/dev/OpenSpec' })
    await world.settle()

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec', 'doctor /home/dev/OpenSpec'])
    expect(world.state.context?.kind).toBe('store')
  })

  test('a cwd change out of the project gives none', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    world.list = noRootList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/elsewhere' })

    expect(world.state.context?.kind).toBe('none')
  })

  test('a main-loop turn end runs list but not doctor, and rereads the task counts', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    const ticked = structuredClone(storeList)
    ticked.changes.find(change => change.name === 'add-global-install-scope')!.completedTasks = 3
    world.list = ticked
    await endTurn($)
    await world.settle()

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec'])
    const ticking = world.state.context?.changes.find(change => change.name === 'add-global-install-scope')
    expect(ticking?.completedTasks).toBe(3)
  })

  const tasksFile = '/home/dev/demo-plans/changes/add-global-install-scope/tasks.md'

  const tickMidTurn = [
    ['an Edit of', ($: Parameters<typeof runEdit>[0]) => runEdit($, tasksFile)],
    ['a Write of', ($: Parameters<typeof runWrite>[0]) => runWrite($, tasksFile)],
    ['a Bash command on', ($: Parameters<typeof runBash>[0]) => runBash($, `sed -i '5s/^- \\[ \\]/- [x]/' ${tasksFile}`)],
  ] as const

  for (const [how, tick] of tickMidTurn) {
    test(`${how} a tasks.md runs list but not doctor, and rereads the task counts before the turn ends`, async ($, on) => {
      const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
      await startSession($, world)
      await world.settle()
      world.openspecRuns.length = 0

      const ticked = structuredClone(storeList)
      ticked.changes.find(change => change.name === 'add-global-install-scope')!.completedTasks = 3
      world.list = ticked
      await tick($)
      await world.settle()

      expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec'])
      expect(world.statusLines.at(-1)).toEqual(expect.stringContaining('3/38 tasks'))
    })
  }

  test('an Edit of another file runs nothing', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await runEdit($, '/home/dev/OpenSpec/src/tasks.ts')

    expect(world.openspecRuns).toHaveLength(0)
  })

  test('a subagent turn end runs nothing', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await endTurn($, 'subagent-1')

    expect(world.openspecRuns).toHaveLength(0)
  })
})

describe('/clear', () => {
  test('shows the change named like the branch at once, the workflow one forgotten', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await world.settle()
    await runCommand($, 'opsx:apply', 'fix-schemas-root-selection')
    expect(world.statusLines.at(-1)).toBe('openspec  fix-schemas-root-selection  13/14 tasks')

    await clear($)

    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  0/38 tasks')
    expect(world.state.workflowChange).toBe(null)
  })

  test('reads the health again and shows the finding once more', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'main', doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await clear($)

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec', 'doctor /home/dev/OpenSpec'])
    expect(world.state.health?.findings.map(finding => finding.summary)).toEqual(['store 3 commits behind'])
    expect(world.statusLines.at(-1)).toBe('openspec  store 3 commits behind')
  })

  test('outside OpenSpec, runs no doctor and shows no line', async ($, on) => {
    const world = createWorld(on, { list: noRootList, doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()

    await clear($)

    expect(world.openspecRuns.filter(run => run.startsWith('doctor'))).toEqual([])
    expect(world.statusAndToasts).toEqual([])
  })
})

describe('change of directory at turn end', () => {
  test('a new directory forgets the workflow change and reads the health there once', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'main' })
    await startSession($, world)
    await world.settle()
    await runCommand($, 'opsx:apply', 'add-global-install-scope')
    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  0/38 tasks')
    world.openspecRuns.length = 0

    world.cwd = '/home/dev/other'
    world.doctor = doctorStoreBehind
    await endTurn($)
    await world.settle()

    expect(world.openspecRuns).toEqual(['list /home/dev/other', 'doctor /home/dev/other'])
    expect(world.state.workflowChange).toBe(null)
    expect(world.statusLines.at(-1)).toBe('openspec  store 3 commits behind')
  })

  test('the same directory runs no doctor', async ($, on) => {
    const world = createWorld(on, { list: storeList, doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await endTurn($)
    await world.settle()

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec'])
  })

  test('after CwdChanged, the turn end runs no second doctor', async ($, on) => {
    const world = createWorld(on, { list: noRootList, cwd: '/home/dev/elsewhere', doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()

    world.cwd = '/home/dev/OpenSpec'
    world.list = storeList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/elsewhere', new_cwd: '/home/dev/OpenSpec' })
    await world.settle()
    world.openspecRuns.length = 0
    await endTurn($)
    await world.settle()

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec'])
  })
})
