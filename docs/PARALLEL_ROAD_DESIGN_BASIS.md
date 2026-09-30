# Parallel / Frontage Road Design Basis

Status: architecture research — do not implement as an Arm boolean.

## 1. Why this feature needs its own model

Thai road contexts commonly distinguish between the main roadway and a parallel/frontage roadway. Department of Highways material and real project notices explicitly refer to:

- Main Road
- Frontage Road / ทางขนาน
- dedicated points connecting the main roadway and frontage roadway
- frontage roads located on one or both sides depending on the corridor

FHWA access-management guidance likewise treats a frontage/backage road as a separate access roadway, generally parallel to the main roadway, whose purpose is to separate local access traffic from through traffic. It may operate one-way or two-way.

Therefore a parallel/frontage road is not:

- one more lane of the main carriageway
- a Pocket
- a Slip lane
- a boolean property of a Junction Arm

It is a distinct roadway in the network with an explicit relationship to a main corridor.

## 2. Evidence relevant to the semantic model

### Thai Department of Highways

The Department of Highways road-class page includes a distinct “ทางขนาน” road category.

Recent Department of Highways traffic-management notices for Rama II and Highway 34 distinguish Main Road and Frontage Road and refer to explicit connection points between them.

Department of Highways material on highway access notes that access to a controlled main facility and access to its parallel roadway are not equivalent concepts. In the motorway context described there, property access is directed to the parallel roadway rather than directly to the controlled mainline.

The DOH traffic-sign manual also contains separate warning concepts for:

- exit from the main roadway to a parallel road
- entry from the parallel road to the main roadway

This is strong evidence that the connection itself is a semantic movement/treatment, not merely overlapping road graphics.

### FHWA access management

FHWA defines frontage/backage roads as a property-access strategy that separates local-access traffic from through traffic. The frontage roadway can be one-way or two-way and is considered together with access spacing and corridor conflict management.

This supports representing a frontage road as a network roadway with its own traffic direction, nodes and access relationships.

## 3. Proposed ownership

Do not implement:

```
Arm.parallelRoad = true
RoadLink.frontage = true   // by itself, also insufficient
```

Preferred concept:

```
Corridor
├─ Main RoadLink[]
├─ FrontageRoadLink[]
└─ CorridorConnector[]
```

The relationship belongs to a Corridor-level object.

A frontage roadway remains a real RoadLink so it can have:

- independent alignment
- one-way or two-way operation
- its own lane count and lane width
- its own section composition
- independent start/end stations
- independent intersections
- property/access connections later
- its own 2D / section / 3D geometry

## 4. Corridor connector

A Main ↔ Frontage connection should be an explicit network object.

Candidate model:

```ts
type CorridorConnector = {
  id: string
  corridorId: string
  from: LinkStationRef
  to: LinkStationRef
  movement: 'main-to-frontage' | 'frontage-to-main'
  direction: 'one-way' | 'two-way'
  geometry: ConnectorGeometry
}
```

It must not be inferred merely because two links are close to one another.

The connector eventually owns:

- its connection station on each roadway
- entry/exit movement semantics
- local transition geometry
- gore / separator / opening treatment where applicable
- lane-continuity semantics

The main and frontage RoadLinks must not mutate one another to create the connector.

## 5. Relationship to Junctions

A frontage road can interact with intersections in more than one way:

1. terminate before a Junction
2. continue independently past a Junction
3. connect into a side road at/near a Junction
4. reconnect to the main road upstream/downstream
5. have its own local Junction node

Therefore the program must not assume:

```
one Main Junction = one Frontage Junction
```

Topology should remain explicit.

## 6. Required states before implementation

The first implementation should support at least:

- frontage side: left / right of the corridor
- one-way / two-way operation
- independent lane configuration
- independent alignment
- start/end independent from the main Link
- explicit Main ↔ Frontage connectors
- multiple connectors along one corridor
- rendering on the map without geometry overlap
- 2D and Network 3D from the same resolved topology

Do not implement automatic traffic circulation or access optimization in this phase.

## 7. What should be automatic

Safe automatic behavior:

- a Corridor may keep a semantic association between Main and Frontage links
- moving the whole Corridor can transform all child links together
- changing a frontage link alignment updates its own geometry
- a Connector follows the two stations that it explicitly references
- rendering and 3D read the same resolved links/connectors

Unsafe automatic behavior:

- inventing a connector because roads come close
- modifying mainline lane count when a frontage road is enabled
- silently assigning one-way/two-way traffic
- silently forcing frontage-road intersections to match mainline intersections
- using Slip/Pocket state as a hidden source of truth

## 8. Proposed implementation order

Only after NetworkProject v1 is stable:

1. Add Corridor grouping without geometry side effects.
2. Allow an existing RoadLink to be designated as the Corridor mainline.
3. Add a distinct Frontage RoadLink from the same road-link engine.
4. Add explicit LinkStationRef.
5. Add CorridorConnector semantic object.
6. Resolve connector geometry as an overlay owned by the connector.
7. Migrate 2D selection and inspector.
8. Add cross-section participation.
9. Add Network 3D participation.
10. Add focused visual cases for Thai divided highways with frontage roads.

## 9. Initial acceptance cases

Before calling the feature complete, test:

- divided main road + one-way frontage on one side
- divided main road + two-way frontage on one side
- frontage roads on both sides
- one main-to-frontage exit
- one frontage-to-main entry
- two connectors on the same corridor
- frontage road ending before a Junction
- frontage road continuing past the main Junction independently
- multiple Junctions along the corridor
- map alignment and whole-network movement
- 3D consistency

## 10. Scope boundary

This is concept geometry.

The feature should visually and semantically resemble plausible Thai main/frontage-road arrangements, but it is not intended to calculate:

- weaving capacity
- merge/diverge LOS
- ramp terminal capacity
- signal timing
- access-spacing compliance
- detailed taper design
- sight distance
- swept path

Those can be separate future analysis/checking capabilities.

## 11. Reference basis reviewed

- Thailand Department of Highways — มาตรฐานชั้นทาง (includes a parallel-road category)
- Department of Highways notices distinguishing Main Road and Frontage Road and discussing connection points between them
- Department of Highways / Highway Weigh material on access to motorway parallel roads
- Department of Highways traffic-sign guidance for exit to / entry from parallel roads
- FHWA — Corridor Access Management
- FHWA-HRT-14-057 — Safety Evaluation of Access Management Policies and Techniques, frontage/backage road section

The references inform object relationships and common operating forms. They are not encoded as detailed-design compliance limits.
