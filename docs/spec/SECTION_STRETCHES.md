# Section of a stretch (third part of 4C)

Review-plan for the 4C item “replace / upgrade the section of a selected stretch of road”. Based on `main` at `94eae39`
(after PR #74). Lengths and widths are drawn values (tool starting values, TO_VERIFY against the project's manual).

## Model — `Road.sectionStretches`, `road.setSectionStretches`

A road can carry up to 12 stretches, each in road stations like lane runs:
`{id, start, end, taperIn, taperOut, forwardLanes, backwardLanes, walk, bands?}`.

- **Lanes:** each direction may have up to two added lanes, or reduce the base road count by exactly one lane while retaining at least one running lane. Both are curb-side. Reductions are mid-block only; mapping through a junction is deferred to PR C.
- **Footway:** the footway width may differ from the road's by up to ±5 m. A footway “removed” over a stretch, such as on
  a bridge, keeps 5 cm because the engine never draws a width change down to nothing.
- **Side bands:** the width of each band the road already has (shoulder, bike, motorcycle, buffer) may differ by up to
  ±5 m. A band the road does not have cannot be added inside a stretch.
- **Transitions:** `taperIn` and `taperOut` are the transitions at the two ends, inside the stretch. They must fit within
  its length.

The stretch compiles into the same station lane and width components as lane runs:
- added lane components with ids `st-<id>-f1…` and `st-<id>-b1…`; a reduced lane uses `st-<id>-fd1` / `st-<id>-bd1` with `operation: 'drop'`
- width components with ids `st-<id>-walk-f/b` and `st-<id>-<band>-f/b`

Plan, section by station, 3D and export therefore read one model. Stretches are clipped per link, and the following are
listed as items to check:
- a stretch that changes nothing
- a stretch cut at a junction approach
- a stretch on a link that cannot take a transition (not built)

## What it cannot do (engine limit)

The engine cannot yet change the following in the middle of a link:
- reduce by more than one lane or remove every lane in a traffic direction
- change the median width
- change the lane width
- map a reduced lane through a junction (PR C)

New overlapping reductions, or a reduction overlapping added/auxiliary lanes in the same direction, are refused with a reason. Previously authored files keep their original geometry and receive review items instead of silent rewrites. Structure sections remain add-only.

## Carried on the ground

Stretches stay on the ground through every road edit:
- **Reverse:** forward and backward lanes swap on two-way roads. Reversing twice gives back the original.
- **Straighten:** stations are re-measured.
- **Split and join:** the stretches are split or joined with the road.
- **Extend at the start:** the stretches shift by the added length.

The same rules apply to lane runs.

## UI

The road panel has a “หน้าตัดเฉพาะช่วง” fold.

To add an expanded stretch, click “+ หน้าตัดเฉพาะช่วง”. The new stretch:
- takes the road's section plus one lane each way
- is 200 m long with 30 m transitions (tool values)
- is placed on the longest stretch between junction approaches

To reduce a lane on a selected road, open this fold then click “− ช่องตามทิศที่วาด” or “− ช่องทิศสวน” (2 actions from road selection). This creates a single-lane curb drop with the same starting stretch and transitions; all default dimensions are TO_VERIFY. The existing add-stretch flow is unchanged.

Each field is typed:
- start and end
- the two transitions
- lanes for each direction
- footway width
- the width of each band

On the plan, the start and end handles slide along the road with one undo per drag.

## Verification

- `scripts/verify-section-stretches.cjs`:
  - old files unchanged
  - plan geometry: one more lane, footway 2 → 0.75 m, shoulder 1 → 2.5 m
  - network valid, deterministic, save / reopen, one undo
  - footway kept at 5 cm when set to zero
  - refusals with the reason
  - items to check: no change, cut at a junction
  - carried through reverse, split and join
  - the new stretch's defaults
- `scripts/verify-lane-reduction.cjs`: signed lifecycle, exact footprint and lane lines, save/reopen, legacy geometry, collisions, undo, reverse/split/join, Slip invariant.
- `scripts/verify-lane-browser.mjs`:
  - add in one click
  - drag the start, undone in one step
  - typed footway
  - screenshots `artifacts/section-stretch-plan.png`, `artifacts/lane-reduction-plan.png`, `artifacts/lane-reduction-3d.png`

## Not yet

- custom structure sections over bridge and underpass extents
- lane connectors at junctions
