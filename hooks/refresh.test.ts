import { describe, expect, test } from 'claude-code/testing'

import { noRootList } from './fixtures/no-root'
import { storeList } from './fixtures/store'
import { createWorld, endTurn, runBash, startSession } from './test-world'

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
    await $.classic.SessionStart({ source: 'clear' })

    expect(world.state.context?.currentChange).toBe(undefined)
  })
})

describe('triggers', () => {
  test('session start runs openspec once in the session cwd', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    expect(world.openspecRuns).toEqual(['/home/dev/OpenSpec'])
  })

  test('/clear runs openspec once', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    world.openspecRuns.length = 0

    await $.classic.SessionStart({ source: 'clear' })

    expect(world.openspecRuns).toHaveLength(1)
  })

  test('a cwd change runs openspec once in the new cwd and updates the context', async ($, on) => {
    const world = createWorld(on, { list: noRootList, cwd: '/home/dev/elsewhere' })
    await startSession($, world)
    expect(world.state.context?.kind).toBe('none')
    world.openspecRuns.length = 0

    world.list = storeList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/elsewhere', new_cwd: '/home/dev/OpenSpec' })

    expect(world.openspecRuns).toEqual(['/home/dev/OpenSpec'])
    expect(world.state.context?.kind).toBe('store')
  })

  test('a cwd change out of the project gives none', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    world.list = noRootList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/elsewhere' })

    expect(world.state.context?.kind).toBe('none')
  })

  test('a main-loop turn end runs openspec once and rereads the task counts', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    world.openspecRuns.length = 0

    const ticked = structuredClone(storeList)
    ticked.changes.find(change => change.name === 'add-global-install-scope')!.completedTasks = 3
    world.list = ticked
    await endTurn($)

    expect(world.openspecRuns).toHaveLength(1)
    const ticking = world.state.context?.changes.find(change => change.name === 'add-global-install-scope')
    expect(ticking?.completedTasks).toBe(3)
  })

  test('a subagent turn end runs nothing', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    world.openspecRuns.length = 0

    await endTurn($, 'subagent-1')

    expect(world.openspecRuns).toHaveLength(0)
  })
})
