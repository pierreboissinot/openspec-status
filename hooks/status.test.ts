import { describe, expect, test } from 'claude-code/testing'

import { doctorHealthy } from './fixtures/doctor-healthy'
import { doctorReferenceUnresolved } from './fixtures/doctor-reference-unresolved'
import { doctorStoreBehind } from './fixtures/doctor-store-behind'
import { globalDefaultUnknownStoreList } from './fixtures/global-default-unknown-store'
import { invalidStorePointerList } from './fixtures/invalid-store-pointer'
import { noRootList } from './fixtures/no-root'
import { openspecRepoList } from './fixtures/openspec-repo'
import { storeList } from './fixtures/store'
import { unknownStoreList } from './fixtures/unknown-store'
import { unusableStoreList } from './fixtures/unusable-store'
import { clear, createWorld, endTurn, pendingDoctor, runBash, runCommand, startSession } from './test-world'
import { changeFromOpenspecCommand } from './register'

const KNOWN = openspecRepoList.changes.map(change => change.name)

describe('changeFromOpenspecCommand', () => {
  test('reads --change with a space or an equals sign, quotes removed', () => {
    expect(changeFromOpenspecCommand('openspec status --change "add-global-install-scope" --json', KNOWN)).toBe(
      'add-global-install-scope',
    )
    expect(changeFromOpenspecCommand("openspec instructions apply --change='fix-schemas-root-selection' --json", KNOWN)).toBe(
      'fix-schemas-root-selection',
    )
  })

  test('reads the name of a new change, listed or not', () => {
    expect(changeFromOpenspecCommand('openspec new change "add-dark-mode"', KNOWN)).toBe('add-dark-mode')
  })

  test('reads an argument that names a known change', () => {
    expect(changeFromOpenspecCommand('openspec validate fix-schemas-root-selection --strict', KNOWN)).toBe(
      'fix-schemas-root-selection',
    )
  })

  test('finds the openspec segment of a compound command', () => {
    expect(changeFromOpenspecCommand('cd /home/dev/OpenSpec && openspec show add-amp-support --json | jq .', KNOWN)).toBe(
      'add-amp-support',
    )
  })

  test('ignores unknown arguments and other commands', () => {
    expect(changeFromOpenspecCommand('openspec list --json', KNOWN)).toBe(undefined)
    expect(changeFromOpenspecCommand('openspec validate not-a-change', KNOWN)).toBe(undefined)
    expect(changeFromOpenspecCommand('cat openspec/changes/add-amp-support/tasks.md', KNOWN)).toBe(undefined)
  })

  test('reads openspec run through a launcher or with environment variables', () => {
    expect(changeFromOpenspecCommand('npx -y openspec validate add-amp-support', KNOWN)).toBe('add-amp-support')
    expect(changeFromOpenspecCommand('NO_COLOR=1 openspec show add-amp-support', KNOWN)).toBe('add-amp-support')
  })

  test('ignores openspec as an argument of another command', () => {
    expect(changeFromOpenspecCommand('git commit -m "chore: openspec archive add-amp-support"', KNOWN)).toBe(undefined)
    expect(changeFromOpenspecCommand('grep -rn openspec --change add-amp-support', KNOWN)).toBe(undefined)
  })

  test('ignores a flag in place of the new change name', () => {
    expect(changeFromOpenspecCommand('openspec new change --description "Dark mode" add-dark-mode', KNOWN)).toBe(undefined)
  })

  test('ignores a flag in place of the --change value', () => {
    expect(changeFromOpenspecCommand('openspec status --change --json', KNOWN)).toBe(undefined)
  })

  test('ignores separators and line breaks inside quotes', () => {
    expect(changeFromOpenspecCommand('git commit -m "chore: tidy; openspec archive add-amp-support"', KNOWN)).toBe(undefined)
    expect(
      changeFromOpenspecCommand(`git commit -m "$(cat <<'EOF'\nchore: tidy\n\nopenspec validate add-amp-support\nEOF\n)"`, KNOWN),
    ).toBe(undefined)
  })

  test('reads openspec run as a versioned package', () => {
    expect(changeFromOpenspecCommand('npx @fission-ai/openspec@latest validate add-amp-support', KNOWN)).toBe('add-amp-support')
  })
})

