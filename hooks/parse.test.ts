import { describe, expect, test } from 'claude-code/testing'

import { localList } from './fixtures/local'
import { noRootList } from './fixtures/no-root'
import { storeList } from './fixtures/store'
import { unknownStoreList } from './fixtures/unknown-store'
import { parseListOutput } from './register'

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
