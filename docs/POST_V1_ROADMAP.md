# Post-v1 Roadmap

Updated: 2026-09-30  
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

### 8A.2 Assisted parallel-road creation
- seed frontage geometry from a selected mainline chain;
- left/right/both workflow;
- create ordinary Network objects as one transaction;
- no hidden long-lived copied geometry.

This phase cannot start until endpoint/cross-street topology is specified.

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
