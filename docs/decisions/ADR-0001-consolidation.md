# ADR-0001 — Consolidate on Thai Street Designer

- Status: **Accepted** (owner decision, 2026-10-13)
- Supersedes: the post-v1 feature direction in `docs/POST_V1_ROADMAP.md` and the "Network-first / Junction-instance" interaction model as the *target* model
- Related repositories:
  - `bokoboss/street-concept-designer` (SCD) — archived as a specification source
  - `bokoboss/road-concept-builder` (RCB) — already marked legacy; archived as a specification source

## Context

Three repositories pursued the same product: a concept-level street, junction and corridor designer for Thailand / left-hand traffic.

| Repository | State on 2026-10-13 | Strength | Weakness |
| --- | --- | --- | --- |
| Thai Street Designer (this repo) | Product v1 released; Phase 8A merged; all regression gates pass | Mature junction geometry (curb returns, pockets, Slip, roundabout, sections, 2D/3D, scenarios, export) | Interaction model follows the data model, not the engineer; three separate workspaces; developer-facing text in the UI; very large page components |
| Street Concept Designer | Rust kernel + project core; no UI; idle since 2026-09-04 | Road-first product thesis, golden workflows, UX architecture, selection/snapping model, standards-provenance policy, typed command model | Junction corners are placeholder geometry (arc centred on the crossing point, convex-hull surface); lane connections ignore traffic side; most street components absent; governance overhead outpaced product progress |
| Road Concept Builder | Phase 0–2E straight-road prototype; legacy | Pavement-marking system design, generated/manual object model, Thai marking sources and terminology | Straight road only; superseded in every implemented capability |

Reviews on 2026-10-13 (running the apps, the test suites and probing the SCD kernel) found that combining the codebases directly is not practical: Thai Street Designer is junction-first (junction owns straight arms; RoadLinks join arm ports) while SCD is road-first (roads own alignment and section; junctions are derived from road crossings). No lossless two-way mapping exists.

## Decision

1. **One product, one codebase, one geometry engine.** Thai Street Designer is the base. Development continues in TypeScript.
2. **Web first.** The deployment target is **Vercel / Next.js**. The ChatGPT Sites / vinext build path will be removed in a follow-up change. A desktop wrapper (for example Tauri around the same frontend) is deferred until there is a concrete need.
3. **Feature freeze.** No new feature families (including Phase 8B ramps / transfer topology) until the consolidated workspace milestone (Phase 3 in `docs/CONSOLIDATION_ROADMAP.md`) is accepted. Bug fixes and regressions are allowed.
4. **Target interaction model is road-first.** The engineer draws roads; crossing or connecting roads produces a *candidate junction* that the engineer confirms. Arms become the end portions of roads. This target is subject to the Phase 1 spike gate.
5. **SCD and RCB become specification sources, not code sources.** Their product, UX, glossary, standards and marking documents are adapted into `docs/spec/`, `docs/standards/` and `docs/GLOSSARY.md`. No Rust code is imported.
6. **Measure usability, not only correctness.** Golden workflow tasks are timed and click-counted before and after each interaction milestone.

## Consequences

- `docs/CONSOLIDATION_ROADMAP.md` becomes the active plan. `docs/POST_V1_ROADMAP.md` is retained as history.
- Existing architecture guardrails remain in force for geometry (one semantic model → one resolver → many consumers; Slip invariant; explicit migration).
- Existing Design v6 / Network v4 files must remain openable through a one-way migration when the schema changes. Files saved by the new schema will not open in older builds.
- The `/junction` and `/roads` pages are expected to be folded into one workspace; `/roads` (Free Draw lab) is not a product surface.
- The SCD Rust kernel may be revisited only if measured robustness or performance problems in the TypeScript engine justify it.

## Fallback

If the Phase 1 spike shows that junctions cannot be derived from crossing roads while reusing the current curb/edge geometry, keep junctions as owned objects but change *creation* to "draw road → snap into junction". The single-workspace, inspector and copy work proceed unchanged.

## Evidence

- Thai Street Designer at `cc4994c`: `pnpm test` passes; app exercised in a browser at `/network`, `/junction`, `/roads`.
- Street Concept Designer at `784a446`: 151 Rust tests pass; kernel junction geometry rendered through its public API for a 90° and a 55° crossing.
- Road Concept Builder at `c107c58`: source and documentation inspected; capabilities compared against Thai Street Designer.
