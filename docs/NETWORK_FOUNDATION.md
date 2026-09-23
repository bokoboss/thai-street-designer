# Network Foundation — Thai Street Designer

## Purpose

The product is evolving from a single-junction editor into a semantic street-network concept environment.

The network layer must not replace or flatten the junction model. It wraps the existing schema-v6 junction design with explicit world placement and corridor ownership.

## Ownership hierarchy

```
NetworkProject
├─ JunctionInstance[]
│  └─ Design v6
└─ RoadLink[]
   ├─ from PortRef
   ├─ to PortRef
   └─ via points
```

A `JunctionInstance` owns:

- world X/Y
- world rotation
- one existing `Design v6`
- the local geometry close to the junction

A `RoadLink` owns:

- the corridor between two junction ports
- the connection references
- future link alignment / section transition state

A port is a semantic reference:

```
PortRef = junctionId + armId
```

The Link endpoint is derived from the referenced junction/arm. The endpoint is not copied as an independent XY source of truth.

## Transform rule

Local junction geometry remains local.

```
Design v6 local geometry
        ↓
JunctionInstance transform
        ↓
Network world coordinates
        ↓
Map / multi-junction workspace
```

Moving or rotating a `JunctionInstance` must not mutate:

- lane counts
- median
- Pocket state
- Slip state
- arm semantic geometry

Attached Road Links follow the transformed ports automatically.

## Corridor boundary

The network workspace intentionally clips a Junction instance to a short local display length. This is a display boundary only.

The original `Design v6` arm lengths are retained in the junction design.

The Road Link is responsible for the corridor between those local port boundaries. This prevents two junctions from each pretending to own the same connecting road.

## Link direction semantics

For a Link from Junction A to Junction B:

- A `outgoing` lanes = Link forward lanes at the A end
- A `incoming` lanes = Link backward lanes at the A end
- B `incoming` lanes = Link forward lanes at the B end
- B `outgoing` lanes = Link backward lanes at the B end

The foundation does not silently invent a transition when the two Link ends disagree.

Current behavior is explicit review:

- lane-count mismatch
- lane-width mismatch
- median mismatch

A future resolver may create an explicit transition treatment, but it must be a RoadLink-owned semantic feature.

## Current interaction

The root workspace is now the Network workspace.

Foundation interactions:

- create multiple Junction instances
- select Junction / Road Link
- drag the whole Junction instance
- rotate the whole Junction instance
- connect arm-to-arm using visible ports
- attached Links follow moved/rotated ports
- delete Junctions and their owned connections
- undo / redo
- map reference underneath the network
- open a selected Junction in the detailed schema-v6 editor
- save edits back into the Network project automatically

Legacy detailed workspaces remain available during migration:

- `/junction/` — detailed Junction editor
- `/roads/` — road-alignment laboratory

They are implementation surfaces during the transition, not the long-term product split.

## Persistence

Network project storage:

`thai-street-network-project-v1`

Temporary detail-edit bridge:

`thai-street-network-edit-junction-v1`

The detailed junction editor reads the selected Junction design and writes changes back to the same Network project.

## Parallel / frontage roads

Parallel roads are intentionally not represented as a boolean or special Arm property.

Do not implement:

```
arm.parallelRoad = true
```

A frontage/service road is a distinct roadway/link with relationships to another corridor and with its own:

- directionality
- lanes
- start/end
- connectors
- intersection behavior
- section composition

Before implementation, research and define a corridor/topology model. The likely ownership is:

```
Corridor
├─ Main RoadLink
├─ Parallel / Frontage RoadLink
└─ Connector Links
```

This feature must follow the ownership lesson from Slip lanes and must not create circular geometry dependencies.

## Near-term roadmap

1. Stabilize Network schema v1 and interaction.
2. Add RoadLink alignment editing using the existing Free Draw polyline engine.
3. Add explicit Link section-transition semantics.
4. Add Network-level 3D view consuming Junction + Link geometry.
5. Integrate Road Link detail editing into the same root workspace.
6. Research and model frontage / parallel roads.
7. Only then expand toward ramps/interchanges or more complex corridor topology.

## Non-goals

The Network Foundation does not add:

- traffic assignment
- capacity analysis
- LOS
- signal optimization
- microsimulation
- queue simulation

The product remains an engineering-informed concept design and visualization environment.
