export const doctorStoreBehind = {
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
    "origin_url": "git@github.com:dev/demo-plans.git",
    "drift": {
      "ahead": 0,
      "behind": 3
    },
    "status": [
      {
        "severity": "info",
        "code": "store_checkout_drift",
        "message": "This store checkout is 3 commits behind its upstream tracking branch; teammates on newer commits may resolve different specs.",
        "target": "store.git"
      }
    ]
  },
  "references": [],
  "status": []
}
