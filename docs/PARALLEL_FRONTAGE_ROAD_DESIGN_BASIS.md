# Parallel / Frontage Road Design Basis

Status: **Phase 8A research and model gate — implementation not yet complete**  
Updated: 2026-09-30  
Working branch: `chatgpt/post-v1-parallel-corridor-foundation`

## 1. Purpose

Thai Street Designer Product v1 deliberately deferred parallel/frontage roads until the Network model, file workflow, comparison, export and review systems were stable.

This document defines the engineering semantics and architecture boundary for post-v1 support of:

- ทางขนาน / frontage roads;
- parallel local/service roads beside a principal corridor;
- one-way or two-way frontage operation;
- future mainline ↔ frontage transfer/connector geometry.

The goal is **not** to create another renderer or a visual-only copied roadway. Parallel roads must remain normal semantic road facilities inside the Network workspace.

## 2. Engineering context

The Thai Department of Highways publishes `ทางขนาน` as a recognized highway context/classification and uses frontage roads in real highway corridors. This establishes that the feature is directly relevant to Thai road practice, but the application must not infer mandatory Thai dimensions from a generic frontage-road concept.

International guidance is used only to define semantic distinctions:

- FHWA corridor-access guidance describes lower-speed one-way or two-way off-arterial circulation/frontage roads as an access-management strategy.
- TxDOT defines frontage roads as roads parallel to a controlled-access facility that separate local/access traffic from the higher-speed main facility.
- TxDOT treats entrance/exit ramps as separate geometric connections whose behavior depends on the frontage-road operating direction and on access spacing.

Therefore a frontage road is **a separate road facility**, not:
- an extra outer lane of the main RoadLink;
- a wide shoulder;
- a Pocket or receiving lane;
- an unusually large median;
- a graphics-only duplicate of the mainline.

## 3. Source references

Thai context:

- Department of Highways — road-class / design context including `ทางขนาน`:  
  https://www.doh.go.th/content/188
- Department of Highways — survey/design resources:  
  https://www.doh.go.th/content/179

International semantic / access-management references:

- FHWA — Corridor Access Management:  
  https://highways.dot.gov/safety/proven-safety-countermeasures/corridor-access-management
- FHWA — Safety Compass, Corridor Access Management section:  
  https://highways.dot.gov/sites/fhwa.dot.gov/files/docs/newsletters/sc_vol6_is1/index.htm
- TxDOT Roadway Design Manual — Frontage Roads:  
  https://www.txdot.gov/manuals/des/rdw/chapter-8--freeways--4r-/8-1-design-considerations/8-1-18-frontage-roads.html
- TxDOT Roadway Design Manual — Ramps & Direct Connectors:  
  https://www.txdot.gov/content/txdotoms/us/en/manuals/des/rdw/chapter-15-grade-separations-and-interchanges-/15-7-ramps---direct-connectors-.html
- TxDOT Traffic and Safety Analysis Procedures — Frontage Road definition:  
  https://www.txdot.gov/manuals/des/tsp/chapter-9-segment-analysis--freeways--multi-lane-h/9-1-introduction/9-1-2-facility-definitions/9-1-2-4-frontage-roads.html

International references inform concept semantics only. They must not be encoded as mandatory Thai design criteria without checking the applicable Thai authority/manual for the project.

## 4. Existing Network facts that constrain the design

Current NetworkProject v3 owns:

```
NetworkProject
├─ JunctionInstance[]
│  └─ Design v6
└─ RoadLink[]
   ├─ from PortRef
   ├─ to PortRef
   ├─ LinkVia[]
   ├─ sectionProfile
   └─ station components[]
```

Important existing invariants:

1. A RoadLink endpoint is a **Junction Arm port**.
2. RoadLink alignment and section state are the source of truth for the inter-junction corridor.
3. Junction local geometry remains in Design v6.
4. Renderers consume those semantic objects; they do not own separate geometry.
5. An Arm already supports `incoming = 0` or `outgoing = 0` as long as at least one travel direction exists.

Consequence: one-way frontage operation does **not** require a new `oneWay` boolean. Direction remains represented by the existing incoming/outgoing lane semantics.

## 5. Architecture decision

### 5.1 Frontage roads remain ordinary RoadLinks

A frontage road is built from the same RoadLink / Junction primitives as every other corridor.

Adding frontage semantics must not change:
- `linkPoints()`;
- tangent–arc–tangent resolution;
- section resolution;
- lane lifecycle behavior;
- Junction geometry;
- 2D / 3D geometry ownership.

### 5.2 Add a relationship layer, not a geometry layer

Phase 8A introduces a Network-level grouping relationship that says which existing RoadLink chains form one parallel-corridor concept.

Conceptual schema direction:

```ts
type ParallelCorridorSide = 'left' | 'right';

type ParallelFrontageChain = {
  side: ParallelCorridorSide;
  linkIds: string[];
};

type ParallelCorridor = {
  id: string;
  name: string;
  mainlineLinkIds: string[];
  frontage: ParallelFrontageChain[];
};

type NetworkProjectV4 = {
  // existing fields...
  parallelCorridors: ParallelCorridor[];
};
```

The exact field names may change during implementation, but the ownership rule must not.

### 5.3 Relationship metadata is not alignment source of truth

The group stores **membership**, not copied XY geometry.

Do not persist a second centerline, offset polyline or duplicated cross-section inside the parallel-corridor object.

