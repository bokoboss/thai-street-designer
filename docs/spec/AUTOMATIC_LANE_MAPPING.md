# Phase 4C — PR C: Automatic lane connections

The result is a derived, read-only mapping for ordinary three-/four-leg junctions and ramp terminals.
PR D owns user-authored connector overrides. No project schema or saved geometry changes in PR C.

## Junction movements

- `automaticLaneMapping(Design)` uses the existing semantic arms, turn arrows and resolved lane centres. Invalid base geometry produces a review item and no connections.
- Bearings follow incoming travel, rather than the arm's outward direction. On the y-down plan, left turns have negative deflection and right turns positive deflection.
- Through legs must be reciprocal, uniquely closest opposite legs within ±45°. A side leg within that angular range is not automatically through: a 40° skew junction still has left/right turns, and a skew T stem has no invented through exit. Non-through deflections of 40–155° may be turns. The angular limits and 10° ambiguity margin are `TO_VERIFY` tool heuristics, not design criteria.
- Lane order is median to curb, as in `lane-configuration.ts`. Right turns take median receivers; left turns take curb receivers. Through assignments minimize lateral displacement in the travel-bearing bisector frame while preserving lane order. Dedicated turn lanes and gaps between through lanes do not force adjacent lanes into a centered receiver block.
- There is no hidden many-to-one merge. Excess sources produce review items; only feasible 1:1 assignments are emitted for each approach/movement. Different approaches can share a receiver; the result does not imply simultaneous conflict-free movements.
- Missing or ambiguous exits, no receiving lanes, incoming lanes without a usable movement, and U-turn arrows require review. Existing Slip routes retain their geometry and are not duplicated through the junction core. Unfit Slip overlays are reported by the existing Slip validator without changing the core mapping or footprint.

## Ramp terminals

`automaticRampLaneConnections(Road[], CompileResult)` reads the same compiled project used by plan, section, markings and 3D. Start means diverge; end means merge. Anchor side determines forward/backward traffic in Thai left-hand operation.

A mapped terminal requires a one-way, one-lane ramp, an authored auxiliary, continuous compiled coverage of that auxiliary, no overlapping lane reduction, and a drawn endpoint aligned with the resolved auxiliary centre and traffic direction. Requested settings alone are not evidence that a lane exists: the compiler may omit it at incompatible endpoints or junction approaches. Zero-taper terminals are sampled from the auxiliary side of the attachment. Sampling and alignment tolerances are numerical tool tolerances, not engineering dimensions.

Unresolved geometry is reported rather than repaired or widened silently. A mid-block reduction away from the terminal remains compatible. Merged auxiliaries retain the identity from `auxLaneRuns`; where that canonical merged geometry still tapers to zero at a terminal, that terminal requires review.

## Identity and geometry

- Mapping is re-derived and never serialized. Legacy Design/Network/Road-first files use the existing migration and compile paths.
- Junction connector IDs include source, movement and receiver references within the current Design. Road-first leg bindings resolve those current arm slots back to road ID and ahead/behind; arm slots are not persistent road identity.
- Anchors use `resolvedLaneCenterY` at `armTreatmentOrigins` for the appropriate incoming/departure direction, with canonical `edges()` and rotation. They are mapping endpoints, not pavement markings or swept paths.
- The Design inspector exposes the mapping in its existing folded Thai review. Selected ramps show mapped/review status. No connector handles or override storage are added.
- Base pavement, markings, Slip geometry and the `edges(withSlip) === edges(withoutSlip)` invariant remain unchanged. Dimensions/default criteria remain `TO_VERIFY`; mapping does not certify engineering compliance.

## Acceptance and limits

`scripts/verify-automatic-lane-mapping.cjs` covers left/through/right in Thai traffic, dedicated and multipurpose main/auxiliary lanes, non-adjacent through lanes, receiver shortages, zero receiving lanes, ordinary/skew T and four-leg junctions, rotation, ambiguity, invalid geometry, unassigned/U-turn arrows, canonical direction datums, Slip, deterministic reopen, all four ramp terminal directions, merged auxiliaries, omitted lanes, stale endpoints, lane reductions and unchanged shared geometry.

Design browser acceptance checks generated junction mappings. Lane browser acceptance checks review before adding a ramp auxiliary and mapped status after the canonical lane is drawn. Existing golden, legacy migration, section, lane reduction, Slip and 2D/3D suites remain required. On Windows set `CHROME_BIN` to installed Chrome; test browser profiles use absolute paths.

Limits: no roundabout circulation, U-turn path planning, swept paths, conflict/signal simulation, capacity/LOS or standards-based taper checks. Complex/unresolved ramp compositions require review. The existing coincident auxiliary-run taper behavior is exposed, not silently changed; a geometry correction needs an explicit reviewed change. Manual connections and connector overrides remain PR D.

Merge only when GitHub Actions `test-and-build` and Vercel both succeed for the same latest head commit.
