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
   ├─ sectionProfile
   │  ├─ review
   │  └─ linear
   └─ components[]
      ├─ lane lifecycle
      └─ edge-width lifecycle
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
- persisted station-based corridor components owned by the RoadLink

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

RoadLink schema v3 retains the v2 rule that it does not silently invent lane topology when the two ends disagree.

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

Network project schema is **v3**. The browser storage key remains:

`thai-street-network-project-v1`

The storage key is intentionally retained so existing local projects are discovered and migrated instead of being orphaned. On restore:

- schema-v1 projects migrate directly to v3 with existing via points preserved at R0 and section profile set to `review`;
- schema-v2 projects migrate to v3 with `components: []`;
- embedded Junction Designs still migrate through the existing Design migration path;
- schema-v3 persists RoadLink station components as semantic project state, not renderer geometry.

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
- RoadLink surfaces continue to use the shared resolved section/alignment geometry, including schema-v3 station components;
- the reference map remains a ground texture.

The standalone Junction 3D view also consumes the shared Junction scene resolver for its raised sidewalk/island meshes, so Network 3D does not own a parallel Junction geometry implementation.

Phase 4C restores the missing presentation detail without weakening geometry ownership:

- lane dividers, curb lines, crossings, stop/yield markings and arrows are tagged by the existing 2D semantic renderers and projected as a **detail-only transparent overlay** above the resolved road surfaces;
- traffic signals, configured trees and lights use the existing `furnitureFaces()` resolver and are transformed into Network world coordinates as actual 3D faces;
- the overlay contains no road/median/sidewalk fill, so it cannot replace or override the resolved Junction / Slip / RoadLink geometry;
- raised median/sidewalk surfaces are drawn above the marking overlay, keeping zebra/linework visually below physical islands.

### Phase 4G.1 open local imagery + access labels

The imagery workflow now distinguishes **availability/license/access** from visual quality:

- **OpenAerialMap · Local Open Imagery** is the default open imagery choice. It uses HOT's Global Mosaic TMS with no API key; low zooms show the coverage grid and zoom 14+ resolves real imagery where coverage exists.
- When OpenAerialMap is selected, both Network and Junction workspaces query the OAM STAC catalog around the current center (3 km radius) and report available image count, latest capture date when present, and best sample GSD when metadata provides it.
- Provider metadata exposes explicit access badges such as `OPEN · NO KEY`, `FREE QUOTA · API KEY`, and `FREE TIER · API KEY` instead of treating API-key providers as automatically paid.
- Esri remains a high-resolution fallback with a free basemap quota under ArcGIS Location Platform; MapTiler remains a credentialed fallback whose free plan is primarily intended for testing/personal/non-commercial use.
- Longdo is intentionally not consumed via undocumented/direct tile URLs. Its published terms require the official Longdo Map API with a URL-bound API key, so a dedicated SDK integration should be implemented separately if added.

### Phase 4G multi-provider basemap registry

The reference-map layer is provider-driven rather than a binary Street/Satellite switch:

- **Street / Map:** OpenFreeMap styles, OpenStreetMap Standard, OpenTopoMap and Esri Streets;
- **Aerial / Satellite:** EOX Sentinel-2 Cloudless 2016, Esri World Imagery and MapTiler Satellite;
- no-key providers remain immediately usable for public preview and concept context;
- Esri and MapTiler use BYOK credentials stored separately in browser localStorage, never in NetworkProject, Design JSON or repository source;
- both 2D reference maps and 3D ground textures consume the same provider registry and credentials;
- provider attribution changes with the selected source;
- high-resolution commercial/free-tier keys should be origin-restricted to the deployed host.

Sentinel-2 remains useful for broad context only. For curb/lanemarking-level visual reference, select Esri World Imagery or MapTiler Satellite with a valid browser API key and verify imagery currency/resolution at the site.

### Phase 4F map scale + open satellite reference

