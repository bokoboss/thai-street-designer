# U-turn bridge and U-turn under a bridge

Review-plan PR-07 (templates T04 and T05), based on `main` at `55c6a62` (after PR #67). Both place ordinary pieces in one
command (one undo step). No numeric criterion is introduced; starting values are tool values, TO_VERIFY.

## U-turn bridge (horseshoe) — `core/road-first/uturn.ts`

`uturnBridgePlan(project, {mainId, from, station, radius, height, grade}, id)` builds one one-way ramp:

1. diverges from the turning traffic's own outer edge at `station` at 12° (the ramp attachment rules then snap it to the
   edge and check direction, spacing and junction clearance as for any ramp);
2. runs beside the road at offset `radius` while it climbs at `grade` to `height` above the road;
3. turns to the right over the road on a half circle of `radius` (two 90° fillets of the canonical alignment);
4. comes back beside the other carriageway, descends and merges into its outer edge at the same station.

In left-hand traffic the U-turn is a right turn, so traffic leaves from the left (outer) edge and joins the left edge
of the opposite direction. `from` chooses the traffic along the road's drawing direction or the opposite one; the frame
is built from the road direction, so a road drawn either way gives the same physical result.

The ramp crosses the road once at the apex; the ordinary pipeline makes that crossing grade-separated with the ramp over
and PR #66 measures its clearance. Profile: level at the road to the end of the diverge, straight climb, level through the
half circle, straight descent, level to the merge (vertical curves can be added on the ramp afterwards).

Starting values: radius = half the road width + half the ramp lane + 1.5 m (the smallest that keeps the parallel runs off
the road); height and grade from the level criteria (bridge rise, ramp grade). Refusals with a reason: radius below that
minimum, road too short for the footprint, road not straight over the footprint (curved mains later), one-way road, a
road still on chord stations (convert first), and anything the ordinary ramp rules refuse (e.g. near a junction). The
piece carries `origin.template = 'uturn-bridge'`; the template block removes it in one step.

Not yet: acceleration / deceleration lanes (4C), piers, a two-lane or curved-main variant.

## U-turn under a bridge

`uturnUnderPlan(project, compiled, candidateId)` adds a median opening of type `uturn` to the lower road of a
grade-separated crossing, centred under the measured structure overlap (`clearance.spanUnder`) and shorter than it.
Length starts at the existing U-turn opening value. Refused when the crossing has no upper road chosen, the lower road has
no median or only one direction, the overlap cannot be measured, or a median opening is already there. It compiles into
the link like any median opening (plan, 3D, export).

## 3D picture

Parapets are drawn see-through: opaque parapets hid narrow raised decks (a one-lane ramp) behind them in the oblique view.

## Verification

- `scripts/verify-uturn.cjs`: both traffic directions × road drawn either way (sides, same station, right turn), ramp
  over the road with the set clearance and nothing to check, profile within the ramp grade, saved file valid, one undo,
  remove the set, refusals; under-bridge opening centred under the structure, compiled, one per structure, refusals.
- `scripts/verify-vertical-browser.mjs`: ghost, place, 3D, undo; `scripts/verify-design-browser.mjs`: under-bridge
  U-turn on the crossing panel and undo. Screenshots `artifacts/uturn-bridge-preview.png`, `artifacts/uturn-bridge-3d.png`.
