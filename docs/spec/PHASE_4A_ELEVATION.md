# Phase 4A — Elevation and crossings (spec)

Source: roadmap Phase 4A; research `docs/research/2026-10-21-GAME-UX-INTERCHANGE-RESEARCH.md`; UX review
`docs/research/2026-10-21-UX-WORKFLOW-REVIEW.md`. Concept level only: no earthworks, no structural design, no standards
check of clearance or grade (those are 4E, with referenced sources).

## Model

- `Road.profile?: {station:number; z:number}[]` — vertical points (PVIs) along the road, sorted by station. Elevation
  between points is linear; before the first and after the last it is constant. No profile = `z = 0` everywhere, so every
  earlier file opens unchanged. Vertical curves are not modelled in 4A (a later slice may add them; the plan shows grade
  breaks honestly).
- `Decision.over?: roadId` on a `grade-separated` crossing: which road passes over. Absent = derived from the levels.
- Compile adds `CompileResult.crossings`: for every grade-separated crossing — the two roads, the point, `relation`
  (`over` | `unresolved`), `over`, `under`, and `gap` = z(over) − z(under) at the crossing (measured, not judged).
  It is copied to the compiled network (`NetworkProject.crossings`) so 2D, 3D, export and report read the same data.
- Links carry link-local levels (`RoadLink.levels`), junctions their level (`JunctionInstance.z`); the link geometry
  resolver returns `z` per station for every consumer.

## Rules

- **Same level** means |Δz| ≤ 0.5 m at the crossing (tool tolerance, not a standard).
- New crossings: same level → automatic junction (as today); different levels → grade-separated, higher road over,
  announced like an automatic junction.
- A junction whose roads are at different levels is reported (`ระดับถนนต่างกัน … ที่ทางแยก`); it is not split silently.
- `unresolved`: levels equal, or the road marked as over is not higher. Shown on the plan and in the report.

## UX

- Toast on a new junction keeps "เป็นทางต่างระดับ"; it now asks which road is over (inline choice), then shows the result.
- Crossing inspector: relation (A over B / B over A), measured gap, and "ยกถนนข้ามอัตโนมัติ" which writes a simple
  profile for the over road: rise, flat top over the other road, fall. Starting values (tool values, editable, not
  standards): 6.0 m above the lower road, 4 % ramps, flat top = other road's width + 10 m each side. One undo step.
- Flipping the relation lowers the previous over road's generated hump (points within it are removed) and raises the new
  over road — one undo step.
- Road inspector: profile points as numbers (station, z), add / remove; status bar of the section strip shows z at the
  station. A profile view is a later slice.
- 2D: the upper road is drawn above the lower one at a grade separation with an edge cue; selection picks the upper road.
- 3D: every surface follows z(s).

## Structures and underpasses (owner decision 2026-10-21)

- A stretch more than 0.5 m above ground is a **bridge**, more than 0.5 m below is a **trough**; both are computed from
  the profile (`structures` on the link geometry), not stored.
- Step 1 (this slice): the section keeps its widths; the treatment changes on the structure — sidewalks become concrete
  service walkways, the planted median becomes a concrete barrier, trees and street lights are left off.
  Bridges show deck sides and parapets; troughs show retaining walls from the road up to ground.
- Underpass ("X ลอดใต้" in the crossing inspector): the chosen road dips 6.5 m at 4 % (tool starting values, not
  standards; `DIP_DEFAULTS`), the ramps are an open trough, and the stretch under the crossing road is a tunnel box
  with portals (`NetworkCrossing.tunnel`). Choosing it flattens a previous rise; one undo reverts it.
- 2D: concrete finish and a dark outer line on bridges (dashed on troughs); the tunnel box is a dashed outline over the
  crossing road. 3D draws below-ground roads first, then the ground that hides the tunnel, then decks and parapets.
- Step 2 (Phase 4C): a custom structure section with width transitions between the at-grade and structure sections.
- Not checked yet (TO_VERIFY): vertical clearance, parapet height, tunnel opening height and ramp grades against Thai
  design standards. Display heights (`STRUCTURE_DISPLAY`) are for the picture only.

## Acceptance (regression tests)

1. Two roads crossing in plan at different levels create no junction.
2. Flipping A over B ↔ B over A changes the compiled crossing, the 2D drawing order and the 3D levels together.
3. Moving an alignment recomputes crossing stations and levels deterministically.
4. One undo reverts a grade-separation change completely (relation and profiles).
5. Projects saved before 4A open with every profile at `z = 0`.
6. The report lists each crossing as at grade / grade-separated (gap) / unresolved.
7. Bridge stretches have the structure finish (service walk, barrier, parapets) and no trees or lights; at-grade ends keep theirs.
8. An underpass dips the road, creates a trough with retaining walls and one tunnel with two portals, and one undo reverts it.