describe('active change', () => {
  test('an openspec call names the active change, even on main', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'main' })
    await startSession($, world)
    expect(world.state.context?.currentChange).toBe(undefined)

    await runBash($, 'openspec status --change "add-global-install-scope" --json')

    expect(world.state.context?.currentChange).toBe('add-global-install-scope')
  })

  test('/opsx:apply <name> names the active change', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList })
    await startSession($, world)

    await runCommand($, 'opsx:apply', 'add-global-install-scope')

    expect(world.state.context?.currentChange).toBe('add-global-install-scope')
  })

  test('a quoted /opsx argument naming a change counts', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList })
    await startSession($, world)

    await runCommand($, 'opsx:explore', '"fix-schemas-root-selection"')

    expect(world.state.context?.currentChange).toBe('fix-schemas-root-selection')
  })

  test('an /opsx argument that is not a change leaves the active change', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope' })
    await startSession($, world)

    await runCommand($, 'opsx:explore', 'real-time collaboration')

    expect(world.state.context?.currentChange).toBe('add-global-install-scope')
    expect(world.state.workflowChange ?? null).toBe(null)
  })

  test('the last named change wins', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList })
    await startSession($, world)

    await runBash($, 'openspec status --change add-global-install-scope --json')
    await runBash($, 'openspec instructions apply --change fix-schemas-root-selection --json')

    expect(world.state.context?.currentChange).toBe('fix-schemas-root-selection')
  })

  test('a change created during the turn becomes active once listed', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList })
    await startSession($, world)

    await runBash($, 'openspec new change "add-dark-mode"')
    expect(world.state.context?.currentChange).toBe(undefined)

    world.list = {
      ...openspecRepoList,
      changes: [
        ...openspecRepoList.changes,
        { name: 'add-dark-mode', completedTasks: 0, totalTasks: 0, lastModified: '2026-10-02T06:00:00.000Z', status: 'no-tasks' },
      ],
    }
    await endTurn($)

    expect(world.state.context?.currentChange).toBe('add-dark-mode')
  })

  test('a change created before the root is resolved becomes active once listed', async ($, on) => {
    const world = createWorld(on, { list: noRootList })
    await startSession($, world)

    await runBash($, 'openspec init && openspec new change "add-dark-mode"')
    world.list = {
      ...openspecRepoList,
      changes: [
        ...openspecRepoList.changes,
        { name: 'add-dark-mode', completedTasks: 0, totalTasks: 0, lastModified: '2026-10-02T06:00:00.000Z', status: 'no-tasks' },
      ],
    }
    await endTurn($)

    expect(world.state.context?.currentChange).toBe('add-dark-mode')
  })

  test('without a workflow the change named like the branch is active', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope' })
    await startSession($, world)

    expect(world.state.context?.currentChange).toBe('add-global-install-scope')
  })

  test('a cwd change forgets the workflow change and falls back on the branch', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await runBash($, 'openspec status --change fix-schemas-root-selection --json')

    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/OpenSpec/src' })

    expect(world.state.context?.currentChange).toBe('add-global-install-scope')
  })

  test('/clear forgets the workflow change', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList })
    await startSession($, world)
    await runBash($, 'openspec status --change fix-schemas-root-selection --json')

    await clear($)

    expect(world.state.context?.currentChange).toBe(undefined)
  })
})

describe('status line', () => {
  test('shows the active change and its ticked tasks', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope' })
    await startSession($, world)

    expect(world.statusLines).toEqual(['openspec  add-global-install-scope  0/38 tasks'])
  })

  test('says no tasks for a change without tasks', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'schema-alias-support' })
    await startSession($, world)

    expect(world.statusLines.at(-1)).toBe('openspec  schema-alias-support  no tasks')
  })

  test('follows the tasks ticked during the turn', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope' })
    await startSession($, world)

    const ticked = structuredClone(openspecRepoList)
    ticked.changes.find(change => change.name === 'add-global-install-scope')!.completedTasks = 3
    world.list = ticked
    await endTurn($)

    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  3/38 tasks')
  })

  test('switches as soon as a workflow names another change', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope' })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await runBash($, 'openspec status --change "fix-schemas-root-selection" --json')

    expect(world.statusLines.at(-1)).toBe('openspec  fix-schemas-root-selection  13/14 tasks')
    expect(world.openspecRuns).toHaveLength(0)
  })

  test('is not set without an active change', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'main' })
    await startSession($, world)

    expect(world.statusLines).toEqual([])
  })

  test('is removed after moving to a folder without OpenSpec', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope' })
    await startSession($, world)

    world.list = noRootList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/elsewhere' })

    expect(world.statusLines).toEqual(['openspec  add-global-install-scope  0/38 tasks', undefined])
  })
})

