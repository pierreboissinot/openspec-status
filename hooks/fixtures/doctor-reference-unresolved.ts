import { doctorStoreBehind } from './doctor-store-behind'

export const doctorReferenceUnresolved = {
  ...doctorStoreBehind,
  "references": [
    {
      "store_id": "team-plans",
      "status": [
        {
          "severity": "warning",
          "code": "reference_unresolved",
          "message": "Referenced store 'team-plans' is not registered on this machine.",
          "target": "references",
          "fix": "git clone -- git@github.com:dev/team-plans.git '/home/dev/openspec/team-plans' && openspec store register '/home/dev/openspec/team-plans' --id team-plans"
        }
      ]
    }
  ]
}
