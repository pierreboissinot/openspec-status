import { describe, expect, test } from 'claude-code/testing'

import { doctorReferenceUnresolved } from './fixtures/doctor-reference-unresolved'
import { doctorStoreBehind } from './fixtures/doctor-store-behind'
import { noRootList } from './fixtures/no-root'
import { storeList } from './fixtures/store'
import { unknownStoreList } from './fixtures/unknown-store'
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
    await world.settle()
    world.openspecRuns.length = 0

    const { text } = await runCommand($, 'openspec')

    expect(text).toBe('openspec: store:demo-plans, 30 active changes')
    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec', 'doctor /home/dev/OpenSpec'])
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

describe('/openspec health findings', () => {
  test('lists a store behind its upstream under the summary', async ($, on) => {
    const world = createWorld(on, { list: storeList, doctor: doctorStoreBehind })
    await startSession($, world)

    const { text } = await runCommand($, 'openspec')

    expect(text).toBe(
      [
        'openspec: store:demo-plans, 30 active changes',
        '- This store checkout is 3 commits behind its upstream tracking branch; teammates on newer commits may resolve different specs.',
      ].join('\n'),
    )
  })

  test('follows a finding with its fix, most important first', async ($, on) => {
    const world = createWorld(on, { list: storeList, doctor: doctorReferenceUnresolved })
    await startSession($, world)

    const { text } = await runCommand($, 'openspec')

    expect(text?.split('\n')).toEqual([
      'openspec: store:demo-plans, 30 active changes',
      "- Referenced store 'team-plans' is not registered on this machine.",
      `  Fix: ${doctorReferenceUnresolved.references[0]?.status[0]?.fix}`,
      expect.stringContaining('- This store checkout is 3 commits behind'),
    ])
  })

  test('answers the summary alone when no finding is retained', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    const { text } = await runCommand($, 'openspec')

    expect(text).toBe('openspec: store:demo-plans, 30 active changes')
  })

  test('says doctor failed and lists no finding when it cannot run', async ($, on) => {
    const world = createWorld(on, { list: storeList, doctor: doctorStoreBehind })
    await startSession($, world)

    world.doctor = 'reject'
    const { text } = await runCommand($, 'openspec')

    expect(text).toStartWith('openspec: store:demo-plans, 30 active changes (doctor failed: ')
    expect(text).not.toContain('\n')
  })
})

describe('/openspec view', () => {
  test('opens the pane in a store, with nothing in the transcript and the status line updated', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    world.statusLines.length = 0

    const result = await runCommand($, 'openspec', 'view')

    expect(result).toEqual({})
    expect(world.panes).toEqual(['openspec'])
    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  0/38 tasks')
  })

  test('reads the context, the health and the pane data before opening', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await runCommand($, 'openspec', 'view')

    expect([...world.openspecRuns].sort()).toEqual(
      [
        'list /home/dev/OpenSpec',
        'doctor /home/dev/OpenSpec',
        'list --specs /home/dev/OpenSpec',
        'status add-global-install-scope /home/dev/OpenSpec',
        'instructions add-global-install-scope /home/dev/OpenSpec',
      ].sort(),
    )
    expect(world.state.pane?.shown?.name).toBe('add-global-install-scope')
  })

  test('answers like /openspec and opens no pane once the context became none', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    world.list = noRootList
    const { text } = await runCommand($, 'openspec', 'view')

    expect(text).toBe('openspec: no OpenSpec root resolved from /home/dev/OpenSpec')
    expect(world.panes).toEqual([])
  })

  test('opens the pane for a declared store that is not registered', async ($, on) => {
    const world = createWorld(on, { list: unknownStoreList })
    await startSession($, world)

    await runCommand($, 'openspec', 'view')

    expect(world.panes).toEqual(['openspec'])
    expect(world.openspecRuns.filter(run => run.startsWith('status') || run.startsWith('list --specs'))).toEqual([])
  })

  test('another argument answers the summary and opens no pane', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)

    const { text } = await runCommand($, 'openspec', 'status')

    expect(text).toBe('openspec: store:demo-plans, 30 active changes')
    expect(world.panes).toEqual([])
  })

  test('running it again keeps one pane and reads its data again', async ($, on) => {
    const world = createWorld(on, { list: storeList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runCommand($, 'openspec', 'view')
    world.openspecRuns.length = 0

    await runCommand($, 'openspec', 'view')

    expect(world.panes).toEqual(['openspec'])
    expect(world.openspecRuns).toContain('list --specs /home/dev/OpenSpec')
  })
})
