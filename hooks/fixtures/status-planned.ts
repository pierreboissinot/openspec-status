export const statusPlanned = {
  "changeName": "surface-unresolvable-store",
  "schemaName": "spec-driven",
  "planningHome": {
    "kind": "repo",
    "root": "/home/dev/project",
    "changesDir": "/home/dev/project/openspec/changes",
    "defaultSchema": "spec-driven"
  },
  "changeRoot": "/home/dev/project/openspec/changes/surface-unresolvable-store",
  "artifactPaths": {
    "proposal": {
      "outputPath": "proposal.md",
      "resolvedOutputPath": "/home/dev/project/openspec/changes/surface-unresolvable-store/proposal.md",
      "existingOutputPaths": [
        "/home/dev/project/openspec/changes/surface-unresolvable-store/proposal.md"
      ]
    },
    "specs": {
      "outputPath": "specs/**/*.md",
      "resolvedOutputPath": "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/**/*.md",
      "existingOutputPaths": [
        "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/change-status-line/spec.md",
        "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/openspec-command/spec.md",
        "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/openspec-context-detection/spec.md",
        "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/openspec-health/spec.md"
      ]
    },
    "design": {
      "outputPath": "design.md",
      "resolvedOutputPath": "/home/dev/project/openspec/changes/surface-unresolvable-store/design.md",
      "existingOutputPaths": [
        "/home/dev/project/openspec/changes/surface-unresolvable-store/design.md"
      ]
    },
    "tasks": {
      "outputPath": "tasks.md",
      "resolvedOutputPath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "existingOutputPaths": [
        "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md"
      ]
    }
  },
  "isPlanningComplete": true,
  "isComplete": true,
  "applyRequires": [
    "tasks"
  ],
  "nextSteps": [
    "All planning artifacts are complete. Run openspec instructions apply --change \"surface-unresolvable-store\" --json to inspect implementation progress."
  ],
  "actionContext": {
    "mode": "repo-local",
    "sourceOfTruth": "repo",
    "planningArtifacts": [
      "proposal",
      "specs",
      "design",
      "tasks"
    ],
    "linkedContext": [],
    "allowedEditRoots": [
      "/home/dev/project"
    ],
    "requiresAffectedAreaSelection": false,
    "constraints": [
      "Repo-local change artifacts and implementation edits are scoped to this project."
    ]
  },
  "artifacts": [
    {
      "id": "proposal",
      "outputPath": "proposal.md",
      "status": "done",
      "requires": []
    },
    {
      "id": "specs",
      "outputPath": "specs/**/*.md",
      "status": "done",
      "requires": [
        "proposal"
      ]
    },
    {
      "id": "design",
      "outputPath": "design.md",
      "status": "done",
      "requires": [
        "proposal"
      ]
    },
    {
      "id": "tasks",
      "outputPath": "tasks.md",
      "status": "done",
      "requires": [
        "specs",
        "design"
      ]
    }
  ],
  "root": {
    "path": "/home/dev/project",
    "source": "nearest"
  }
}
