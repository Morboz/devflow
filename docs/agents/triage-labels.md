# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker, and documents the devflow-specific product labels that coexist with them.

## Triage role labels

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Devflow product labels

These are not triage roles — they mark an issue's role in the devflow pipeline. They coexist with the triage labels above.

| Label            | Color    | Meaning                                                                                       |
| ---------------- | -------- | --------------------------------------------------------------------------------------------- |
| `devflow`        | `0E8A16` | Activation Label — a new issue with this label auto-triggers Refinement (ADR-0001).           |
| `devflow:prd`    | `5319E7` | PRD Issue — a Feature's root, produced by Refinement (CONTEXT.md).                            |
| `devflow:subissue` | `5319E7` | Sub-issue produced by Decomposition, linked under a PRD Issue (CONTEXT.md).                 |
| `handcrafted`    | `FBCA04` | Artifact produced by a Stage Stand-in (human), pre-Cutover (ADR-0011). Distinct from app-produced artifacts. |
