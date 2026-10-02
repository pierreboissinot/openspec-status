export const noRootList = {
  "changes": [],
  "root": null,
  "status": [
    {
      "severity": "error",
      "code": "no_root_with_registered_stores",
      "message": "No OpenSpec root found in the current directory or its ancestors. Registered stores: demo-plans. Pass --store <id> to use one, or run openspec init to create a local root.",
      "target": "openspec.root",
      "fix": "Rerun with --store <id> (registered: demo-plans) or run openspec init."
    }
  ]
}

