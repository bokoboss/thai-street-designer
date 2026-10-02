# Post-v1 Roadmap

Updated: 2026-10-01  
Released baseline: Product v1 on `main`

Post-v1 work remains governed by the same architecture rule: new capabilities extend existing semantic ownership rather than introducing parallel geometry/rendering paths.

## Phase 8A — Parallel / Frontage Corridor Foundation

### 8A.1 Relationship model
- NetworkProject schema extension for parallel-corridor grouping.
- v3 → v4 migration.
- deterministic group/chain validation.
- Scenario/file/Undo integration.
- basic Inspector membership workflow.
- no automatic geometry generation.

Design basis: `docs/PARALLEL_FRONTAGE_ROAD_DESIGN_BASIS.md`.

### 8A.2 Assisted parallel-road creation — implemented on working branch
- seed frontage geometry from a selected mainline chain;
- left/right/both workflow with persisted looking-ahead reference direction;
- create ordinary Junction/RoadLink objects as one transaction;
- no hidden long-lived copied geometry or persistent offset constraint;
- generated seed Junctions are neutralized for review;
- persisted seed-review markers survive Save/Reload and can be explicitly cleared after review.

Acceptance / freeze gate before PR #2 merge:
- dedicated browser golden evidence must show the generated frontage geometry, corridor highlighting and persisted review points together;
- Thai labels in visual QA must render with a Thai-capable font rather than missing-glyph boxes;
- one-side generation must remain legible in the narrow Inspector and clearly state that the offset is a one-shot seed, not a persistent constraint;
- after these checks pass, freeze PR #2 at the 8A boundary and do not pull Phase 8B ramp topology into the same PR.

Automatic cross-street connections remain deliberately excluded. Mid-link mainline ↔ frontage ramps remain Phase 8B.

## Phase 8B — Mainline ↔ frontage transfer topology

Research and model:
- merge/diverge/transfer nodes;
- RoadLink station ports versus explicit Link splitting;
- connector/ramp ownership;
- safe reconnect/delete/Undo;
- interaction with frontage directionality and access management.

Do not implement visual-only ramps.

## Phase 8C — Parallel corridor engineering review

Potential review layer:
- discontinuous chain;
- side/role inconsistency;
- unresolved section continuity;
- connector topology warnings.

Do not encode traffic capacity, weaving LOS or mandatory access spacing unless a separate analysis scope is deliberately approved.

## Phase 8D — Advanced direct editing

After parallel-road topology is stable:
- multi-object selection;
- alignment/parallel-offset assistance;
- constrained moves;
- more CAD-like editing.

This must remain built on the same Junction/RoadLink sources of truth.