If a future creation tool uses a nominal offset to seed frontage geometry, the resulting RoadLinks own their actual geometry.

A future persistent parametric-offset constraint would be a separate feature and must be explicitly modeled and tested.

## 6. Initial supported topology

Phase 8A supports semantic grouping of already-valid Network roads:

- one mainline RoadLink chain;
- frontage chain on the left, right or both sides;
- one-way or two-way frontage roads using existing lane-direction semantics;
- multiple RoadLinks in a chain so a corridor can pass through several Junctions;
- normal RoadLink curves, section profiles and station components.

A chain is a sequence of RoadLinks connected through Junctions.

The frontage chain does **not** need the same number of RoadLinks or the same Junction IDs as the mainline chain.

## 7. Explicitly deferred topology

Do not fake these in Phase 8A:

### Mid-link mainline ↔ frontage connectors

Current RoadLinks connect Junction ports to Junction ports. A ramp that enters/exits in the middle of a RoadLink requires a proper topology decision.

Do not implement it by:
- drawing an unowned SVG connector;
- storing arbitrary XY endpoints;
- reusing a Pocket;
- snapping a connector visually to a RoadLink without semantic connectivity.

Future options to research include:
- explicit transfer/merge-diverge Network nodes;
- RoadLink station ports;
- controlled splitting of a RoadLink into semantic links at a transfer node.

### Grade separation

Mainline-over/frontage-at-grade relationships require elevation/structure semantics not present in Product v1. Do not imply grade-separated correctness from 2D overlap.

### Traffic-operation analysis

Do not add capacity, weaving, LOS, ramp-spacing warrants, assignment or simulation as part of the parallel-road model.

## 8. Validation rules for ParallelCorridor

The first implementation should deterministically validate:

1. every referenced RoadLink exists;
2. `mainlineLinkIds` contains at least one Link;
3. at least one frontage chain exists;
4. every frontage chain contains at least one Link;
5. no Link appears as both mainline and frontage in the same group;
6. a frontage chain has one declared side;
7. consecutive Link IDs in a chain are topologically continuous through a Junction;
8. duplicate Link IDs inside one chain are rejected;
9. group IDs are unique;
10. corrupted group metadata must not break loading of otherwise valid geometry without a deliberate migration/recovery rule.

Adding/removing only group metadata must leave resolved road geometry structurally unchanged.

## 9. Deletion and Undo policy

Parallel-corridor grouping must not make ordinary Network objects undeletable.

When a referenced RoadLink is deliberately deleted:

- its group membership is removed in the same NetworkProject transaction;
- a frontage chain that becomes discontinuous is removed as a whole rather than silently reconnecting/reordering the surviving Links;
- an empty frontage chain is removed;
- if the mainline chain becomes empty/discontinuous, the group is removed;
- a group with no valid frontage chain remaining is removed;
- Undo restores both the RoadLink and its prior group membership atomically.

The model must not silently reorder a remaining chain to hide a broken topology.

## 10. Scenario / file / report behavior

Because ParallelCorridor is engineering Project state:

- Scenario duplication copies it with the NetworkProject;
- Project JSON stores it;
- migration from v3 creates `parallelCorridors: []`;
- Scenario Comparison should eventually report group membership changes but must not create a new comparison engine;
- Design Summary may later count/report parallel corridors by reading the same canonical model;
- exported road geometry remains the actual RoadLinks.

## 11. UI sequence

### Phase 8A.1 — relationship foundation

Initial UX should be deliberately small:

- selected RoadLink → **Create Parallel Corridor as Mainline**;
- selected RoadLink → **Add to Frontage · Left / Right**;
- Inspector lists group members and role;
- remove a Link from the group without deleting the Link;
- highlight related Links while the group is selected.

This proves semantic ownership before adding automatic layout generation.

### Phase 8A.2 — assisted creation

Only after the relationship model is stable:

- choose a mainline chain;
- choose Left / Right / Both;
- provide an initial lateral/separation intent;
- create normal Junction/RoadLink objects as one undoable transaction;
- let the existing Network geometry engine render/edit them.

Endpoint topology and cross-street behavior must be designed before this tool is coded.

### Phase 8B — transfer connections

Research and model mainline ↔ frontage ramps/transfer connections after the group foundation is accepted.

This likely requires topology beyond the current Junction-port-only endpoint model and must not be hidden inside Phase 8A.

## 12. Required regression coverage

Before Phase 8A.1 is accepted:

- NetworkProject v3 → v4 migration;
- v4 JSON round trip;
- one mainline + one left frontage chain;
- left + right frontage chains;
- one-way frontage using zero lanes in the opposite direction;
- chain-continuity validation;
- missing Link validation;
- duplicate/group-role validation;
- Scenario duplicate/isolation;
- RoadLink delete + group cleanup + Undo;
- add/remove grouping does not alter RoadLink/Junction geometry;
- browser selection/highlight flow;
- export/report does not lose or invent road geometry.

## 13. Non-goals for the first implementation

Phase 8A.1 does not:
- generate ramps;
- prescribe frontage-road spacing;
- enforce a design speed;
- calculate weaving;
- synchronize frontage alignment parametrically with the mainline;
- infer left/right relationship from screen position without explicit user intent;
- convert an existing lane/shoulder/median into a frontage road.

The first goal is to make the **semantic relationship correct and durable**. Layout automation comes after that foundation.