The map reference now exposes engineering-scale context rather than acting as a purely visual backdrop:

- the Network world remains metre-based and the 2D canvas shows a dynamic 1–2–5 scale bar that tracks zoom;
- vector-map recentering converts workspace ground metres to Web Mercator projected metres, preserving local scale registration at Thai latitudes;
- **Satellite · Sentinel-2 Cloudless 2016** is available as a no-key global raster reference from EOX WMTS;
- the 2016 layer is used because it is CC BY 4.0; attribution is rendered on-map;
- Sentinel-2 native detail is roughly 10 m, so it is suitable for corridor/site context, not curb, lane-marking or orthophoto-grade tracing;
- higher-resolution commercial/free-tier imagery should be integrated through user-supplied credentials rather than hard-coded into the public repository.

### Phase 4E.2 continuous Arm preview

Arm dragging now separates **interaction preview** from **engineering commit validation**:

- pointer moves update the Arm continuously without running the full Junction validation stack on every frame;
- the selected Arm is rendered last in the hit layer and receives a larger zoom-compensated corridor/grip target;
- the final angle/length is validated once against the transaction baseline on pointer-up;
- invalid release positions revert atomically, while valid positions commit as one Undo step;
- preview state is never persisted during the active drag transaction.

### Phase 4E.1 Arm drag responsiveness hardening

Direct Arm manipulation was made more forgiving and less expensive per pointer move:

- the entire visible Arm hit corridor is now a drag target; users no longer need to acquire the small endpoint grip first;
- dragging from the middle of an Arm uses pointer delta relative to the original endpoint, so the Arm does not jump to the mouse-down position;
- the endpoint grip keeps an approximately constant screen-space hit radius across Network zoom levels;
- pointer capture is finalized on normal up, cancel and lost-capture paths;
- high-frequency pointer moves are coalesced with `requestAnimationFrame`, with the final pointer sample flushed synchronously on release;
- project persistence is skipped during an active drag transaction and written once at completion instead of serializing localStorage on every frame;
- the hidden Network 3D view no longer resolves Junction / RoadLink / furniture scene geometry while the user is editing in 2D.

These are interaction/performance changes only. Arm geometry still uses Design v6 and RoadLinks still follow semantic Arm ports.

### Phase 4E free Arm manipulation + optional precision guides

Arm manipulation remains deliberately free-form so map-based concept design is not forced onto an artificial angular grid:

- normal drag writes continuous angle / length values at the Design-v6 engine's existing 0.01 precision;
- holding **Shift** while dragging snaps the **world heading** to 15° increments;
- without Shift, being near a 15° heading only shows an `ANGLE` guide; it does not modify the Arm;
- when the dragged Arm is nearly parallel/anti-parallel to another active Arm, the workspace shows an `ALIGN` guide using that other Arm's real world heading;
- live world heading and Arm length are shown beside the dragged endpoint;
- numeric Inspector fields expose 0.01° / 0.01 m precision instead of rounding the display to integers;
- linked RoadLinks continue to follow the semantic Arm port during both free and snapped manipulation.

Map alignment remains a separate future transform: Phase 4E changes Arm geometry only when the user actually drags the Arm, while a future Map Align mode will move/rotate the Network reference frame without silently reshaping individual Arms.

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

Completed foundation milestones now include RoadLink curves, explicit one-lane transitions, the contextual section/profile dock, direct Junction section editing, transaction-safe Undo/Redo, browser-level acceptance coverage, resolved RoadLink 3D surfaces, calibrated local references, the shared station-profile engine, and persisted schema-v3 station components.

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

### Phase 5B.1 station/profile foundation

RoadLink section geometry now uses a shared deterministic station-profile layer without changing Network schema v2 or saved project behavior.

The foundation consists of:

- `alignment.stationOffsets(points)` as the canonical cumulative station array for a resolved alignment;
- `projectAlignment()` returning both engineering `station` and signed lateral `offset` in addition to the existing normalized projection data;
- `station-profile.ts` with reusable constant, endpoint-linear and localized transition profiles using `linear`, `smooth` or `hold` interpolation;
- the RoadLink resolver using those profiles for median width, lane width, lane-count transition, edge-band width and sidewalk width;
- the RoadLink section dock using the same shared station-series sampler rather than maintaining a second interpolation implementation.

This phase deliberately does **not** persist arbitrary component lifecycles yet. Existing schema-v2 `review`, `linear` and explicit one-lane transition behavior remains the source of truth, so saved projects and visible geometry remain backward compatible. The next step can add RoadLink-owned station components (lane add/drop, taper, widening and edge components) on top of this tested profile primitive instead of introducing feature-specific geometry.

### Phase 5B.2 persisted station components

Network schema v3 adds RoadLink-owned lifecycle components while keeping the storage key and all Junction Design v6 semantics unchanged.

Two persisted component families are introduced first:

- `lane` — one auxiliary-lane lifecycle with direction, curb/median side, start/end station and independent taper-in/taper-out lengths;
- `width` — a localized width delta applied to a sidewalk or an existing continuous edge band such as bike, buffer, shoulder or motorcycle space.

Engineering rules in this phase:

- station components are semantic RoadLink state and are stored in project JSON;
- they are active only on a resolved `linear` RoadLink section profile;
- Phase 5B.2 initially prohibited overlapping same-direction auxiliary lanes; Phase 5B.4 removes that temporary restriction because the unified lifecycle resolver now preserves independent lane identity and deterministic side stacking;
- edge-width components may overlap and combine additively, but width is clamped at zero;
- the renderer inserts additional centerline samples at lifecycle/taper stations so a transition cannot disappear merely because the base alignment has few vertices;
- curb-side auxiliary lanes widen outward; median-side auxiliary lanes shift the common lane stack outward while keeping the median datum explicit;
- 2D, section dock and Network 3D all consume the same `resolveLinkSectionGeometry()` result.

Schema migration is intentionally small: v1/v2 projects gain `components: []`; no Junction Design data is rewritten. Review mode cannot be re-enabled while persisted station components remain, preventing the UI from silently discarding corridor lifecycle semantics.

### Phase 5B.3 unified lane lifecycle runtime

RoadLink lane-count changes now resolve through one runtime lifecycle model before plan, cross-section or 3D geometry is generated.

This deliberately keeps Network schema v3 unchanged. Persistence remains backward compatible:

- Junction endpoint lane-count mismatch still stores its explicit side/center/length in `sectionProfile.forwardLaneTransition` or `backwardLaneTransition`;
- corridor auxiliary lanes still persist as RoadLink `components[]`;
- both forms normalize to `ResolvedLaneLifecycle` at runtime with a common direction, side, profile and source identity.

The runtime distinguishes two provenance classes:

- `junction-endpoint` — the extra lane implied by a one-lane mismatch between the two Junction ports;
- `roadlink-component` — a persisted station-based auxiliary lane owned by the corridor.

After normalization, lane count, taper sampling, divider identity and lateral stacking are derived by the same lifecycle resolver. This removes the previous duplicate endpoint/component lane-count branches from `network-link-geometry.ts`.

The Junction side also shares the same low-level easing primitive now: `Pocket` / receiving-lane taper-out uses `lifecycle-math.taperOutFactor()`, while station profiles use the same `smoothstep()`. Ownership and persistence remain separate, but the longitudinal taper math is no longer duplicated.

Median-side stacking is now deterministic when an endpoint transition and a corridor auxiliary overlap: each lifecycle keeps a separate divider identity and common lanes shift by the total active median-side lifecycle width. Curb-side lifecycle stacking follows the same ordered rule outside the common lane stack.

