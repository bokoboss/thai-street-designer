# Section on a structure (fourth part of 4C)

Review-plan for the 4C item “custom structure section for bridges and underpasses, with width transitions to the at-grade
section”. This is step 2 of the owner decision of 2026-10-21; step 1 (same widths, structure finish) is in 4A.

Based on `main` at `b94f38d` (after PR #75, section of a stretch). Transition lengths are drawn values: tool starting
values, TO_VERIFY against the project's manual.

## Model — `Road.structureSection`, `road.setStructureSection`

A road can carry one section for all of its structures: `{forwardLanes, backwardLanes, walk, bands?, transition}`.

- **Allowed values:** the same as a section stretch (lanes up only, at most +2 per direction; footway and band widths
  within ±5 m of the road's). The check `sectionChangeError` is shared with stretches.
- **Where it applies:** over each structure extent of the road.
  - A **deck**: the road is on top at a grade-separated crossing.
  - A **tunnel**: the road is below ground under the other road.
  - The extent is the measured overlap plus the 2 m structure margin. These are the extents the plan and 3D already draw.
  - A road at grade over a tunnel keeps its own section.
- **Transitions:** the transition (starting value 30 m) lies outside the structure. The full structure section starts at
  the abutment or portal. A transition is shortened where it would reach the road's end. Two structures whose
  transitions would meet become one stretch.
- **How it is built:** compile turns the setting into section stretches (`st-structure-<n>-…` components), with the same
  lane and width components as a stretch drawn by hand. Plan, section by station, 3D and export therefore read one model.
- **Deck and tunnel width:** the plan and 3D deck (and tunnel) are as wide as the road's section on the structure.
- **Clearance:** still measured with the road's own section. The overlap along the upper road depends on the lower road's
  width, not the upper road's.
- **No structure:** a road with a structure section but no structure keeps the setting. It is listed as an item to check
  and not used.

## Compile change

The grade-separated pairs (which road is on top, measured clearance, deck and tunnel extents) are now resolved once,
before the links (`crossingPairs`), so each road's links can carry its structure section. The crossing output is the
same as before. `CompileResult.structures` lists the extents in road stations.

## Carried with the road

- **Reverse:** forward and backward lanes swap.
- **Split:** both pieces keep the setting.
- **Join:** the joined road keeps the first road's setting.

## UI

The road panel shows “หน้าตัดบนโครงสร้าง” when the road has a bridge or tunnel, or already has the setting. Its summary
gives the number of bridges and tunnels.
- One tick starts the setting from the road's own section.
- Then type the lanes, footway, band widths and the transition.
- Each change is one undo step.

## Verification

- `scripts/verify-structure-sections.cjs`:
  - old projects compile unchanged
  - bridge section over the deck with transitions outside it (plan geometry, deck width, network valid, deterministic,
    save / reopen, one undo)
  - extra lane on a bridge; the lower road is untouched
  - tunnel; the road over it keeps its section
  - item to check when there is no structure
  - refusals with the reason; removal
  - reverse and split
- `scripts/verify-vertical-browser.mjs`:
  - one tick on the panel of the road over
  - typed footway
  - 3D view
  - undo
  - screenshots `artifacts/structure-section-plan.png` and `artifacts/structure-section-3d.png`

## Not yet

- a different section per structure
- ramps entering a structure with their own section
- lane connectors at junctions
