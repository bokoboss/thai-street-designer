# Transfer Topology Design Basis

Status: **Phase 8B.1a model gate**  
Updated: 2026-10-02  
Working branch: `chatgpt/post-v1-transfer-topology`

## 1. Purpose

Phase 8A established parallel/mainline/frontage RoadLink chains. Phase 8B adds semantic mainline ↔ frontage transfer connections without drawing unowned ramp graphics or pretending that a merge-diverge terminal is an ordinary at-grade Junction v6 object.

## 2. Engineering semantics

TxDOT describes a ramp as a connecting roadway with a terminal at each connected leg and treats entrance/exit terminal geometry, speed-change lanes and gores as distinct design elements. The ramp therefore needs its own facility identity and explicit connection to the host roads rather than being modeled as an auxiliary lane or a copied frontage segment.

References:
- TxDOT Roadway Design Manual 15.7 Ramps & Direct Connectors: https://www.txdot.gov/manuals/des/rdw/chapter-15-grade-separations-and-interchanges-/15-7-ramps---direct-connectors-.html
- TxDOT Roadway Design Manual 8.1.18 Frontage Roads: https://www.txdot.gov/manuals/des/rdw/chapter-8--freeways--4r-/8-1-design-considerations/8-1-18-frontage-roads.html
- FHWA Corridor Access Management: https://highways.dot.gov/safety/proven-safety-countermeasures/corridor-access-management
- ASAM OpenDRIVE: https://www.asam.net/standards/detail/opendrive/

These references establish semantics, not mandatory Thai dimensions. Thai project standards remain controlling where applicable.

## 3. Architecture decision

### Rejected: fake Junction v6 at every ramp terminal
A merge/diverge terminal is not an at-grade three-arm intersection. Reusing Junction v6 would introduce the wrong curb-mouth/intersection geometry and contaminate local Junction semantics.

### Rejected: arbitrary XY ramp endpoints
A point that merely touches a rendered RoadLink is not network connectivity. Moving the host alignment would detach the semantic connection.

### Deferred: split the host RoadLink every time a ramp is added
Controlled splitting can represent graph topology, but it destabilizes ParallelCorridor chain IDs, station components, handoff provenance and scenario diffs for a concept-design operation that does not otherwise require host segmentation.

### Selected foundation: RoadLink station ports
A transfer terminal is first represented as a semantic station anchor on a host RoadLink.

```ts
TransferPort {
  id
  name
  hostLinkId
  station
  direction: 'forward' | 'backward'
  side: 'curb' | 'median'
  terminal: 'diverge' | 'merge'
}
```

Station is absolute metres measured from the host RoadLink FROM endpoint along the resolved alignment. Direction is independent of RoadLink storage orientation. Side uses the existing curb/median semantic convention rather than screen left/right.

This preserves the host RoadLink and ParallelCorridor chain while giving a future connector an explicit durable topology reference.

## 4. Phase 8B.1a scope

Network schema v5 adds `transferPorts[]`.

Required behavior:
- v1/v2/v3/v4 migrate to v5 with an empty list;
- IDs are unique;
- host RoadLink must exist;
- station is finite and strictly inside host RoadLink length;
- direction, side and terminal role are explicit;
- JSON / Scenario duplication preserves the object through existing project state;
- deleting a host RoadLink removes currently unconnected transfer ports atomically;
- no renderer, ramp pavement or terminal lane treatment is added.

## 5. Phase 8B.1b connector ownership

After 8B.1a is stable, a connector will reference transfer ports as semantic endpoints.

The connector must own a one-way section of its own. It must **not** inherit the full host LinkEndSection, because a host may contain several lanes, median, sidewalks and edge bands while the connector may be a single ramp lane.

The implementation should extend the existing RoadLink/corridor resolver rather than create an SVG-only connector.

## 6. Phase 8B.2 terminal treatment

Terminal geometry is a separate layer after connectivity is correct:
- diverge / exit terminal;
- merge / entrance terminal;
- acceleration / deceleration lane lifecycle;
- painted nose / physical nose / gore;
- tangent continuity and review warnings.

## 7. Editing and failure policy

A transfer port follows host stationing, not a stored world XY.

If later host edits shorten the RoadLink so the station no longer exists, the edit path must block or surface a deterministic unresolved condition; it must not silently clamp the station.

Deleting a host RoadLink may remove unconnected station ports. Once connectors reference them, deletion policy must be upgraded to safe cascade/confirmation before 8B.1b is accepted.

## 8. Non-goals

Phase 8B does not add grade separation/elevation design, traffic assignment, weaving/LOS/capacity analysis, automatic ramp-spacing warrants, certified detailed-design compliance, or automatic Thai design dimensions without an applicable authority basis.


## 9. Phase 8B.1b connector semantic ownership

After the schema-v5 station-port gate passed, connector ownership is represented by a distinct `TransferConnector` semantic object rather than overloading the existing Junction-to-Junction `RoadLink` invariant.

```ts
TransferConnector {
  id
  name
  fromTransferPortId   // must reference DIVERGE
  toTransferPortId     // must reference MERGE
  via[]                // future shared alignment controls
  lanes
  laneWidth
}
```

