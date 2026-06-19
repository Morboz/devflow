# AGENTS.md

This repo is **devflow** — a GitHub App that drives a repository's development process through four Stages (Refinement → Decomposition → Implementation → Review). See `CONTEXT.md` for the domain model and `docs/adr/` for architectural decisions.

## Agent skills

### Issue tracker

GitHub issues in `Morboz/devflow`, via the `gh` CLI. External PRs are **not** a triage surface (PRs are Implementation Stage artifacts, not feature requests). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with default string mappings, plus four devflow-specific product labels (`devflow`, `devflow:prd`, `devflow:subissue`, `handcrafted`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` at the repo root, `docs/adr/` for architectural decisions. See `docs/agents/domain.md`.
