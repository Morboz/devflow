# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the project glossary (Installation, Stage, Feature, Stage Run, Artifact, Plan, Plan Gate, Sandbox, Execution Engine, etc.).
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. This repo has 11 ADRs covering trigger model, async execution, domain state, lifecycle, autonomy guardrails, sandbox/git, failure cleanup, permissions, execution engine, concurrency, and dogfood strategy.

There is no `CONTEXT-MAP.md` — this is a single-context repo. If one appears later, the layout has changed to multi-context; read it to find per-context `CONTEXT.md` files.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── AGENTS.md
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-explicit-command-trigger.md
│   │   └── ... (0002–0011)
│   └── agents/
│       ├── issue-tracker.md
│       ├── triage-labels.md
│       └── domain.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids (e.g. don't say "原始 issue" — say "Intake Issue"; don't say "审批门" — say "Plan Gate").

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0009 (Claude Code headless as unified Execution Engine) — but worth reopening because…_
