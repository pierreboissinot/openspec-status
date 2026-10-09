export type ContextKind = 'local' | 'store' | 'unknown-store' | 'unusable-store' | 'none'

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
  /** The CLI's resolution error, in `unusable-store`. */
  message?: string
  code?: string
  cwd: string
  changes: ChangeSummary[]
  /** The git branch of `cwd`, absent outside a repository or on a detached HEAD. */
  branch?: string
  /** The active change: the workflow's when listed, else the one named like `branch`. */
  currentChange?: string
}

export type HealthFinding = {
  severity: string
  code: string
  message: string
  fix?: string
  /** A few English words naming what is affected and how, for the status line. */
  summary: string
}

export type OpenSpecHealth = {
  /** The cwd `openspec doctor --json` ran in. */
  cwd: string
  /** The unhealthy findings, most important first. */
  findings: HealthFinding[]
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'openspec-status': {
      /** `null` until the first refresh of the session, even a failed one. */
      context: OpenSpecContext | null
      /** The change last named by an OpenSpec workflow in this session, listed or not. */
      workflowChange: string | null
      lastError: string | null
      /** `null` outside a local or store root, and until its first `openspec doctor --json`. */
      health: OpenSpecHealth | null
      /** Counts the health reads started; a read that ends after a newer one started is dropped. */
      healthRead: number
    }
  }
}
