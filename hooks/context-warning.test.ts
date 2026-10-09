import { describe, expect, test } from 'claude-code/testing'

import { doctorReferenceUnresolved } from './fixtures/doctor-reference-unresolved'
import { noRootList } from './fixtures/no-root'
import { openspecRepoList } from './fixtures/openspec-repo'
import { unknownStoreList } from './fixtures/unknown-store'
import { clear, createWorld, measure, runCommand, startSession } from './test-world'

const ADVICE = 'Write down what matters in an artifact, then start a fresh session or /clear.'

const CHANGE = 'add-global-install-scope'

describe('context levels', () => {
  test('78% reaches the warning level', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 78)

    expect(world.state.contextFill).toEqual({ percent: 78, level: 'warning' })
  })

  test('91% reaches the critical level', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 91)

    expect(world.state.contextFill).toEqual({ percent: 91, level: 'critical' })
  })

  test('74% stays below every level', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 74)

    expect(world.state.contextFill ?? null).toBe(null)
    expect(world.statusAndToasts).toEqual([])
  })

  test('a fill not reported yet stays below every level', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($)

    expect(world.state.contextFill ?? null).toBe(null)
    expect(world.statusAndToasts).toEqual([])
  })
})

describe('context toasts', () => {
  test('crossing the warning level shows one toast for 10 seconds', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 72)
    await measure($, 78)

    expect(world.toasts).toEqual([{ text: `Context 78% full. ${ADVICE}`, timeoutMs: 10_000 }])
  })

  test('a fill growing within a level shows no new toast', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 78)
    await measure($, 84)

    expect(world.toasts).toHaveLength(1)
  })

  test('crossing the critical level shows a new toast', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 78)
    await measure($, 91)

    expect(world.toasts.map(toast => toast.text)).toEqual([`Context 78% full. ${ADVICE}`, `Context 91% full. ${ADVICE}`])
  })

  test('crossing both levels in one turn shows one toast', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 72)
    await measure($, 91)

    expect(world.toasts.map(toast => toast.text)).toEqual([`Context 91% full. ${ADVICE}`])
  })
})

describe('context settings', () => {
  test('with the critical level off, 95% stays a warning', { options: { contextCriticalPercent: 0 } }, async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 78)
    await measure($, 95)

    expect(world.toasts).toHaveLength(1)
    expect(world.statusLines.at(-1)).toBe('context 95%!, write down and /clear')
  })

  test(
    'with both levels off, nothing is shown',
    { options: { contextWarningPercent: 0, contextCriticalPercent: 0 } },
    async ($, on) => {
      const world = createWorld(on, { list: noRootList })
      await startSession($, world)
      await measure($, 95)

      expect(world.statusAndToasts).toEqual([])
    },
  )
})

describe('context toast text', () => {
  test('without OpenSpec, advises to write down and start over', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 78)

    expect(world.toasts.map(toast => toast.text)).toEqual([`Context 78% full. ${ADVICE}`])
  })

  test('at the critical level without an active change, gives the same advice', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'main' })
    await startSession($, world)
    await measure($, 91)

    expect(world.toasts.map(toast => toast.text)).toEqual([`Context 91% full. ${ADVICE}`])
  })

  test('with an active change, names the workflow to capture and resume it', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: CHANGE })
    await startSession($, world)
    await measure($, 78)

    expect(world.toasts.map(toast => toast.text)).toEqual([
      `Context 78% full. Capture where you are in ${CHANGE} (/opsx:update ${CHANGE}), then /clear and resume with /opsx:apply ${CHANGE}.`,
    ])
  })

  test('with an unregistered store, gives the advice without a change', async ($, on) => {
    const world = createWorld(on, { list: unknownStoreList })
    await startSession($, world)
    await measure($, 78)

    expect(world.toasts.map(toast => toast.text)).toEqual([`Context 78% full. ${ADVICE}`])
  })
})

