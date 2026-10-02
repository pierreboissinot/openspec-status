import { openspecRepoList } from './openspec-repo'

export const storeList = {
  ...openspecRepoList,
  root: { path: '/home/dev/demo-plans', source: 'declared', store_id: 'demo-plans' },
}
