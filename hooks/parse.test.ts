import { describe, expect, test } from 'claude-code/testing'

import { applyNoTasks } from './fixtures/apply-no-tasks'
import { applyTasks } from './fixtures/apply-tasks'
import { localList } from './fixtures/local'
import { noRootList } from './fixtures/no-root'
import { specsList } from './fixtures/specs'
import { statusPlanned } from './fixtures/status-planned'
import { statusProposalOnly } from './fixtures/status-proposal-only'
import { storeList } from './fixtures/store'
import { unknownStoreList } from './fixtures/unknown-store'
import { parseApplyOutput, parseListOutput, parseSpecsOutput, parseStatusOutput } from './register'

describe('parseListOutput', () => {
  test('a declared store gives the store context with its changes', () => {
    const parsed = parseListOutput(JSON.stringify(storeList))

    expect(parsed?.kind).toBe('store')
    expect(parsed?.storeId).toBe('demo-plans')
    expect(parsed?.changes).toHaveLength(30)
    expect(parsed?.changes.find(change => change.name === 'add-global-install-scope')).toEqual({
      name: 'add-global-install-scope',
      completedTasks: 0,
      totalTasks: 38,
      lastModified: expect.any(String),
      status: 'in-progress',
    })
  })

  test('a nearest root gives the local context', () => {
    expect(parseListOutput(JSON.stringify(localList))).toEqual({ kind: 'local', changes: [] })
  })

  test('no root gives none', () => {
    expect(parseListOutput(JSON.stringify(noRootList))).toEqual({ kind: 'none', changes: [] })
  })

  test('an unregistered store gives unknown-store with the CLI fix', () => {
    const parsed = parseListOutput(JSON.stringify(unknownStoreList))

    expect(parsed?.kind).toBe('unknown-store')
    expect(parsed?.fix).toBe(unknownStoreList.status[0]?.fix)
  })

  test('unparsable output gives null', () => {
    expect(parseListOutput('')).toBe(null)
    expect(parseListOutput('Error: something went wrong')).toBe(null)
    expect(parseListOutput('[]')).toBe(null)
  })
})

describe('parseSpecsOutput', () => {
  test('counts the specs and sums their requirements', () => {
    expect(parseSpecsOutput(JSON.stringify(specsList))).toEqual({ count: 4, requirements: 17 })
  })

  test('unparsable or incomplete output gives the reason', () => {
    expect(parseSpecsOutput('Error')).toBe('unparsable `openspec list --specs --json` output')
    expect(parseSpecsOutput('{"root":null}')).toBe('unparsable `openspec list --specs --json` output')
  })
})

describe('parseStatusOutput', () => {
  test('keeps the schema and each artifact state, in order', () => {
    expect(parseStatusOutput(JSON.stringify(statusPlanned))).toEqual({
      schema: 'spec-driven',
      artifacts: [
        { id: 'proposal', status: 'done' },
        { id: 'specs', status: 'done' },
        { id: 'design', status: 'done' },
        { id: 'tasks', status: 'done' },
      ],
    })
  })

  test('a change with only its proposal has ready and blocked artifacts', () => {
    expect(parseStatusOutput(JSON.stringify(statusProposalOnly))).toEqual({
      schema: 'spec-driven',
      artifacts: [
        { id: 'proposal', status: 'done' },
        { id: 'specs', status: 'ready' },
        { id: 'design', status: 'ready' },
        { id: 'tasks', status: 'blocked' },
      ],
    })
  })

  test('unparsable or incomplete output gives the reason', () => {
    expect(parseStatusOutput('')).toBe('unparsable `openspec status --json` output')
    expect(parseStatusOutput('{"artifacts":[]}')).toBe('unparsable `openspec status --json` output')
  })
})

describe('parseApplyOutput', () => {
  test('keeps each task description and whether it is ticked, in order', () => {
    const tasks = parseApplyOutput(JSON.stringify(applyTasks))

    expect(tasks).toHaveLength(12)
    expect(Array.isArray(tasks) && tasks.map(task => task.done)).toEqual([true, ...Array(11).fill(false)])
    expect(Array.isArray(tasks) && tasks[0]?.description.startsWith('1.1 ')).toBe(true)
  })

  test('a change without tasks.md gives no task', () => {
    expect(parseApplyOutput(JSON.stringify(applyNoTasks))).toEqual([])
  })

  test('unparsable or incomplete output gives the reason', () => {
    expect(parseApplyOutput('nope')).toBe('unparsable `openspec instructions apply --json` output')
    expect(parseApplyOutput('{"state":"ready"}')).toBe('unparsable `openspec instructions apply --json` output')
  })
})
