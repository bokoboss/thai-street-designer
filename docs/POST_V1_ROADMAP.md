# Post-v1 Roadmap

Updated: 2026-10-05  
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

### 8A.2 Assisted parallel-road creation — merged to main through PR #2
- seed frontage geometry from a selected mainline chain;
- left/right/both workflow with persisted looking-ahead reference direction;
- create ordinary Junction/RoadLink objects as one transaction;
- no hidden long-lived copied geometry or persistent offset constraint;
- generated seed Junctions are neutralized for review;
- persisted seed-review markers survive Save/Reload and can be explicitly cleared after review.

PR #2 passed the dedicated assisted-frontage browser/golden gate and was merged on 2026-10-02. Phase 8A is frozen.

Automatic cross-street connections remain deliberately excluded. Mid-link mainline ↔ frontage ramps are Phase 8B.

## Phase 8B — Mainline ↔ frontage transfer topology

Design basis: `docs/TRANSFER_TOPOLOGY_DESIGN_BASIS.md`.

Architecture decision:
- represent merge/diverge locations as first-class **Transfer Terminals** attached to a host RoadLink position;
- terminal point/tangent are derived from the canonical RoadLink alignment;
- do not persist copied XY geometry;
- do not physically split host RoadLinks in the first implementation;
- a future ramp connector remains an ordinary RoadLink using an extended semantic endpoint reference.

### 8B.1a Transfer Terminal model
- NetworkProject v5 + v4 migration;
- terminal CRUD and deterministic validation;
- normalized host position + derived station metres;
- side / traffic direction / curb-or-median edge semantics;
- host-link / corridor delete cleanup;
- Scenario/File round-trip;
- no ramp rendering.

### 8B.1b Terminal editing
- add/select/move/remove terminal on a RoadLink;
- Inspector controls;
- terminal marker;
- Undo/Redo and corrupt-file recovery.

### 8B.2 Transfer connector RoadLink
- extend RoadLink endpoint resolution to Transfer Terminal refs;
- Entrance / Exit connector as normal RoadLink geometry;
- explicit connector section;
- safe delete/reconnect/Undo;
- no visual-only ramp object.

### 8B.3 Merge/diverge treatments
- explicit RoadLink station-component proposals for acceleration/deceleration/frontage merge treatments;
- engineering-review findings for unresolved treatments;
- no LOS/weaving certification.

### 8B.4 Assisted transfer acceptance
- assisted Entrance/Exit generation;
- deterministic visual/browser QA;
- comparison/report integration;
- freeze Phase 8B before advanced direct editing.

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
