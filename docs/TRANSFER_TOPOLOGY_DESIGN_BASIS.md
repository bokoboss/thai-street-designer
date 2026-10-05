# Mainline ↔ Frontage Transfer Topology Design Basis

Status: **Phase 8B.1a Transfer Terminal model implemented on working branch — pending Quality gate**  
Updated: 2026-10-05  
Working branch: `chatgpt/post-v1-transfer-topology-foundation`

## 1. Purpose

Phase 8A established mainline/frontage roads as ordinary Junction + RoadLink geometry with a persisted ParallelCorridor relationship.

Phase 8B adds the next semantic layer: **entrance / exit transfer points and ramps between a mainline and its frontage road**.

The implementation must not reduce a ramp to an SVG line or arbitrary XY connector. A transfer terminal changes how a road is entered/exited and is therefore topology, not decoration.

At the same time, Phase 8B must preserve the existing RoadLink geometry and station-component ownership rather than reconstructing a valid host corridor merely to expose a connection.

## 2. Engineering source basis

### Thailand

Department of Highways material recognizes `ทางขนาน` as a highway context and current DOH planning material explicitly discusses access being routed through frontage roads depending on highway hierarchy.

References:

- DOH — มาตรฐานชั้นทาง / ทางขนาน:  
  https://www.doh.go.th/content/188
- DOH — ด้านสำรวจและออกแบบ:  
  https://www.doh.go.th/content/179
- DOH — current road-hierarchy implementation study discussing direct connection versus connection through frontage road:  
  https://www.doh.go.th/content/download/288456

These sources establish Thai relevance. They do **not** by themselves define one universal ramp geometry, spacing rule or merge/diverge length for every Thai project.

### International semantic guidance

Current TxDOT roadway-design guidance distinguishes:

- entrance ramps from frontage roads;
- exit ramps to frontage roads;
- ramp terminal geometry;
- merge/diverge and auxiliary-lane treatments;
- weaving and access-control considerations.

References:

- TxDOT RDM 15.7 — Ramps & Direct Connectors:  
  https://www.txdot.gov/content/txdotoms/us/en/manuals/des/rdw/chapter-15-grade-separations-and-interchanges-/15-7-ramps---direct-connectors-.html
- TxDOT RDM 15.7.7 — Ramp Terminal Design:  
  https://www.txdot.gov/manuals/des/rdw/chapter-15-grade-separations-and-interchanges-/15-7-ramps---direct-connectors-/15-7-7-ramp-terminal-design.html
- TxDOT RDM 15.8.1 — Frontage-road auxiliary lanes / merge / weaving context:  
  https://www.txdot.gov/content/txdotoms/us/en/manuals/des/rdw/chapter-15-grade-separations-and-interchanges-/15-8-frontage-road-turnarounds-and-intersection-ap/15-8-1-guidelines-for-designing-auxiliary-lanes--a.html
- TxDOT RDM 8.1.21 — Access Control:  
  https://www.txdot.gov/manuals/des/rdw/chapter-8--freeways--4r-/8-1-design-considerations/8-1-21-access-control.html
- FHWA — Corridor Access Management:  
  https://highways.dot.gov/safety/proven-safety-countermeasures/corridor-access-management

The application uses these sources to distinguish engineering concepts. Numeric criteria from another jurisdiction must not be encoded as mandatory Thai criteria without a project-specific Thai basis.

## 3. Existing architecture constraints

At the Phase 8A released baseline:

```
NetworkProject v4
├─ JunctionInstance[]
│  └─ Design v6
├─ RoadLink[]
│  ├─ from: PortRef
│  ├─ to: PortRef
│  ├─ via[] + radius
│  ├─ sectionProfile
│  └─ station components[]
└─ ParallelCorridor[]
   ├─ ordered mainline RoadLinks
   ├─ persisted looking-ahead mainline direction
   └─ left/right frontage RoadLink chains
```

Important consequences:

1. A normal RoadLink currently ends at a Junction Arm port.
2. RoadLink alignment is defined by endpoint geometry + `via/radius`, then resolved through the shared tangent–arc–tangent engine.
3. Lane/width treatments use RoadLink station components.
4. Assisted frontage creation deliberately creates normal Junction/RoadLink objects; there is no hidden offset geometry.
5. ParallelCorridor owns membership/reference semantics, not copied alignment.

## 4. Options considered

### Option A — visual connector / arbitrary XY ramp

**Rejected.**

A line between mainline and frontage road would not own:
- a semantic connection point;
- merge/diverge direction;
- RoadLink station relationship;
- deletion/reconnect behavior;
- Save/Reload topology;
- report/comparison semantics.

This directly violates the existing source-of-truth rules.

### Option B — physically split every host RoadLink at each ramp terminal

**Not selected for the initial Phase 8B model.**

A split is graphically intuitive, but with the current RoadLink representation it would require a geometry-preserving reconstruction of:

