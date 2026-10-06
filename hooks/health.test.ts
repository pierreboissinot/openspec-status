import { describe, expect, test } from 'claude-code/testing'

import { doctorHealthy } from './fixtures/doctor-healthy'
import { doctorNoRoot } from './fixtures/doctor-no-root'
import { doctorNoise } from './fixtures/doctor-noise'
import { doctorReferenceUnresolved } from './fixtures/doctor-reference-unresolved'
import { doctorStoreBehind } from './fixtures/doctor-store-behind'
import { localList } from './fixtures/local'
import { noRootList } from './fixtures/no-root'
import { storeList } from './fixtures/store'
import { unknownStoreList } from './fixtures/unknown-store'
import { parseDoctorOutput } from './register'
import { createWorld, endTurn, pendingDoctor, runCommand, startSession } from './test-world'

const parse = (json: unknown) => parseDoctorOutput(JSON.stringify(json))

const summaries = (json: unknown) => {
  const parsed = parse(json)
  return typeof parsed === 'string' ? parsed : parsed.map(finding => finding.summary)
}

const localWith = (status: unknown[], healthy = false) => ({
  ...doctorHealthy,
  root: { ...doctorHealthy.root, healthy, status },
})

const behindBy = (behind: number, ahead = 0) => ({
  ...doctorStoreBehind,
  store: { ...doctorStoreBehind.store, drift: { ahead, behind } },
})

describe('unhealthy findings', () => {
  test('a healthy local root gives none', () => {
    expect(parse(doctorHealthy)).toEqual([])
  })

  test('a store behind its upstream gives a drift finding', () => {
    expect(parse(doctorStoreBehind)).toEqual([
      {
        severity: 'info',
        code: 'store_checkout_drift',
        message:
          'This store checkout is 3 commits behind its upstream tracking branch; teammates on newer commits may resolve different specs.',
        summary: 'store 3 commits behind',
      },
    ])
  })

  test('a store only ahead gives none', () => {
    expect(parse({ ...doctorStoreBehind, store: { ...doctorStoreBehind.store, drift: { ahead: 2, behind: 0 }, status: [] } })).toEqual([])
  })

  test('a remote divergence and a truncated reference index give none', () => {
    expect(parse(doctorNoise)).toEqual([])
  })

  test('an unregistered reference is retained with its fix', () => {
    const parsed = parse(doctorReferenceUnresolved)

    expect(typeof parsed === 'string' ? parsed : parsed[0]).toEqual({
      severity: 'warning',
      code: 'reference_unresolved',
      message: "Referenced store 'team-plans' is not registered on this machine.",
      fix: expect.stringContaining('openspec store register'),
      summary: 'team-plans not registered',
    })
  })
})

describe('order and summaries', () => {
  test('a store one commit behind', () => {
    expect(summaries(behindBy(1))).toEqual(['store 1 commit behind'])
  })

  test('a diverged store is summarized by how far behind it is', () => {
    expect(summaries(behindBy(3, 2))).toEqual(['store 3 commits behind'])
  })

  test('a warning comes before the store drift', () => {
    expect(summaries(doctorReferenceUnresolved)).toEqual(['team-plans not registered', 'store 3 commits behind'])
  })

  test('errors come first, then warnings by provenance: root, store, references, report', () => {
    const json = {
      ...doctorReferenceUnresolved,
      root: { ...doctorStoreBehind.root, status: [{ severity: 'warning', code: 'root_pointer_ignored', message: '' }] },
      status: [
        { severity: 'warning', code: 'relationship_registry_unreadable', message: '' },
        { severity: 'error', code: 'store_lock_stale', message: '' },
      ],
    }

    expect(summaries(json)).toEqual([
      'store_lock_stale',
      'store: line ignored',
      'team-plans not registered',
      'store registry unreadable',
      'store 3 commits behind',
    ])
  })

  test('a local root without config.yaml', () => {
    expect(summaries(localWith([{ severity: 'error', code: 'openspec_config_missing', message: 'config.yaml is missing.' }]))).toEqual([
      'config.yaml missing',
    ])
  })

  test('a planning folder that is not a directory', () => {
    expect(summaries(localWith([{ severity: 'error', code: 'openspec_changes_not_directory', message: '' }]))).toEqual([
      'changes/ not a directory',
    ])
  })

  test('an invalid reference is summarized without its identifier', () => {
    const json = {
      ...doctorHealthy,
      references: [{ store_id: 'Not A Store!', status: [{ severity: 'warning', code: 'reference_invalid_id', message: '' }] }],
    }

    expect(summaries(json)).toEqual(['invalid reference'])
  })

  test('an unknown code is summarized by the code itself', () => {
    expect(summaries({ ...doctorHealthy, status: [{ severity: 'warning', code: 'store_lock_stale', message: '' }] })).toEqual([
      'store_lock_stale',
    ])
  })

  test('an unknown root inspection error is summarized as root unhealthy', () => {
    expect(summaries(localWith([{ severity: 'error', code: 'openspec_schema_unreadable', message: '' }]))).toEqual([
      'root unhealthy',
    ])
  })
})

