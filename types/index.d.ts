export type ContextKind = 'local' | 'store' | 'unknown-store' | 'none'

export type ChangeSummary = {
  name: string
  completedTasks: number
  totalTasks: number
  lastModified: string
  status: string
}

export type OpenSpecContext = {
  kind: ContextKind
  storeId?: string
  fix?: string
  cwd: string
  changes: ChangeSummary[]
  /** The git branch of `cwd`, absent outside a repository or on a detached HEAD. */
  branch?: string
  /** The active change: the workflow's when listed, else the one named like `branch`. */
  currentChange?: string
}

declare module 'claude-code' {
  interface PluginState {
    'openspec-status': {
      /** `null` until the first refresh of the session, even a failed one. */
      context: OpenSpecContext | null
      /** The change last named by an OpenSpec workflow in this session, listed or not. */
      workflowChange: string | null
      lastError: string | null
    }
  }
}
