export const globalDefaultUnknownStoreList = {
  "changes": [],
  "root": null,
  "status": [
    {
      "severity": "error",
      "code": "unknown_store",
      "message": "Global defaultStore 'old-plans': Unknown store 'old-plans'. Registered stores: demo-plans.",
      "target": "store.id",
      "fix": "Register the store (openspec store register <path> --id old-plans) or clear the stale global default (openspec config unset defaultStore)."
    }
  ]
}