describe('context re-arming', () => {
  test('/clear drops the segment at once', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: CHANGE })
    await startSession($, world)
    await world.settle()
    await measure($, 78)
    expect(world.statusLines.at(-1)).toBe(`openspec  ${CHANGE}  0/38 tasks · context 78%!`)

    await clear($)

    expect(world.statusLines.at(-1)).toBe(`openspec  ${CHANGE}  0/38 tasks`)
  })

  test('/clear drops the segment from the session end, before any other hook', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await world.settle()
    await measure($, 78)

    await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'session' } })

    expect(world.statusLines).toEqual(['context 78%!, write down and /clear', undefined])
  })

  test('/clear shows the change named like the branch, not the workflow one', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: CHANGE })
    await startSession($, world)
    await world.settle()
    await runCommand($, 'opsx:apply', 'fix-schemas-root-selection')
    await measure($, 78)

    await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'session' } })

    expect(world.statusLines.at(-1)).toBe(`openspec  ${CHANGE}  0/38 tasks`)
  })

  test('after a compaction, crossing the warning level again shows a new toast', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 78)
    await measure($)
    await measure($, 20)
    await measure($, 76)

    expect(world.toasts.map(toast => toast.text)).toEqual([`Context 78% full. ${ADVICE}`, `Context 76% full. ${ADVICE}`])
  })

  test('coming back to the critical level shows a new toast', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 91)
    await measure($, 85)
    await measure($, 92)

    expect(world.toasts.map(toast => toast.text)).toEqual([`Context 91% full. ${ADVICE}`, `Context 92% full. ${ADVICE}`])
  })
})

describe('status line context', () => {
  test('follows the active change at the warning level', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: CHANGE })
    await startSession($, world)
    await world.settle()
    await measure($, 78)

    expect(world.statusLines.at(-1)).toBe(`openspec  ${CHANGE}  0/38 tasks · context 78%!`)
  })

  test('is marked at the critical level', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: CHANGE })
    await startSession($, world)
    await world.settle()
    await measure($, 91)

    expect(world.statusLines.at(-1)).toBe(`openspec  ${CHANGE}  0/38 tasks · context 91%⚠`)
  })

  test('comes before the health finding', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: CHANGE, doctor: doctorReferenceUnresolved })
    await startSession($, world)
    await world.settle()
    await measure($, 78)

    expect(world.statusLines.at(-1)).toBe(`openspec  ${CHANGE}  0/38 tasks · context 78%! · team-plans not registered +1`)
  })

  test('stands alone without an active change', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'main' })
    await startSession($, world)
    await world.settle()
    await measure($, 78)

    expect(world.statusLines).toEqual(['openspec  context 78%!'])
  })

  test('comes before an unregistered store', async ($, on) => {
    const world = createWorld(on, { list: unknownStoreList })
    await startSession($, world)
    await measure($, 78)

    expect(world.statusLines.at(-1)).toBe('openspec  context 78%! · store not registered')
  })

  test('follows the fill at each measurement', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: CHANGE })
    await startSession($, world)
    await world.settle()
    await measure($, 78)
    await measure($, 82)

    expect(world.statusLines.at(-1)).toBe(`openspec  ${CHANGE}  0/38 tasks · context 82%!`)
  })
})

describe('context outside OpenSpec', () => {
  for (const [name, list] of [
    ['no OpenSpec root', noRootList],
    ['the CLI cannot start', 'reject'],
  ] as const) {
    test(`with ${name}, only the context warning shows`, async ($, on) => {
      const world = createWorld(on, { list })
      await startSession($, world)
      await world.settle()
      await measure($, 78)

      expect(world.statusAndToasts).toEqual([`toast: Context 78% full. ${ADVICE}`, 'status: context 78%!, write down and /clear'])
      expect(world.registeredCommands).toEqual([])
    })
  }

  test('below every level, nothing shows', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)
    await measure($, 50)

    expect(world.statusAndToasts).toEqual([])
  })

  test('leaving the project keeps the warning on its own', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: CHANGE })
    await startSession($, world)
    await world.settle()
    await measure($, 78)

    world.list = noRootList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/elsewhere' })

    expect(world.statusLines.at(-1)).toBe('context 78%!, write down and /clear')
  })

  test('/clear without an active change removes the line', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'main' })
    await startSession($, world)
    await world.settle()
    await measure($, 78)

    await clear($)

    expect(world.statusLines).toEqual(['openspec  context 78%!', undefined])
  })
})
