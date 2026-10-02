import { describe, expect, test } from 'claude-code/testing'

import { noRootList } from './fixtures/no-root'
import { storeList } from './fixtures/store'
import { createWorld, runCommand, startSession } from './test-world'

describe('/openspec registration', () => {
  test('is not registered without an OpenSpec root', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)

    expect(world.registeredCommands).toEqual([])
  })

  test('is registered once a store is resolved at session start', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    expect(world.registeredCommands).toContain('openspec')
  })

  test('becomes available after a cwd change into a project', async ($, on) => {
    const world = createWorld(on, { list: noRootList, cwd: '/home/dev/elsewhere' })
    await startSession($, world)
    expect(world.registeredCommands).toEqual([])

    world.list = storeList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/elsewhere', new_cwd: '/home/dev/OpenSpec' })

    expect(world.registeredCommands).toContain('openspec')
  })
})

describe('/openspec run', () => {
  test('answers the source and the active change count from a fresh read', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    world.openspecRuns.length = 0

    const { text } = await runCommand($, 'openspec')

    expect(text).toBe('openspec: store:demo-plans, 30 active changes')
    expect(world.openspecRuns).toHaveLength(1)
  })

  test('updates the status line with the fresh task counts', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)

    const ticked = structuredClone(storeList)
    ticked.changes.find(change => change.name === 'add-global-install-scope')!.completedTasks = 5
    world.list = ticked
    await runCommand($, 'openspec')

    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  5/38 tasks')
  })

  test('says the refresh failed when the CLI cannot start', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    world.list = 'reject'
    const { text } = await runCommand($, 'openspec')

    expect(text).toStartWith('openspec: store:demo-plans, 30 active changes (refresh failed: ')
  })

  test('answers that no root is resolved once the context became none, and removes the status line', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)

    world.list = noRootList
    const { text } = await runCommand($, 'openspec')

    expect(text).toBe('openspec: no OpenSpec root resolved from /home/dev/OpenSpec')
    expect(world.state.context?.kind).toBe('none')
    expect(world.statusLines.at(-1)).toBe(undefined)
  })
})
