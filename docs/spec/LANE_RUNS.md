# Lane runs (station-based lanes, first part of 4C)

Review-plan PR-09, based on `main` at `136e172`. A lane added along a stretch of road and dropped again, defined in road
stations so it survives junctions being added, moved or removed. No numeric criterion is introduced: lengths and tapers
are drawn values (tool starting values, TO_VERIFY).

## Model — `Road.laneRuns`, `core/road-first/lane-runs.ts`

`{id, direction: forward | backward, side: curb | median, start, end, taperIn, taperOut}` in metres from the road start.

- Validation: up to 24 runs; start ≥ 0, end > start + 1 and within the road; tapers ≥ 0 and together not longer than the
  run; the direction must have lanes; at most two added lanes side by side on one side of one direction (data bound).
- Older files have no `laneRuns` and compile exactly as before (plain section, no components).

## Compile

Each run is clipped to every link of its road and handed to the network engine as a station lane component
(`run-<id>`, link stations), the link switching to the section that changes along its length. Plan, section by station,
3D and export read that one lane model (the network lane lifecycle). A clipped end keeps its taper inside the link.

Items to check: a run cut by a junction approach (“ถูกตัดที่ช่วงเข้าทางแยก — ยังไม่ได้ต่อกับช่องของทางแยก”); a run wholly inside
an approach or past the road end (not built); a link whose two ends cannot change between along its length (runs dropped).

## Edits that change stations

The runs stay on the ground through: extend at the start (shift), split (a run across the split is cut in two with no
taper at the cut), join (both ends re-measured on the joined road; a piece joined the other way round changes direction
with its traffic), reverse (a two-way road keeps the run's traffic, so its direction and tapers swap; a ramp keeps its
direction), straighten and the arc-length conversion (re-measured).

## UI

Road panel “ช่องจราจรเพิ่มตามระยะทาง”: + lane for the drawing direction / the opposite direction (placed on the longest
stretch between junction approaches, 150 m with 30 m tapers, tool values), direction, curb / median side, start, end and
both tapers by number, remove. On the plan, the selected road shows a handle at each end of each run; dragging slides it
along the road (0.5 m steps, one undo per drag).

## Not yet (rest of 4C)

Merge / diverge lanes at ramp terminals and lane mapping (PR-10), width-only changes of bands / footways, replacing the
section of a stretch, custom structure sections.

## Verification

- `scripts/verify-lane-runs.cjs`: old files unchanged; 4 → 6 lanes over a stretch with tapers (edges widen by one lane,
  continuous, deterministic, save / reopen, one undo); refusals; clipped around a junction added later with items to check;
  carried through reverse (twice = identity), extend, split and join.
- `scripts/verify-lane-browser.mjs`: add in 2 clicks, plan handles, drag an end (one undo), typed taper, 3D.
  Screenshots `artifacts/lane-run-plan.png`, `artifacts/lane-run-3d.png`.