- tangent–arc–tangent `via/radius` state, including a split inside an existing curve;
- station-based lane and width components;
- endpoint transition state;
- Junction-to-corridor handoff provenance;
- ParallelCorridor ordered membership and reference direction.

A naive split could therefore change valid geometry merely by adding topology.

A future analysis/export layer may derive split graph segments if needed, but Phase 8B should not persist destructive host-link splits as the first implementation.

### Option C — first-class Transfer Terminal attached to a RoadLink station

**Selected.**

A Transfer Terminal is a persisted semantic topology point attached to a host RoadLink. Its world point and tangent are derived from the same RoadLink alignment used by the renderer.

The host RoadLink remains intact.

This provides an explicit merge/diverge object without copying host geometry and gives a future ramp RoadLink a semantic endpoint.

## 5. Target semantic direction

### 5.1 Transfer Terminal

Conceptual schema direction for NetworkProject v5:

```ts
type TransferTerminalEdge = 'curb' | 'median';

type TransferTerminal = {
  id: string;
  name: string;

  corridorId: string;
  hostLinkId: string;
  side: 'left' | 'right';

  direction: 'forward' | 'backward';
  edge: TransferTerminalEdge;

  // Normalized position on the current resolved host alignment.
  // Persisted value is 0..1; station in metres is derived for display/review.
  position: number;
};

type NetworkProjectV5 = {
  // existing v4 state...
  transferTerminals: TransferTerminal[];
};
```

The first implementation should use a normalized host position rather than an absolute metre station as the persisted anchor.

Reason:

- moving a Junction or editing a host alignment should not orphan the terminal simply because total link length changed;
- derived station metres remain available for engineering display;
- there is no hidden world-coordinate copy.

If later work requires a fixed-chainage lock, it must be modeled explicitly rather than inferred from the first version.

### 5.2 Derived geometry

For a terminal:

1. resolve the host RoadLink using the canonical `linkPoints()` alignment;
2. compute total resolved length;
3. evaluate the alignment at `position × totalLength`;
4. derive point and tangent from the shared alignment station function.

No terminal stores copied `x/y` or heading.

### 5.3 Host role is derived, not duplicated

The terminal references a ParallelCorridor and host RoadLink.

The model derives whether the host is:
- mainline; or
- frontage Left / Right

from the canonical ParallelCorridor relationship.

Do not persist a second `hostRole` that can disagree with corridor membership.

The terminal `side` is explicit because a mainline link may serve a left or right frontage transfer. When the host is a frontage link, its chain side must match the terminal side.

### 5.4 Direction and edge are explicit

A host RoadLink can carry two directions. Therefore terminal traffic direction must not be inferred from screen orientation.

Persist:
- `direction: forward | backward`;
- `edge: curb | median`.

Later ramp-generation rules may propose defaults from corridor geometry, but the persisted semantic state remains explicit.

## 6. Ramp connector direction

Phase 8B distinguishes:

- **Exit transfer** — mainline → frontage;
- **Entrance transfer** — frontage → mainline.

The movement is semantic and directional.

A future connector should be represented as a normal RoadLink using the existing alignment engine, with endpoint reference support extended to a Transfer Terminal.

Conceptual endpoint direction:

```ts
type TransferTerminalRef = {
  kind: 'transfer-terminal';
  terminalId: string;
};

type RoadEndpointRef =
  | PortRef
  | TransferTerminalRef;
```

Existing Junction-port JSON does not need to be rewritten merely to add terminal endpoints.

## 7. Why the ramp itself should still be a RoadLink

A ramp has its own:

- centerline/alignment;
- section/lane width;
- possible auxiliary-lane lifecycle;
- review state;
- selection/export/report geometry.

Those are already RoadLink responsibilities.

Therefore Phase 8B must extend endpoint resolution rather than create `RampGeometry[]` or another drawing-only model.

## 8. Validation invariants for TransferTerminal

Phase 8B.1a should validate at minimum:

1. terminal ID is unique;
2. referenced ParallelCorridor exists;
3. referenced host RoadLink exists;
4. host RoadLink belongs to that corridor;
5. if host is frontage, its persisted side matches terminal side;
6. `position` is finite and strictly inside the host Link, not at its Junction endpoint;
7. direction is `forward` or `backward`;
8. the selected direction has positive lane count at both host RoadLink ends; a one-way host cannot accept a terminal in its non-travel direction;
9. edge is `curb` or `median`;
10. exact duplicate terminal semantics on the same host position/direction/edge/side are rejected;
11. deleting a host RoadLink removes dependent terminals in the same NetworkProject transaction;
12. dissolving a ParallelCorridor removes its dependent terminals;
13. Scenario duplication / Project JSON round-trip preserve terminals;
14. v4 → v5 migration introduces `transferTerminals: []`;
15. adding/removing a terminal does not alter Junction or RoadLink geometry.

The model must not encode minimum ramp spacing as a validation rule in this phase.

## 9. Ramp-pair / connector invariants for the next phase

When connector RoadLinks are introduced:

1. both terminals belong to the same ParallelCorridor;
2. one terminal is on mainline and the other is on the frontage chain for the same side;
3. Exit = mainline terminal → frontage terminal;
4. Entrance = frontage terminal → mainline terminal;
5. connector endpoint direction must match its terminal traffic direction;
6. connector deletion must not delete host roads;
7. host-link deletion cascades to terminal and connector topology in one undoable transaction;
8. connector alignment remains owned by RoadLink;
9. connector creation must not silently add required merge/weave lane treatments;
10. unresolved merge/diverge lane treatment is a review finding, not hidden geometry.

## 10. Interaction with host roadway lane treatments

TxDOT guidance separates ramp-terminal geometry from merge/weaving/auxiliary-lane needs.

The application should mirror that separation.

Creating a Transfer Terminal or ramp connector must **not** automatically claim that the mainline/frontage lane treatment is complete.

Later Phase 8B work may propose RoadLink station components for:

- acceleration / merge lane;
- deceleration / diverge lane;
- frontage-road merge auxiliary lane;
- weaving auxiliary lane.

Those remain explicit RoadLink lifecycle objects and review findings.

## 11. Deletion / edit / Undo policy

### Delete host RoadLink

In one transaction:
- remove the RoadLink;
- remove dependent Transfer Terminals;
- remove dependent transfer connectors;
- let existing ParallelCorridor cleanup run;
- preserve unrelated roads.

Undo restores all of the above atomically.

### Delete Transfer Terminal

If no connector exists:
- remove only the terminal.

If a connector depends on it:
- require explicit cascade confirmation or remove the dependent connector in the same confirmed transaction.

### Edit host geometry

Because terminal position is normalized:
- the terminal follows the resolved host alignment;
- no copied XY value becomes stale.

A future fixed-chainage mode would require its own edit/recovery rules.

## 12. Scenario / Project File / Comparison / Report behavior

Transfer topology is engineering state.

Therefore:
- Scenario duplication deep-copies it;
- Project JSON persists it;
- migration is explicit;
- Scenario Comparison must eventually report added/removed/changed terminals/connectors through the canonical comparison engine;
- Design Summary must eventually count and review transfer topology through the canonical report engine.

Do not build separate comparison/report logic inside the Inspector.

## 13. Phase sequence

### 8B.1a — Transfer Terminal model foundation

- NetworkProject v5;
- v4 → v5 migration;
- terminal CRUD;
- derived point/tangent resolver;
- validation;
- delete/dissolve cleanup;
- Scenario/File round-trip;
- geometry-invariance regression;
- no ramp rendering.

### 8B.1b — Terminal editing workflow

- select host RoadLink;
- add terminal by click/station position;
- explicit side / direction / edge;
- terminal marker + Inspector;
- move terminal along host alignment;
- Undo/Redo;
- still no connector pavement.

### 8B.2 — Transfer connector RoadLink

- extend RoadLink endpoint resolution to TransferTerminalRef;
- create Entrance / Exit connector as an ordinary RoadLink;
- explicit connector section;
- reuse alignment / selection / export / 3D sources of truth;
- no automatic claim of merge/diverge treatment compliance.

### 8B.3 — Merge / diverge roadway treatments

- explicit station-component proposals;
- acceleration / deceleration / frontage merge lifecycle;
- review findings for unresolved treatment;
- no hard-coded LOS/weaving certification.

### 8B.4 — Assisted transfer UX and acceptance

- assisted entrance/exit seeding;
- direction/side preview;
- deterministic browser/golden acceptance;
- Scenario Comparison + Design Summary integration;
- freeze Phase 8B before advanced direct-editing work.

## 14. Explicit non-goals

Phase 8B does not:

- perform traffic assignment or microsimulation;
- calculate LOS or weaving capacity;
- certify ramp spacing;
- encode TxDOT numeric criteria as Thai mandatory criteria;
- model vertical profiles or grade separation;
- create bridge/retaining-wall geometry;
- infer a legal access-control decision;
- create arbitrary visual connectors that are not persisted topology.

## 15. Required evidence before coding a connector

Before Phase 8B.2 is accepted:

- terminal model tests must pass;
- endpoint resolver ownership must be documented;
- host geometry must remain structurally unchanged by terminal creation;
- connector must render through the normal RoadLink path;
- delete/reconnect/Undo semantics must be pinned;
- imported corrupt terminal/connector metadata must be rejected without destroying the current workspace.


## 16. Phase 8B.1a implementation note

The working branch now implements the model-only foundation described above:

- NetworkProject schema v5;
- v1/v2/v3/v4 migration to v5;
- persisted `transferTerminals[]`;
- canonical host-role validation against ParallelCorridor membership;
- normalized host position with derived RoadLink point/tangent/station;
- add/update/remove APIs;
- dependent cleanup when a host Link or ParallelCorridor is removed;
- side swap when the persisted ParallelCorridor reference direction is reversed;
- Scenario / JSON round-trip and geometry-invariance regressions.

No terminal marker, connector/ramp geometry or RoadLink endpoint-union change is included in 8B.1a.
