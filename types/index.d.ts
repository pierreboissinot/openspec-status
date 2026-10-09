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

/** A read of the CLI that failed, with the reason shown in the pane. */
export type Failed = { error: string }

export type SpecsSummary = { count: number; requirements: number }

export type ArtifactState = { id: string; status: string }

export type ChangeStatus = { schema: string; artifacts: ArtifactState[] }

export type ChangeTask = { description: string; done: boolean }

export type ShownChange = {
  name: string
  status: ChangeStatus | Failed
  tasks: ChangeTask[] | Failed
}

export type PaneTab = 'overview' | 'change'

export type PaneView = {
  tab: PaneTab
  /** The change picked in Overview, shown instead of the active one while it is listed. */
  pick: string | null
}

export type PaneData = {
  /** The cwd the pane's data was read in. */
  cwd: string
  /** `null` outside a local or store root, where nothing is read. */
  specs: SpecsSummary | Failed | null
  /** `null` when no change is picked or active. */
  shown: ShownChange | null
}

export type ContextFill = {
  /** Percent of the model's window, as `session.measure` reports it. */
  percent: number
  level: 'warning' | 'critical'
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
      /** `null` while the pane is closed. */
      pane: PaneData | null
      /** What the person chose in the pane; only presses, a close and a cwd change write it. */
      paneView: PaneView
      /** The main session's context fill once it reaches a level; `null` below every level. */
      contextFill: ContextFill | null
    }
  }
}
