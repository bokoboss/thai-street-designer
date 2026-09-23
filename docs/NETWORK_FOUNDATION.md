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
- renderer, Link length and Fit consume the resolved alignment rather than inventing separate curves;
- each attached Link derives short non-persistent tangent controls from the semantic Arm headings, so the corridor leaves/enters the Junction tangent to the selected port;
- Review mode uses only short endpoint collars to match the exact Arm section at each port; mismatch warnings remain unresolved until the user explicitly configures a real section/lane transition.

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

Undo/redo history is transaction-safe. The Network editor keeps synchronous history refs alongside React render state so commit → Undo → Redo does not depend on render timing. Drag gestures commit once on pointer-up, and grouped field edits enter history as one editing transaction.

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

## Network 3D status

Phase 3B removes the remaining flat Junction plan texture from Network 3D. The Network scene is now resolved from semantic geometry end-to-end:

- Junction main pavement comes directly from the authoritative `edges()` footprint;
- sidewalks use the same outer/walk edge pairs as the 2D Junction renderer;
- Complete-Streets edge bands use the shared slip/allocation-aware band-edge resolver;
- median, splitter and roundabout islands use `armIslands()` / the existing roundabout model;
- Slip pavement, sidewalk, island, gore and raised separator consume Slip-v6 overlay geometry directly;
- every Junction surface is transformed to world coordinates only through the `JunctionInstance` transform;
- RoadLink surfaces continue to use the schema-v2 resolved section/alignment geometry;
- the reference map remains a ground texture.

The standalone Junction 3D view also consumes the shared Junction scene resolver for its raised sidewalk/island meshes, so Network 3D does not own a parallel Junction geometry implementation.

Phase 4C restores the missing presentation detail without weakening geometry ownership:

- lane dividers, curb lines, crossings, stop/yield markings and arrows are tagged by the existing 2D semantic renderers and projected as a **detail-only transparent overlay** above the resolved road surfaces;
- traffic signals, configured trees and lights use the existing `furnitureFaces()` resolver and are transformed into Network world coordinates as actual 3D faces;
- the overlay contains no road/median/sidewalk fill, so it cannot replace or override the resolved Junction / Slip / RoadLink geometry;
- raised median/sidewalk surfaces are drawn above the marking overlay, keeping zebra/linework visually below physical islands.

### Phase 4D port-facing guardrail

RoadLink creation now checks whether the selected semantic Arm ports actually face the corridor they are being asked to connect:

- the heading from each port toward the other port is compared with that Arm's world heading;
- up to 60° deviation is a normal target;
- 60–90° is shown as a caution target because a noticeable approach curve will be required;
- more than 90° means the other port lies behind at least one Arm, so new connection is blocked instead of generating an immediate U-turn / hairpin;
- the connection test is derived from Junction placement and Arm headings only; no extra topology state is stored;
- an existing Link is never deleted if later Junction movement/rotation makes its ports face incorrectly. It remains editable and receives a `port-facing` review issue instead.

This guardrail complements Phase 4C tangent continuity: **tangency fixes the seam; facing validation prevents choosing a topology that inherently requires the road to reverse direction immediately.**

### Phase 4A contextual direct editing

The Network workspace now treats the Inspector as a precision panel rather than the only editing surface:

- the Inspector can be collapsed and restored without leaving the Network workspace;
- selecting an Arm exposes a compact canvas command bar for incoming/outgoing lane count, median width and direction context;
- selecting a RoadLink exposes direct PI creation and, when a PI is selected, curve-radius and PI-removal controls;
- selecting a Junction exposes quick rotation and a direct handoff to Junction Detail;
- contextual commands call the same Network/Junction update functions as the Inspector, so there is no parallel editing model;
- the Delete tool remains available but is visually de-emphasized; Delete-key and selected-object deletion remain unchanged.

This establishes the intended interaction hierarchy: **Select → manipulate / quick edit → precision tune in Inspector / section dock**.

### Phase 3C viewport / camera UX

The Network viewport now uses a wider engineering-scale baseline:

- 2D `100%` spans 600 m instead of 250 m, so the default two-junction project is visible without immediately pressing Fit;
- Network 2D can zoom out to 20% for multi-junction layout work;
- map and engineering geometry share the same view-span parameter, preserving overlay registration at every zoom;
- `+` means zoom in and `−` means zoom out, with local Fit and 100% controls beside the canvas.

Network 3D navigation is explicit:

- default mode = **Pan**;
- **Orbit** can be selected explicitly;
- middle-drag or Shift+left-drag always Orbits;
- wheel zoom is cursor-anchored;
- two-finger gestures pan and pinch-zoom;
- Fit recenters without changing orientation;
- Iso and Top provide deterministic engineering viewpoints;
- double-click performs Fit.

## Quality gates

The branch quality workflow now checks all of the following before acceptance:

1. geometry/model/workspace regressions;
2. TypeScript;
3. lint;
4. both production build paths — Next/Vercel and original Sites/vinext;
5. a real headless-Chrome Network workflow through the rendered UI.

The browser acceptance flow covers:

`fresh project → create Junction → connect semantic ports → add/drag PI → create one-lane mismatch → configure curb lane transition → resolve section profile → Undo → Redo → reload → verify persisted state → inspect RoadLink section dock → open resolved Network 3D`

The browser gate uses Chrome DevTools Protocol directly from Node and does not add Playwright/Puppeteer to the application dependency graph. Phase 3A hardening adds stable data-contract selectors, per-command CDP timeouts, deterministic viewport sizing, checkpointed JSON diagnostics, and separate 2D / resolved-3D screenshots. Browser artifacts are retained for only 3 days.

To conserve free CI/deployment quotas, feature-branch Quality runs through the pull-request event rather than duplicating both branch-push and PR runs. The audit Pages preview is manual-only and should be dispatched only at meaningful visual checkpoints. Application changes should be batched before moving the branch ref so external Git integrations such as Vercel also see fewer pushes.

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

Completed foundation milestones now include RoadLink schema-v2 curves, explicit one-lane transitions, the contextual section/profile dock, direct Junction section editing, transaction-safe Undo/Redo, browser-level acceptance coverage, and resolved RoadLink 3D surfaces.

Next priorities:

1. Add precision interaction aids in the root workspace: Arm angle snapping/alignment guides and a direct Map Align mode.
2. Expand browser visual regression to a small set of deterministic golden scenarios, including Slip, auxiliary lanes and asymmetric sections.
3. Fold the remaining useful Road Alignment Lab operations into the root Network workspace, then retire it as a separate user-facing mode.
4. Profile and stabilize interaction/render performance for networks around 20–50 Junctions.
5. Research and model frontage / parallel roads using Corridor ownership.
6. Only then expand toward ramps/interchanges or more complex corridor topology.

## Non-goals

The Network Foundation does not add:

- traffic assignment
- capacity analysis
- LOS
- signal optimization
- microsimulation
- queue simulation

The product remains an engineering-informed concept design and visualization environment.