describe('unusable output', () => {
  test('text that is not JSON gives a reason', () => {
    expect(parseDoctorOutput('Error: something')).toEqual(expect.stringContaining('unparsable'))
  })

  test('no root gives a reason', () => {
    expect(parse({ root: null, store: null, references: [], status: [] })).toEqual(expect.stringContaining('no root'))
  })
})

describe('health triggers', () => {
  test('/openspec runs doctor once and waits for it', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    world.doctor = doctorStoreBehind
    await runCommand($, 'openspec')

    expect(world.openspecRuns).toEqual(['list /home/dev/OpenSpec', 'doctor /home/dev/OpenSpec'])
    expect(world.state.health?.findings.map(finding => finding.summary)).toEqual(['store 3 commits behind'])
  })

  test('a turn end never runs doctor', async ($, on) => {
    const world = createWorld(on, { list: storeList })
    await startSession($, world)
    await world.settle()
    world.openspecRuns.length = 0

    await endTurn($)
    await world.settle()

    expect(world.openspecRuns.filter(run => run.startsWith('doctor'))).toEqual([])
  })

  for (const [name, list] of [
    ['no OpenSpec root', noRootList],
    ['an unknown store', unknownStoreList],
  ] as const) {
    test(`with ${name} doctor never runs and no finding is retained`, async ($, on) => {
      const world = createWorld(on, { list, doctor: doctorStoreBehind })
      await startSession($, world)
      await $.classic.SessionStart({ source: 'clear' })
      await world.settle()

      expect(world.openspecRuns.filter(run => run.startsWith('doctor'))).toEqual([])
      expect(world.state.health ?? null).toBe(null)
    })
  }

  test('leaving the project forgets the findings without running doctor', async ($, on) => {
    const world = createWorld(on, { list: storeList, doctor: doctorStoreBehind })
    await startSession($, world)
    await world.settle()
    expect(world.state.health?.findings).toHaveLength(1)
    world.openspecRuns.length = 0

    world.list = noRootList
    await $.classic.CwdChanged({ old_cwd: '/home/dev/OpenSpec', new_cwd: '/home/dev/elsewhere' })
    await world.settle()

    expect(world.openspecRuns).toEqual(['list /home/dev/elsewhere'])
    expect(world.state.health).toBe(null)
  })

  test('the session starts without waiting for doctor', async ($, on) => {
    const doctor = pendingDoctor()
    const world = createWorld(on, { list: storeList, doctor })

    await startSession($, world)
    expect(world.state.context?.kind).toBe('store')
    expect(world.state.health ?? null).toBe(null)

    doctor.resolve(doctorStoreBehind)
    await world.settle()
    expect(world.state.health?.findings).toHaveLength(1)
  })

  test('a read of the previous cwd that ends last is dropped', async ($, on) => {
    const world = createWorld(on, { list: noRootList, cwd: '/home/dev/elsewhere' })
    await startSession($, world)
    await world.settle()

    const plans = pendingDoctor()
    world.list = storeList
    world.doctor = plans
    await $.classic.CwdChanged({ old_cwd: '/home/dev/elsewhere', new_cwd: '/home/dev/demo-plans' })

    const notes = pendingDoctor()
    world.list = localList
    world.doctor = notes
    await $.classic.CwdChanged({ old_cwd: '/home/dev/demo-plans', new_cwd: '/home/dev/notes' })

    notes.resolve(doctorHealthy)
    await world.settle()
    plans.resolve(doctorStoreBehind)
    await world.settle()

    expect(world.openspecRuns.filter(run => run.startsWith('doctor'))).toEqual([
      'doctor /home/dev/demo-plans',
      'doctor /home/dev/notes',
    ])
    expect(world.state.health).toEqual({ cwd: '/home/dev/notes', findings: [] })
    expect(world.statusLines.filter(line => line?.includes('behind'))).toEqual([])
  })

  test('an older read of the same cwd that ends last is dropped', async ($, on) => {
    const older = pendingDoctor()
    const world = createWorld(on, { list: storeList, doctor: older })
    await startSession($, world)

    world.doctor = doctorHealthy
    await runCommand($, 'openspec')
    older.resolve(doctorStoreBehind)
    await world.settle()

    expect(world.state.health).toEqual({ cwd: '/home/dev/OpenSpec', findings: [] })
  })
})

describe('doctor failure', () => {
  for (const [name, failing] of [
    ['the CLI cannot start', 'reject'],
    ['the output is not JSON', 'Error: unexpected token'],
    ['doctor resolves no root', doctorNoRoot],
  ] as const) {
    test(`when ${name}, the findings are dropped and the reason goes to debug only`, async ($, on) => {
      const world = createWorld(on, { list: storeList, doctor: doctorStoreBehind })
      await startSession($, world)
      await world.settle()
      expect(world.state.health?.findings).toHaveLength(1)

      world.doctor = failing
      await $.classic.SessionStart({ source: 'clear' })
      await world.settle()

      expect(world.state.health).toEqual({ cwd: '/home/dev/OpenSpec', findings: [], error: expect.any(String) })
      expect(world.logs).toEqual([{ text: expect.stringContaining('openspec doctor --json'), to: 'debug' }])
      expect(world.statusAndToasts.filter(entry => entry.startsWith('toast'))).toEqual([])
    })
  }
})
