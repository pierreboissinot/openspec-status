export const applyTasks = {
  "changeName": "surface-unresolvable-store",
  "changeDir": "/home/dev/project/openspec/changes/surface-unresolvable-store",
  "schemaName": "spec-driven",
  "contextFiles": {
    "proposal": [
      "/home/dev/project/openspec/changes/surface-unresolvable-store/proposal.md"
    ],
    "specs": [
      "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/change-status-line/spec.md",
      "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/openspec-command/spec.md",
      "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/openspec-context-detection/spec.md",
      "/home/dev/project/openspec/changes/surface-unresolvable-store/specs/openspec-health/spec.md"
    ],
    "design": [
      "/home/dev/project/openspec/changes/surface-unresolvable-store/design.md"
    ],
    "tasks": [
      "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md"
    ]
  },
  "progress": {
    "total": 12,
    "complete": 1,
    "remaining": 11
  },
  "tasks": [
    {
      "id": "1",
      "description": "1.1 Vérifier que `add-doctor-warning` est archivé : `openspec list --specs` liste `openspec-health`, et `openspec validate surface-unresolvable-store --strict` ne signale plus que l'archive refuserait le delta `openspec-health`",
      "done": true,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 5
    },
    {
      "id": "2",
      "description": "2.1 Ajouter `unusable-store` à `ContextKind` et `message?` / `code?` à `OpenSpecContext` dans `types/index.d.ts` (design D1) ; vérifier avec `npx -p typescript@5 tsc -p .`",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 9
    },
    {
      "id": "3",
      "description": "2.2 Ajouter les fixtures `hooks/fixtures/unusable-store.ts`, `invalid-store-pointer.ts`, `global-default-unknown-store.ts` et `declared-no-registered-stores.ts` (design D6) ; vérifier avec `tsc -p .`",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 10
    },
    {
      "id": "4",
      "description": "2.3 Étendre `parseListOutput` avec le classement de design D2 (constante de préfixe unique) ; tests dans `hooks/parse.test.ts` pour chaque scénario de « Un échec de résolution n'est attribué au store que s'il vient de la déclaration du projet » et de « Aucune racine » (`no_root_with_registered_stores` → `none`), le test existant `unknown-store` restant vert ; `claude plugin test .` passe",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 11
    },
    {
      "id": "5",
      "description": "3.1 Étendre `statusText` (design D3) ; tests reprenant les scénarios de « La ligne de statut signale un store déclaré inutilisable » : `store not registered`, `store unusable`, `store: line invalid`, ligne retirée quand `/openspec` résout le store réparé, aucune ligne avec un `defaultStore` global périmé ; `claude plugin test .` passe",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 15
    },
    {
      "id": "6",
      "description": "3.2 Test : en `unusable-store`, `doctor` n'est jamais exécuté (`world.openspecRuns` sans `doctor`) et aucune santé n'est retenue (design D5)",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 16
    },
    {
      "id": "7",
      "description": "3.3 Mettre à jour le README : ligne affichée quand le store déclaré est inutilisable (« Which change is active » / ligne de statut), `defaultStore` global ignoré ; vérifier que la ligne de version épinglée contrôlée par la CI est intacte",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 17
    },
    {
      "id": "8",
      "description": "4.1 Étendre `commandAnswer` (design D4) ; tests dans `hooks/command.test.tsx` pour les scénarios de « La commande explique un store déclaré inutilisable » et ceux de « La commande n'existe que dans un projet OpenSpec » (`unusable-store` → listée, `defaultStore` global périmé → non listée)",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 21
    },
    {
      "id": "9",
      "description": "4.2 Ajouter au tableau `/openspec` du README la ligne `unusable-store` (`openspec: unusable store` puis message et `Fix:`) et vérifier son rendu Markdown",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 22
    },
    {
      "id": "10",
      "description": "5.1 Lancer `claude plugin validate --strict .claude-plugin/plugin.json`, `claude plugin validate --strict .claude-plugin/marketplace.json`, `claude plugin test .` et `npx -p typescript@5 tsc -p .` ; tous passent",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 26
    },
    {
      "id": "11",
      "description": "5.2 Charger le mod avec `claude --plugin-dir .` depuis un dossier temporaire dont `openspec/config.yaml` vaut `store: [oops` puis `store: ghost-plans`, et constater `openspec  store: line invalid` puis `openspec  store not registered`, et la réponse de `/openspec`",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 27
    },
    {
      "id": "12",
      "description": "5.3 `openspec validate surface-unresolvable-store --strict` passe sans message",
      "done": false,
      "sourcePath": "/home/dev/project/openspec/changes/surface-unresolvable-store/tasks.md",
      "line": 28
    }
  ],
  "taskTrackingConfigured": true,
  "state": "ready",
  "instruction": "Read context files, work through pending tasks, mark complete as you go.\nPause if you hit blockers or need clarification.",
  "root": {
    "path": "/home/dev/project",
    "source": "nearest"
  }
}
