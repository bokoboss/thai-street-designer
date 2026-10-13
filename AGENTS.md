# AGENTS.md — instructions for coding agents

Read in this order before changing anything:

1. `docs/decisions/ADR-0001-consolidation.md` — why this repo is the single product base.
2. `docs/CONSOLIDATION_ROADMAP.md` — the active plan. Work only on the current phase.
3. `docs/spec/UX_ARCHITECTURE.md` and `docs/spec/GOLDEN_WORKFLOWS.md` — target workspace and workflows.
4. `HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/ENGINEERING_DESIGN_BASIS.md` — existing engine rules.

Git branch / commit / PR content is the source of truth, not earlier conversation memory.

## Hard rules

- **Feature freeze** until Phase 3 of the roadmap is accepted. Fixes and regressions only, plus the work listed in the current phase.
- One semantic model → one resolver → many consumers (2D, section, 3D, export, review). Never add a parallel geometry path for a quick visual result.
- Keep the Slip invariant: `edges(designWithSlip)` equals `edges(designWithoutSlip)`.
- Schema changes require explicit, tested migration. Old files must open.
- Deployment target is **Vercel / Next.js** only.
- Do not import code from `street-concept-designer` or `road-concept-builder`; use their ideas only through the specs in `docs/spec/`.

## User-facing text

Follow the copy rules in `docs/spec/UX_ARCHITECTURE.md` and terms in `docs/GLOSSARY.md`.
Never put phase numbers, schema versions, internal type names or implementation explanations into the UI. Put explanations in commit messages, PR descriptions or docs.

## Engineering values

Follow `docs/standards/STANDARDS_POLICY.md`. Do not label defaults as Thai standards. Do not invent sources, editions, page numbers or values; mark unverified items `TO_VERIFY`.

## Code style

- Keep new modules small and readable; do not write multi-thousand-character lines.
- Engine logic (model, geometry, validation, migration, review, report) lives in `core/` and must not import React, Next, `app/`, `components/` or `lib/` (enforced by `scripts/verify-core-boundary.cjs`). UI code imports it as `@/core/...`.
- Regression scripts load TypeScript through `scripts/test-support/build.cjs`; do not add per-script transpile code.
- Add or adjust a failing regression first for behavior changes, then implement.

## Gates (must pass before a PR is ready)

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm test:builds
pnpm test:browser   # when interaction or rendering changes
```

For interaction changes, also apply the UX review gate in `docs/spec/UX_ARCHITECTURE.md` and report action counts against `docs/spec/UX_BASELINE_RESULTS.md` when a workflow is affected.

## PR size

Prefer one PR per vertical slice with evidence (tests, screenshots, measurements) in the description. Avoid separate plan / implement / baseline-refresh PRs for the same slice.