This phase does **not** move Junction Pocket / receiving-lane ownership out of Design v6. Pocket geometry remains local to the Junction arm. The architectural boundary is now prepared for the next step: mapping selected Junction auxiliary treatments into corridor lifecycle proposals without creating a second taper or lane-identity engine.

### Phase 5B.4 Junction auxiliary → corridor proposal

The Network Inspector can now derive explicit proposals from Pocket / receiving-lane semantics on both Junction ports of a selected RoadLink. The proposal layer is intentionally separate from persistence: it reads Design v6, maps the source to RoadLink direction/side/stationing, validates the boundary, and mutates engineering state only after an explicit Apply action.

Direction mapping is fixed by the semantic port end:

- FROM outgoing → RoadLink forward;
- FROM incoming → RoadLink backward;
- TO incoming → RoadLink forward;
- TO outgoing → RoadLink backward.

Junction `left` auxiliary maps to corridor curb side; Junction `right` maps to median side, matching the current LHT section convention.

The proposal checks the actual Junction treatment factor at `arm.length`, which is the Network port datum. This prevents a common but invalid shortcut: copying a local Junction Pocket that already tapers to zero before the port into a RoadLink and thereby creating a disconnected lane. Such cases are reported as `Local only` with the measured gap and are not applicable.

A proposal is applicable only when:

- the Junction auxiliary is fully active at the port;
- the remaining full-length + taper fits inside the RoadLink;
- endpoint topology/edge continuity can be resolved;
- component capacity remains within the Network v3 limit.

When applicable, only the treatment **remaining beyond the port** is copied. A FROM-boundary continuation is full-width at station 0 and tapers out later; a TO-boundary continuation is full-width at the final RoadLink station. `windowStationProfile()` therefore now supports boundary-active zero-taper ends instead of forcing every lifecycle to zero at both link boundaries.

Apply is atomic: it switches the RoadLink to resolved linear mode when needed and creates the missing lane lifecycles in one Network history transaction. Multi-lane proposals create independent components with stable IDs. Because Phase 5B.3 established deterministic lifecycle stacking, overlapping same-direction corridor lane components are now supported rather than rejected.

No schema bump is required. The proposal itself is transient and no hidden live binding is introduced between Junction Design v6 and RoadLink v3; after Apply, the RoadLink components are normal explicit corridor engineering state. Fractional handoff (the Network port falling inside a Junction taper) remains blocked rather than approximated, and is a future cross-boundary feature if that workflow proves necessary.

### Phase 5B.5 explicit cross-boundary handoff

Pocket / receiving-lane continuity is now an explicit engineering intent rather than an inferred visual coincidence.

Design v6 gains an optional backward-compatible Pocket field:

- `continuation: 'local'` — existing behavior; full-length + taper are contained inside the Junction arm;
- `continuation: 'corridor'` — the auxiliary lane stays full-width from its treatment origin through the semantic Network port. Longitudinal taper ownership moves to the connected RoadLink.

No Design or Network schema number bump is required because both additions are optional and existing v6/v3 files remain valid. Network v3 lane components may now carry optional `JunctionAuxiliarySource` provenance identifying handoff id, Junction, arm, source direction/side and lane identity.

The Network Inspector exposes the choice explicitly as **Junction only** versus **Continue into Corridor**. Continue performs one atomic Network transaction:

1. set the source Pocket / receiving lane to corridor continuation;
2. recompute the source at the semantic port;
3. switch the RoadLink to resolved linear mode when needed;
4. adopt an equivalent legacy 5B.4 component when possible or create the missing lane components;
5. tag those components with handoff provenance.

For a normal Junction-only treatment that previously tapered to zero before the port, explicit Continue does **not** stretch that taper across the boundary. Instead the Junction lane stays full to the port and the existing taper length is resolved from RoadLink station 0 (or toward the TO boundary for the reverse direction). If the user's full-length already extends beyond the port, only the remaining full segment plus taper is carried into the corridor.

