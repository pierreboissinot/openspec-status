export const doctorNoise = {
  "root": {
    "path": "/home/dev/demo-plans",
    "source": "declared",
    "store_id": "demo-plans",
    "healthy": true,
    "status": []
  },
  "store": {
    "id": "demo-plans",
    "metadata": {
      "present": true,
      "valid": true,
      "remote": "git@github.com:dev/demo-plans.git"
    },
    "origin_url": "https://github.com/dev/demo-plans.git",
    "status": [
      {
        "severity": "info",
        "code": "store_remote_divergence",
        "message": "The store.yaml remote (git@github.com:dev/demo-plans.git) differs from the checkout's origin (https://github.com/dev/demo-plans.git).",
        "target": "store.metadata"
      }
    ]
  },
  "references": [
    {
      "store_id": "team-plans",
      "status": [
        {
          "severity": "warning",
          "code": "reference_index_truncated",
          "message": "Referenced store 'team-plans' index truncated at the 50KB budget (212 of 340 specs listed).",
          "target": "references",
          "fix": "List the rest directly: openspec list --specs --store team-plans"
        }
      ]
    }
  ],
  "status": []
}
