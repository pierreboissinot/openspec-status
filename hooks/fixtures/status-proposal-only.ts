export const statusProposalOnly = {
  "changeName": "add-dark-mode",
  "schemaName": "spec-driven",
  "planningHome": {
    "kind": "repo",
    "root": "/home/dev/project",
    "changesDir": "/home/dev/project/openspec/changes",
    "defaultSchema": "spec-driven"
  },
  "changeRoot": "/home/dev/project/openspec/changes/add-dark-mode",
  "artifactPaths": {
    "proposal": {
      "outputPath": "proposal.md",
      "resolvedOutputPath": "/home/dev/project/openspec/changes/add-dark-mode/proposal.md",
      "existingOutputPaths": [
        "/home/dev/project/openspec/changes/add-dark-mode/proposal.md"
      ]
    },
    "specs": {
      "outputPath": "specs/**/*.md",
      "resolvedOutputPath": "/home/dev/project/openspec/changes/add-dark-mode/specs/**/*.md",
      "existingOutputPaths": []
    },
    "design": {
      "outputPath": "design.md",
      "resolvedOutputPath": "/home/dev/project/openspec/changes/add-dark-mode/design.md",
      "existingOutputPaths": []
    },
    "tasks": {
      "outputPath": "tasks.md",
      "resolvedOutputPath": "/home/dev/project/openspec/changes/add-dark-mode/tasks.md",
      "existingOutputPaths": []
    }
  },
  "isPlanningComplete": false,
  "isComplete": false,
  "applyRequires": [
    "tasks"
  ],
  "nextSteps": [
    "Run openspec instructions specs --change \"add-dark-mode\" --json before writing that artifact."
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
      "status": "ready",
      "requires": [
        "proposal"
      ]
    },
    {
      "id": "design",
      "outputPath": "design.md",
      "status": "ready",
      "requires": [
        "proposal"
      ]
    },
    {
      "id": "tasks",
      "outputPath": "tasks.md",
      "status": "blocked",
      "requires": [
        "specs",
        "design"
      ],
      "missingDeps": [
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
