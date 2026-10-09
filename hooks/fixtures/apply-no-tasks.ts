export const applyNoTasks = {
  "changeName": "add-dark-mode",
  "changeDir": "/home/dev/project/openspec/changes/add-dark-mode",
  "schemaName": "spec-driven",
  "contextFiles": {
    "proposal": [
      "/home/dev/project/openspec/changes/add-dark-mode/proposal.md"
    ]
  },
  "progress": {
    "total": 0,
    "complete": 0,
    "remaining": 0
  },
  "tasks": [],
  "taskTrackingConfigured": true,
  "state": "blocked",
  "missingArtifacts": [
    "tasks"
  ],
  "missingPrerequisites": [
    "specs",
    "design",
    "tasks"
  ],
  "instruction": "Cannot apply this change yet. Missing artifacts: tasks.\nNot created yet, in build order: specs, design, tasks. Build the ones this change needs before applying - the schema says which are conditional.\nCreate each with `openspec instructions <artifact> --change add-dark-mode` (`openspec status --change add-dark-mode` shows what is left).",
  "root": {
    "path": "/home/dev/project",
    "source": "nearest"
  }
}
