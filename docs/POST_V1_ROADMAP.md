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

Acceptance / freeze gate before PR #2 merge — **passed; PR #2 merged 2026-10-02:**
- dedicated browser golden evidence must show the generated frontage geometry, corridor highlighting and persisted review points together;
- Thai labels in visual QA must render with a Thai-capable font rather than missing-glyph boxes;
- one-side generation must remain legible in the narrow Inspector and clearly state that the offset is a one-shot seed, not a persistent constraint;
- after these checks pass, freeze PR #2 at the 8A boundary and do not pull Phase 8B ramp topology into the same PR.

Automatic cross-street connections remain deliberately excluded. Mid-link mainline ↔ frontage ramps remain Phase 8B.

## Phase 8B — Mainline ↔ frontage transfer topology

### 8B.1a — RoadLink station-port semantic foundation — current
- Network schema v5 adds `transferPorts[]`.
- A transfer port is a semantic mid-link anchor: host RoadLink + absolute station + travel direction + curb/median side + merge/diverge role.
- v1/v2/v3/v4 migrate to v5 with `transferPorts: []`.
- Missing host, invalid station and malformed role metadata are rejected.
- Deleting the host RoadLink removes its currently unconnected transfer ports atomically.
- No ramp geometry or renderer is introduced in 8B.1a.

### 8B.1b — connector semantic ownership — current
- add persisted `TransferConnector[]` between DIVERGE → MERGE station ports;
- connector owns explicit one-way lane count / lane width instead of inheriting the host-road cross section;
- preserve host RoadLink/mainline/frontage chain IDs rather than splitting them merely to attach a ramp;
- dependency-safe port/host delete and connected-role update semantics;
- Scenario Comparison and Design Summary expose transfer-port / connector counts;
- still no ramp renderer: 8B.2 must refactor/reuse existing alignment + section geometry primitives rather than introduce a parallel engine.

### 8B.2 — terminal treatment geometry
Only after topology is durable:
- acceleration/deceleration lane lifecycle;
- painted/physical nose and gore semantics;
- tangent continuity between host and connector;
- terminal review warnings.

Do not implement visual-only ramps, arbitrary XY endpoints or fake Junction v6 objects for merge/diverge terminals.

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