The object is intentionally topology/section state only in 8B.1b. It does not create an SVG or 3D ramp renderer.

Why not change `RoadLink.from/to` to a union now:
- RoadLink endpoint ownership is deeply coupled to Junction Arm continuity, ParallelCorridor chain traversal, handoff provenance and existing reconnect behavior.
- A union conversion would expand the regression surface before connector terminal semantics are stable.
- TransferConnector is a distinct connecting facility, but Phase 8B.2 must **reuse/refactor the existing alignment + section geometry primitives**, not introduce a second drawing engine.

Foundation constraints:
- traffic flows from a DIVERGE station port to a MERGE station port;
- the two terminals must belong to different host RoadLinks;
- a transfer port may belong to only one connector in this foundation;
- connector section is explicit and one-way (`lanes`, `laneWidth`);
- lane-count/width limits are workspace guards, not Thai design standards;
- deletion of a port/host cascades dependent connector topology atomically;
- changing a connected port role is rejected when it would invalidate the connector.


## 10. Phase 8B.2a geometry datum foundation

The first geometry step does not draw ramp pavement. It resolves durable terminal datums from the existing host-road engines.

A `TransferPort` resolves from:
1. the host RoadLink resolved alignment at its absolute station;
2. the resolved host cross-section at the same station;
3. the selected travel direction and curb/median side.

The resulting terminal anchor is the **edge of traveled way** for that direction/side, not an arbitrary screen point and not the outside edge of a shoulder/sidewalk band. This is deliberate: speed-change lane, shoulder displacement, nose and gore are terminal treatments that will be added explicitly rather than hidden inside the topology anchor.

Traffic heading is derived from RoadLink storage heading:
- forward = storage heading;
- backward = storage heading + 180°.

For left-hand traffic, curb side is the left side of the travel heading and median side is the right side. The connector control line is tangent to the source traffic heading at DIVERGE and to the receiving traffic heading at MERGE.

The endpoint tangent construction has been extracted into a shared `tangentAlignmentControls()` primitive in `lib/alignment.ts`, so RoadLink and TransferConnector do not own competing tangent algorithms.

Current references supporting this separation:
- Austroads Guide to Road Design Part 4C: Interchanges (2023), which treats ramp cross-section, ramp alignment, and merge/diverge terminals as explicit interchange elements: https://austroads.gov.au/publications/road-design/agrd04c
- TxDOT Roadway Design Manual, which defines speed-change/auxiliary lanes as roadway adjoining through lanes for entering/exiting and speed-change movements, and separates ramps/terminals from frontage-road design: https://www.txdot.gov/content/txdotoms/us/en/manuals/des/rdw/chapter-8--freeways--4r-/8-1-design-considerations.html

No TxDOT/Austroads numeric dimension is encoded as a Thai mandatory default in this phase.


## 11. Phase 8B.2b host speed-change lane lifecycle

The first terminal treatment reuses the existing RoadLink lane lifecycle engine.

A transfer-created host lane is persisted as a normal `LinkStationLaneComponent` with provenance:

```ts
{
  kind: 'transfer-terminal',
  transferPortId,
  connectorId,
  terminal: 'diverge' | 'merge',
  lane
}
```

This is deliberate. TxDOT defines speed-change lanes as acceleration/deceleration lanes and describes freeway ramp entrance/exit terminals using those facilities. Ramp pavement and gore remain separate terminal elements. The host speed-change lane therefore belongs to the host RoadLink cross-section rather than the connector centerline. See:
- TxDOT Roadway Design Manual 4.10.2 Speed Change Lanes: https://www.txdot.gov/manuals/des/rdw/chapter-4--basic-design-criteria/4-10-cross-sectional-elements/4-10-2-speed-change-lanes.html
- TxDOT Roadway Design Manual 15.7 Ramps & Direct Connectors: https://www.txdot.gov/content/txdotoms/us/en/manuals/des/rdw/chapter-15-grade-separations-and-interchanges-/15-7-ramps---direct-connectors-.html
- Austroads Guide to Road Design Part 4C: Interchanges (2023): https://austroads.gov.au/publications/road-design/agrd04c

Treatment parameters are explicit concept inputs:
- `fullWidthLength`: full auxiliary-lane length next to through traffic;
- `taperLength`: taper at the remote end of the speed-change lane.

No TxDOT/Austroads length is copied as a mandatory Thai default.

Station semantics are traffic-direction aware:
- DIVERGE: the lane extends upstream from the terminal and is full width at the terminal;
- MERGE: the lane extends downstream from the terminal and is full width at the terminal;
- backward traffic reverses the station direction but not the driver-facing meaning.

The host RoadLink must already be in Resolved geometric transition. The treatment does not silently resolve endpoint section mismatches.

Lifecycle safety:
- changing a treated port's host/station/direction/side/role is blocked until treatment is removed;
- changing a treated connector's endpoint/lane count is blocked;
- removing a connector/port/host cascades dependent transfer-terminal lane provenance;
- reapplying treatment preserves per-lane component IDs where possible;
- manual editing of a sourced lane continues to detach provenance through the existing station-component edit behavior.
