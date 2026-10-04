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

### 8B.2a — connector geometry datum — current
- resolve station port against the host RoadLink alignment + resolved cross-section;
- anchor at the selected traveled-way edge, with explicit traffic/outward headings;
- refactor RoadLink endpoint tangent construction into shared `tangentAlignmentControls()`;
- resolve a TransferConnector tangent control line through the same alignment primitive;
- no pavement/gore renderer yet.

### 8B.2b — host speed-change lane lifecycle — current
- reuse `LinkStationLaneComponent` for acceleration/deceleration lanes on the host RoadLink;
- persist `transfer-terminal` provenance back to TransferPort + TransferConnector;
- explicit full-width and taper lengths; no imported foreign-standard numeric defaults;
- DIVERGE extends upstream / MERGE extends downstream in traffic coordinates;
- safe repair/detach/delete semantics through the existing RoadLink lifecycle engine.

### 8B.2c1 — connector pavement surface — current
- keep TransferPort datum stable by excluding transfer-terminal lane lifecycles from its own base-edge calculation;
- offset TransferConnector centerline half its owned pavement width outward from each host datum;
- resolve connector pavement + lane dividers from one shared geometry resolver;
- consume the same resolver in 2D plan and Network 3D.

### 8B.2c2 — painted / physical nose + neutral gore — current
- TransferPort is the painted-nose datum;
- persist per-terminal `none | painted | physical` treatment with explicit neutral-area / physical-nose dimensions;
- resolve neutral area between stable host traveled-way edge and connector inner edge in traffic coordinates;
- reject no geometry silently: physical-nose fit failures remain persisted and surface as Design Summary warnings;
- 2D / 3D / SVG-PNG export share the same semantic resolver;
- dedicated browser golden cases cover 2D and resolved Network 3D.

### 8B.3a — transfer selection + Inspector workflow — passed
- RoadLink Inspector creates explicit TransferPort at a user-entered station/direction/side/role;
- TransferPort is directly selectable on canvas and can connect to one compatible opposite-role port;
- TransferConnector is directly selectable on canvas and exposes own lane count/width + explicit per-terminal gore treatment;
- TransferPort Inspector exposes explicit host speed-change lane full-width/taper inputs through the existing lifecycle engine;
- delete confirmation covers connected TransferPort and treated TransferConnector cascade; all mutations use existing Undo/Redo;
- dedicated browser acceptance must create ports + connector + gore through UI, confirm delete, then Undo the complete workflow.

### 8B.3b — direct connector alignment editing — passed
- add/select/move connector PI controls using the shared alignment primitive;
- double-click connector or use contextual ＋ PI, then drag the same persisted `via[]` controls;
- edit PI radius and Delete PI with RoadLink-style context actions;
- every PI mutation still resolves through `resolveTransferConnectorAlignment()`; invalid edits are rejected rather than persisted;
- Undo/Redo uses the existing Network history and terminal/gore review remains derived from the edited connector;
- full Quality gate passed on `5d12ee2` / run `37139164316`.

### 8B.3c — transfer workflow acceptance / PR freeze — passed
- selected TransferConnector + PI editing golden, explicit impossible-gore review and cascade-delete/Undo passed Quality run `37139617777`;
- Phase 8B engineering/model boundary remains frozen.

### 8B.4 — workspace UX hardening — current before PR #3 review
This is a presentation / interaction hardening pass over the accepted Phase 8B model. Do not change transfer engineering semantics unless a UX regression proves the canonical model itself is wrong.

#### 8B.4a — information architecture + shared workspace shell — passed
- one shared workspace-switch order and naming: Network / ทางแยก / Road Lab;
- Network Inspector separates **Object / Review / Reference** instead of stacking object editing, Design Summary, comparison, maps and local images into one scroll;
- object selection returns to Object editing; comparison inspection stays in Review; Select Active intentionally returns to Object;
- map and local-image tools live only in Reference presentation;
- canonical state remains single-source; tabs are presentation only;
- full Quality + browser acceptance passed on `a36bec6` / run `37193864391`.

#### 8B.4b — typography + visual hierarchy — passed
- Network critical text floor raised to 9.5 px minimum in the workspace stylesheet, with browser readability checks on base UI, Scenario Compare and Parallel/Frontage;
- Inspector widened modestly and Parallel/Transfer actions moved toward Thai-first wording;
- full Quality + visual browser acceptance passed on `0aecb70` / run `37194262135`.

#### 8B.4c — interaction coherence — passed
- persistent Delete toolbar mode removed; destructive editing is Select → Inspector / Delete key with existing cascade confirmation;
- Undo/Redo preserves semantic selection and valid PI/Arm sub-selection when the object survives;
- Scenario reset is explicitly **คืนค่า Demo**, two-click confirmed and Esc-cancellable;
- transient status distinguishes destructive confirmation / warning / ordinary guidance;
- full Quality + browser interaction acceptance passed on `0a666b7` / run `37194695108`.

#### 8B.4d — 3D review + transfer direct manipulation — current
- 3D is explicitly **3D Review**: entering it opens Review, disables Object editing and provides an explicit return-to-2D action;
- canvas-first TransferPort placement uses `projectAlignment(linkPoints(...), click)` and the existing `addTransferPort()` station model — no arbitrary XY endpoint and no alternate geometry engine;
- Direction / Side / Role remain explicit Inspector inputs; canvas click resolves only the station on the selected host RoadLink;
- transient host highlight and Esc/cancel state are UI-only and never enter project JSON.

#### 8B.4e — full journey / compact-view acceptance
- Network → Junction → Network;
- parallel/frontage → transfer → review;
- project file / scenario / export;
- desktop primary + compact/tablet review acceptance.

Phase 8C remains frozen until 8B.4 is accepted.

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
