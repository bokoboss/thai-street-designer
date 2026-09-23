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
   ├─ LinkVia[] = PI world point + radius
   └─ sectionProfile
      ├─ review
      └─ linear
```

A `JunctionInstance` owns:

- world X/Y
- world rotation
- one existing `Design v6`
- the local geometry close to the junction

A `RoadLink` owns:

- the corridor between two junction ports
- the connection references
- PI/control alignment points and their curve radii
- the resolved tangent–arc–tangent corridor alignment
- explicit section-continuity mode

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

The Network workspace now renders the actual `Design v6 Arm.length` for each Junction arm.

That Arm endpoint is the semantic connection port.

The Road Link owns only the corridor between the two referenced Arm endpoints. This gives direct manipulation a clear meaning:

- drag an Arm endpoint → change the same `Arm.angle` / `Arm.length` used by the Junction engine
- an attached Road Link endpoint follows automatically
- move the whole Junction → transform all of its ports without mutating local Junction geometry
- edit Road Link PI points → change only the inter-junction corridor alignment
- edit PI radius → resolve a tangent–arc–tangent curve without changing Junction geometry

There is no duplicate network-only arm length. The standalone Junction editor and the Network workspace consume the same `Design v6` geometry.

## Link direction semantics

For a Link from Junction A to Junction B:

- A `outgoing` lanes = Link forward lanes at the A end
- A `incoming` lanes = Link backward lanes at the A end
- B `incoming` lanes = Link forward lanes at the B end
- B `outgoing` lanes = Link backward lanes at the B end

RoadLink schema v2 does not silently invent lane topology when the two ends disagree.

Two section-profile modes are explicit:

- `review` — preserve the previous mismatch-review behavior;
- `linear` — interpolate lane width, median width, sidewalk width and matching edge-band widths along the resolved Link.

`linear` is only allowed when:

- forward lane count matches;
- backward lane count matches;
- forward edge-band type/order matches;
- backward edge-band type/order matches.

A one-lane-count mismatch can now be resolved only through an explicit RoadLink-owned transition. The user must choose:
- direction (`forward` or `backward`);
- side (`curb` or `median`);
- transition center station;
- transition length.

The renderer localizes the added/dropped lane divider to that transition zone. The system still refuses to guess a side automatically, and mismatches larger than one lane remain unresolved topology.

Alignment ownership is also explicit:

- stored PI = world X/Y + requested radius;
- R0 reproduces the legacy sharp polyline;
- R>0 resolves tangent–arc–tangent geometry;
- the requested radius is clamped when adjacent tangent lengths are insufficient;
- renderer, Link length and Fit consume the resolved alignment rather than inventing separate curves.

## Current interaction

The root workspace is now the Network workspace.

Primary-workspace interactions:

- create multiple Junction instances
- switch a Junction between valid three-leg and four-leg topology with guards for linked Arms / Slip references
- select a Junction by clicking its visible road arms
- drag the whole Junction instance
- rotate the whole Junction instance
- select an Arm and drag its endpoint to stretch/shrink/rotate it
- edit Arm lane counts and median contextually in the Network Inspector
- edit incoming/outgoing lane width and sidewalk from the shared directional Section model
- add/remove/edit semantic edge bands (bike, buffer, shoulder, motorcycle)
- toggle crossing, signal and stop/yield presentation for the selected Arm
- add/edit incoming Pocket / outgoing receiving-lane treatments from the shared Pocket model
- connect arm-to-arm using visible semantic ports
- attached Links follow moved Junctions and edited Arm endpoints
- edit Road Link PI points; double-click a Link to insert a PI directly
- edit each selected PI radius; new PI defaults to R25 m and can be returned to R0
- choose explicit RoadLink section continuity: Review mismatch or Linear geometric transition
- resolve a one-lane count change explicitly on the curb or median side with station/length control
- inspect the selected Junction arm or RoadLink through the contextual Network section/profile dock; RoadLink sections can be scrubbed by station
- delete a selected Link via point before deleting its owning Link
- delete Junctions and their owned connections
- undo / redo
- align a map reference underneath the network
- switch to a Network-level 3D overview
- open a selected Junction in the detailed schema-v6 editor for advanced treatments
- save advanced detail edits back into the same Network project automatically

The product direction is Network-first. The separate Junction route remains useful for standalone concept figures and advanced focused editing, but it is not a second geometry engine.

Legacy detailed workspaces remain available during migration:

- `/junction/` — detailed Junction editor
- `/roads/` — road-alignment laboratory

They are implementation surfaces during the transition, not the long-term product split.

## Persistence

Network project schema is **v2**. The browser storage key remains:

`thai-street-network-project-v1`

The storage key is intentionally retained so existing local projects are discovered and migrated instead of being orphaned. On restore, schema-v1 projects migrate to v2 with:

- existing via points preserved at R0;
- section profile set to `review`;
- embedded Junction Designs migrated through the existing Design migration path.

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

1. Visually accept RoadLink schema-v2 curves, lane transitions and the Network section/profile dock in the deployed workspace.
2. Add direct contextual editing from the Network section/profile dock, while keeping the Inspector as the precision editor.
3. Add stronger browser-level interaction/E2E coverage for create → connect → curve → transition → undo/redo → reload.
4. Improve Network 3D from projected-plan foundation toward resolved Junction + Link scene geometry.
5. Fold remaining useful Road Alignment Lab operations into the root workspace, then retire it as a separate user-facing mode.
6. Research and model frontage / parallel roads using Corridor ownership.
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