describe('status line health', () => {
  test('ends with the most important finding', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope', doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()

    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  0/38 tasks · store 3 commits behind')
  })

  test('counts the other findings', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope', doctor: doctorReferenceUnresolved })
    await startSession($, world)
    await world.settle()

    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  0/38 tasks · team-plans not registered +1')
  })

  test('shows a finding without an active change', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'main', doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()

    expect(world.statusLines).toEqual(['openspec  store 3 commits behind'])
  })

  test('is removed when the finding is resolved without an active change', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'main', doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()

    world.doctor = doctorHealthy
    await runCommand($, 'openspec')

    expect(world.statusLines.at(-1)).toBe(undefined)
  })

  test('keeps the finding after a turn end', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope', doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()

    const ticked = structuredClone(openspecRepoList)
    ticked.changes.find(change => change.name === 'add-global-install-scope')!.completedTasks = 3
    world.list = ticked
    await endTurn($)

    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  3/38 tasks · store 3 commits behind')
  })

  test('is never set without an OpenSpec root', async ($, on) => {
    const world = createWorld(on, { list: noRootList, doctor: doctorStoreBehind })
    await startSession($, world)
    await clear($)
    await world.settle()

    expect(world.statusLines).toEqual([])
  })

  test('shows the change first, then the finding once doctor answers', async ($, on) => {
    const doctor = pendingDoctor()
    const world = createWorld(on, { list: openspecRepoList, branch: 'add-global-install-scope', doctor })
    await startSession($, world)

    expect(world.statusLines).toEqual(['openspec  add-global-install-scope  0/38 tasks'])

    doctor.resolve(doctorStoreBehind)
    await world.settle()

    expect(world.statusLines.at(-1)).toBe('openspec  add-global-install-scope  0/38 tasks · store 3 commits behind')
  })

  test('drops the previous cwd finding as soon as the cwd changes', async ($, on) => {
    const world = createWorld(on, { list: openspecRepoList, branch: 'main', doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()
    expect(world.statusLines.at(-1)).toBe('openspec  store 3 commits behind')

    world.list = {
      root: { path: '/home/dev/notes', source: 'nearest' },
      changes: [{ name: 'add-search', completedTasks: 1, totalTasks: 4, lastModified: '2026-10-02T06:00:00.000Z', status: 'in-progress' }],
    }
    world.branch = 'add-search'
    world.doctor = pendingDoctor()
    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/notes' })

    expect(world.statusLines.at(-1)).toBe('openspec  add-search  1/4 tasks')
  })
})

describe('status line unresolvable store', () => {
  test('says the declared store is not registered', async ($, on) => {
    const world = createWorld(on, { list: unknownStoreList })
    await startSession($, world)

    expect(world.statusLines).toEqual(['openspec  store not registered'])
  })

  test('says the declared store is unusable', async ($, on) => {
    const world = createWorld(on, { list: unusableStoreList })
    await startSession($, world)

    expect(world.statusLines).toEqual(['openspec  store unusable'])
  })

  test('says the store: line is invalid', async ($, on) => {
    const world = createWorld(on, { list: invalidStorePointerList })
    await startSession($, world)

    expect(world.statusLines).toEqual(['openspec  store: line invalid'])
  })

  test('is removed once /openspec resolves the repaired store', async ($, on) => {
    const world = createWorld(on, { list: unusableStoreList })
    await startSession($, world)

    world.list = storeList
    await runCommand($, 'openspec')
    await world.settle()

    expect(world.statusLines).toEqual(['openspec  store unusable', undefined])
  })

  test('is not set for a stale global defaultStore', async ($, on) => {
    const world = createWorld(on, { list: globalDefaultUnknownStoreList })
    await startSession($, world)
    await world.settle()

    expect(world.statusLines).toEqual([])
  })
})

describe('non-intrusion', () => {
  for (const [name, list] of [
    ['no OpenSpec root', noRootList],
    ['the CLI cannot start', 'reject'],
  ] as const) {
    test(`with ${name} nothing is shown and no command is registered`, async ($, on) => {
      const world = createWorld(on, { list, branch: 'add-global-install-scope' })
      await startSession($, world)
      await runBash($, 'openspec status --change add-global-install-scope --json')
      await runCommand($, 'opsx:apply', 'add-global-install-scope')
      await endTurn($)

      expect(world.statusAndToasts).toEqual([])
      expect(world.logs.filter(log => log.to !== 'debug')).toEqual([])
      expect(world.registeredCommands).toEqual([])
    })
  }
})
