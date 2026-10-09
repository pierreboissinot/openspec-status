import { describe, expect, test } from 'claude-code/testing'

import { localList } from './fixtures/local'
import { noRootList } from './fixtures/no-root'
import { storeList } from './fixtures/store'
import { declaredNoRegisteredStoresList } from './fixtures/declared-no-registered-stores'
import { globalDefaultUnknownStoreList } from './fixtures/global-default-unknown-store'
import { invalidStorePointerList } from './fixtures/invalid-store-pointer'
import { unknownStoreList } from './fixtures/unknown-store'
import { unusableStoreList } from './fixtures/unusable-store'
import { parseListOutput } from './register'

const failedList = (code: string, message: string) => ({
  changes: [],
  root: null,
  status: [{ severity: 'error', code, message, target: 'store.metadata', fix: 'Run openspec store doctor team-plans to inspect it.' }],
})

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

  test('a declared store without a healthy root gives unusable-store with the CLI message and fix', () => {
    const [status] = unusableStoreList.status

    expect(parseListOutput(JSON.stringify(unusableStoreList))).toEqual({
      kind: 'unusable-store',
      message: status?.message,
      code: 'unhealthy_store_root',
      fix: status?.fix,
      changes: [],
    })
  })

  test('a declared store with mismatched identity gives unusable-store', () => {
    const list = failedList('store_identity_mismatch', "Declared in /home/dev/project/openspec/config.yaml: Store 'team-plans' is missing identity metadata.")

    expect(parseListOutput(JSON.stringify(list))?.kind).toBe('unusable-store')
  })

  test('an invalid store declaration gives unusable-store with the CLI message and fix', () => {
    const [status] = invalidStorePointerList.status

    expect(parseListOutput(JSON.stringify(invalidStorePointerList))).toEqual({
      kind: 'unusable-store',
      message: status?.message,
      code: 'invalid_store_pointer',
      fix: status?.fix,
      changes: [],
    })
  })

  test('a declared store with no store registered gives unknown-store with the CLI fix', () => {
    const parsed = parseListOutput(JSON.stringify(declaredNoRegisteredStoresList))

    expect(parsed?.kind).toBe('unknown-store')
    expect(parsed?.fix).toBe(declaredNoRegisteredStoresList.status[0]?.fix)
  })

  test('an unregistered global defaultStore gives none', () => {
    expect(parseListOutput(JSON.stringify(globalDefaultUnknownStoreList))).toEqual({ kind: 'none', changes: [] })
  })

  test('an unusable global defaultStore gives none', () => {
    const list = failedList('unhealthy_store_root', "Global defaultStore 'old-plans': Store 'old-plans' does not have a healthy OpenSpec root.")

    expect(parseListOutput(JSON.stringify(list))).toEqual({ kind: 'none', changes: [] })
  })

  test('unparsable output gives null', () => {
    expect(parseListOutput('')).toBe(null)
    expect(parseListOutput('Error: something went wrong')).toBe(null)
    expect(parseListOutput('[]')).toBe(null)
  })
})