The reverse action **Back to Junction only** removes only RoadLink lane components owned by that handoff id and restores local Pocket taper behavior. Manually created corridor components are left untouched. If a handoff-owned component is manually edited through generic Corridor Lifecycle controls, its provenance is cleared immediately, intentionally converting it to independent corridor state and preventing hidden synchronization.

This closes the semantic boundary without moving Pocket ownership out of Design v6: the Junction still owns the local treatment, RoadLink still owns corridor geometry, and the explicit handoff records why the two meet continuously.

### Phase 5B.6 corridor handoff integrity cleanup

Cross-boundary handoff is now audited after later Network edits instead of assuming that the state created in Phase 5B.5 remains valid forever.

The integrity owner remains `junction-auxiliary-proposal.ts`, not generic `linkIssues()`. This avoids a circular dependency from RoadLink foundation code back into Junction auxiliary semantics.

For each RoadLink lane component carrying `JunctionAuxiliarySource` provenance, the audit resolves the current Junction source and classifies four failure modes:

- **STALE** — the source still exists and declares corridor continuation, but lane identity, station range or taper no longer matches the current Pocket / receiving-lane treatment;
- **ORPHAN** — provenance no longer resolves to the current linked Junction/arm/side/direction, the source auxiliary has been removed, or the source no longer declares corridor continuation;
- **OUT OF RANGE** — the current RoadLink is shorter than the remaining full-width + taper distance required by the Junction handoff;
- **TOPOLOGY** — endpoint lane/edge topology no longer supports a resolved linear RoadLink transition.

The Network Inspector exposes a dedicated **HANDOFF INTEGRITY** card only when one of these conditions exists. No audit condition mutates engineering state automatically.

Available explicit actions are:

- **Repair from Junction** — remove/rebuild or adopt the RoadLink-owned lane lifecycle using the current Junction source. This is enabled only when RoadLink length and endpoint topology can support the treatment.
- **Detach as manual** — preserve the existing RoadLink geometry exactly but delete its Junction provenance. The lane becomes an independent corridor lifecycle and is excluded from future handoff auditing.
- **Back to Junction only** — restore local taper ownership on the source Pocket / receiving lane and remove only components owned by that handoff. This can also recover from an orphaned proposal when the persisted provenance still points to an existing raw Pocket.

Important behavior after later edits:

- changing Pocket taper / full length or lane count does not silently rewrite RoadLink station geometry;
- reducing a multi-lane source produces a repairable stale issue, and Repair removes surplus owned lane identities;
- shortening a RoadLink below the required treatment length produces an out-of-range issue and blocks Repair rather than clipping the taper;
- changing endpoint lane topology blocks Repair until the RoadLink transition is resolved explicitly;
- removing a source auxiliary leaves existing corridor geometry intact until the user chooses Detach or Back to Junction only;
- generic manual editing of a handoff-owned lifecycle still detaches provenance immediately, so there is no hidden synchronization path.

No Design or Network schema bump is required. The cleanup operates entirely on the optional Phase 5B.5 provenance already stored in Network schema v3.

### Phase 5C.1 Existing / Alternative scenario foundation

Scenario comparison is introduced as a workspace layer **above** NetworkProject rather than by adding scenario fields to every Junction, RoadLink or geometry primitive.

The persisted container is:

```
NetworkScenarioWorkspace v1
├─ activeScenarioId
└─ scenarios[]
   ├─ Existing      → NetworkProject v3
   ├─ Alt A         → NetworkProject v3
   └─ Alt B ...     → NetworkProject v3
```

This preserves the existing ownership boundary: Junction Design v6 and NetworkProject v3 remain the complete engineering source of truth for one scenario. Geometry, handoff, station-profile, validation, 2D, cross-section and 3D engines do not need scenario-specific branches.

Existing project storage remains discoverable through the same `thai-street-network-project-v1` key. On restore:

- legacy NetworkProject v1/v2/v3 JSON is normalized using the existing migration path and wrapped as a single **Existing** scenario;
- Scenario Workspace v1 normalizes every contained NetworkProject independently;
- malformed scenario containers fall back to a fresh workspace rather than partially mixing invalid scenario state.

Scenario behavior in 5C.1:

- exactly one scenario has `kind: 'existing'`; it is the non-deletable baseline;
- **+ Alternative** deep-copies the currently active NetworkProject, so Alt A may be derived from Existing and a later alternative may intentionally be derived from another alternative;
- alternatives retain `sourceScenarioId` provenance but are independent engineering states after creation;
- scenario names are unique and editable; workspace size is capped at eight scenarios;
- switching scenario replaces the active NetworkProject without changing shared reference layers such as online map, local calibrated image, camera pan/zoom or view mode;
- Undo/Redo history is stored separately per scenario and restored when switching back;
- Reset affects only the active scenario;
- deleting the active alternative returns to Existing.

The scenario strip is intentionally a workspace/navigation concern. No cross-scenario live binding exists: editing Alt A does not mutate Existing, and later changes to Existing do not propagate into an already-created alternative.

Phase 5C.1 does **not** yet draw comparison overlays or calculate deltas. Those belong in the next scenario phase after the persistence/switching/isolation foundation is proven through migration, model regression and browser acceptance.

### Phase 5C.2 scenario comparison mode

Scenario comparison remains a read-only workspace layer above the independent NetworkProject v3 states introduced in Phase 5C.1.

The comparison engine accepts two complete NetworkProjects:

- **reference** — the scenario selected for comparison / ghost display;
- **active** — the scenario currently being edited.

All numeric delta values are reported as **active − reference**. The comparison does not write to either project, does not enter Undo/Redo history and is not persisted as engineering state.

#### Semantic metrics

The summary intentionally goes beyond raw object counts. It reports:

- Junction count;
- RoadLink count;
- total enabled main-lane count across Junction arms;
- incoming Pocket lane count;
- outgoing Receiving-lane count;
- number of arms carrying a median;
- summed enabled-arm median width as a comparison index;
- persisted RoadLink station-component count;
- total resolved RoadLink alignment length.

#### Object-level change classification

Objects use their stable Junction / RoadLink ids inherited when an Alternative is duplicated.

Each object is classified as:

- **added** — exists only in the active scenario;
- **removed** — exists only in the reference scenario;
- **changed** — same semantic id exists in both but relevant engineering state differs.

Changed Junctions identify categories such as geometry, active arms, main lanes, median, Pocket / Receiving treatment, cross-section and traffic-control settings. Changed RoadLinks identify endpoint changes, resolved alignment / port movement, endpoint section changes, section transitions and station components.

The RoadLink comparison intentionally checks resolved alignment and endpoint sections in addition to the persisted RoadLink object. A Junction move or lane-section edit can therefore appear as both a Junction change and a dependent RoadLink change, which reflects the actual network-level design impact rather than only JSON ownership.

#### 2D reference ghost

The active scenario remains the only editable drawing. The selected reference can be shown as an opt-in **Ghost** layer beneath it in 2D.

The ghost renderer:

- has dedicated `data-network-comparison-*` selectors;
- uses `pointerEvents="none"` and never exposes active handles, ports or selection hit targets;
- draws RoadLink reference edges / centerline as dashed reference geometry;
- renders Junction reference geometry translucently with reference arm axes;
- is intentionally not shown in 3D in Phase 5C.2.

When the ghost is visible, **Fit** uses the union of active and reference project bounds so moved or removed reference geometry is not clipped.

The Inspector shows the metric table plus up to twelve changed objects with semantic reasons. The compact comparison bar remains visible above the workspace so users can switch the reference scenario and toggle the ghost without leaving the design canvas.

No Scenario Workspace, NetworkProject or Junction Design schema bump is required.
