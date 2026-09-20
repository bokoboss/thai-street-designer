# Engineering-model remediation — 20 September 2026

This updates the existing application and visual identity. It is a **Concept Design Tool — Not for Detailed Engineering Design**. No compliance certification is provided.

## Cross sections and pockets

- New designs use Preserve Corridor Width. Schema-2 designs migrate to schema 3 with Allow Widening, preserving their previous explicit geometry rather than silently changing saved pockets.
- Each arm has a corridor constraint shared by both directions. The reference width is the current base cross section (main lanes, median, bands and sidewalks), not a surveyed or historically frozen ROW boundary.
- In preserve mode, median-side pockets consume one shared median reserve. Independent longitudinal profiles track both median edges; different storage/taper lengths can produce an asymmetric median. Main lanes and outside approach/sidewalk boundaries stay fixed.
- Curbside pockets consume shoulder/buffer widths in order. Bicycle/motorcycle lanes and sidewalks are not treated as expendable reserve. Bands regain their width through the pocket taper.
- Insufficient space rejects the proposed edit and retains the last valid design, reporting the deficit and alternatives. A 0.20 m residual is solely a polygon-drawing threshold, not a Thai or other engineering standard.
- Allow Widening retains the median and widens outward. The inspector reports base/result widths, added width, lane counts and residual median.
- Feedback distinguishes Geometry Error, Engineering Warning and Design Note. Corner/slip-lane land requirements are explicitly outside the straight-approach width accounting.

## Roundabout geometry v2

- Replaced arbitrary long cubic connectors with exact external circular fillets tangent to the approach curb and circulating outer circle. Entry and exit radii are independently controlled.
- Central island, optional apron and circulating roadway have separate dimensions. Circulating lane count determines actual lane markings. The one-lane preset is the primary reviewed configuration.
- Each arm has a finite shaped splitter island, a separate approach median and a deliberate gap/transition between them. Splitters participate in 2D/3D geometry and crossing masks. Ordinary medians retain the same pocket datum as the carriageway.
- Crossings use their setback and intersect the actual flared curbs. Yield markings follow the circulating boundary; arrows follow clockwise LHT circulation.
- Entry/exit widths are derived from the arm cross section, pocket configuration and splitter footprint. No vehicle swept-path or speed analysis is implied.
- Geometry checks reject overlapping approach fillets, self-intersecting road/sidewalk/island outlines and insufficient approach length. Review warnings cover overly flat entry curvature, narrow splitter clearances and multi-lane assumptions.

Guidance: [FHWA Roundabouts: An Informational Guide, geometric design chapter](https://www.fhwa.dot.gov/publications/research/safety/00067/000676.pdf). Component separation, channelization and entry deflection informed the conceptual model; LHT is mirrored appropriately. Numerical controls are not presented as compliance checks. The old standards-check panel was removed.

## UI

- Preserved left/global, center/canvas and right/inspector architecture and theme.
- A sticky selected-arm/direction context controls section, divider and roadside edits.
- Inspector groups: lanes/section, turn lanes, alignment, intersection treatment, markings, roadside and advanced/copy. Basic section controls open first; lower-frequency controls are folded.
- File and Export menus replace permanent Open/Save/SVG/PNG/JPEG buttons. Recovery remains prominent. Undo/redo and 2D/3D remain beside the canvas.
- Bulk two-direction divider/roadside actions remain available in Advanced.

## Free Draw

- Roads now optionally carry editable polyline vertices while existing two-point roads still work.
- Click successive points and finish the alignment; insert intermediate vertices, drag vertices, delete internal vertices and snap endpoints. Shared endpoint nodes move connected road ends together.
- Stations, projection and parallel geometry are pure modules. Shared junction offset and pocket/reserve utilities are reused; the former independent median minimum was removed.
- Existing graphical T-junction and median-opening overlays remain available and are still schematic. Pocket overlays must fit within one straight segment.
- Fixed ID generation on browsers without secure-context randomUUID support.

## Automated verification

Passed:

- `node node_modules/typescript/bin/tsc --noEmit`
- `node scripts/verify-junction.cjs`: existing render, three-arm, skew/slip, median, stop/divider edge, long-road, migration, roadside, camera and gesture regressions.
- `node scripts/verify-pockets.cjs`: independent sections, incoming/outgoing additions, skew/slip and roundabout render cases. Legacy widening fixtures now explicitly select widening; the very wide roundabout fixture uses a larger circle to satisfy the new tangent geometry.
- `node scripts/verify-constraints-roundabout.cjs`: shared reserve, asymmetric profiles, fixed outer bounds, deficits, curb reserve, schema-2 migration and nine roundabout cases (four/three arms, skew, unequal widths, 10/30 m islands, splitter/crossing/tangent checks).
- `node scripts/verify-network.cjs`: polyline stations/projection, bend guards, snapping, shared-node movement and shared pocket constraints.
- `node scripts/verify-visibility.cjs`: 9,723 overlap probes across 36 camera angles.
- Production build completed before publication.

## Manual Site-preview checks

- 6 m median + one 3.25 m pocket: median locally reduced to 2.75 m; corridor stayed 23 m. A second pocket was rejected with a 0.70 m deficit. Widening mode produced 26.25 m and explicitly showed +3.25 m. Storage and taper edits regenerated.
- Four-arm one-lane roundabout, three-arm skewed layout, unequal incoming/outgoing widths, narrow and wide islands: inspected actual rendered geometry, splitters, sidewalks, yield/crossing placement and LHT arrows.
- Roundabout 3D and PNG export preview completed; download action became available.
- Inspector context, independent directional width, accordion groups, file/export menus and undo/redo inspected.
- Free Draw: created a three-vertex road, inserted/moved/deleted a vertex, drew another road snapped to its endpoint and verified a shared node appeared.

## Limitations and deferred work

- No swept paths, fastest-path solver, visibility analysis, capacity analysis or standards certification. Multi-lane roundabouts remain conceptual; detailed entry-lane continuity/vehicle overlap is not solved.
- No terrain, grades, vertical curb ramps or truck-apron structural/vertical design. Raised islands and texture-based markings retain the concept-model simplifications.
- Free Draw bends are polyline joins, not engineered curves. Shared nodes coordinate endpoints but do not yet trim/merge complete intersection footprints; small seams at angled link joins remain possible. There is no automatic mid-link splitting or junction-editor handoff for a network node yet.
- The full node-to-junction/roundabout workflow, automatic crossing detection/splitting, curved alignments and optional vehicle-path visualization are deliberately deferred (P2/next phase). The legacy Free Draw overlays are not represented as finished network intersections.
- Physical touch devices and every extreme parameter combination were not manually retested. Existing pure gesture tests passed; 2D/3D gestures and export code paths were preserved.
