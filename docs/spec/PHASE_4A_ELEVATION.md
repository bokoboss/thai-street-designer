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

## Acceptance (regression tests)

1. Two roads crossing in plan at different levels create no junction.
2. Flipping A over B ↔ B over A changes the compiled crossing, the 2D drawing order and the 3D levels together.
3. Moving an alignment recomputes crossing stations and levels deterministically.
4. One undo reverts a grade-separation change completely (relation and profiles).
5. Projects saved before 4A open with every profile at `z = 0`.
6. The report lists each crossing as at grade / grade-separated (gap) / unresolved.
