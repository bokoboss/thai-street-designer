# Select as the editing hub (first part)

Review-plan PR-03 / roadmap 4B-4, based on `main` at `fecefb2` (after PR #69). Everything stays in `/design`; every edit
is one command and one undo step.

## Selecting

- Click a road: select it. **Shift+click** adds / removes it; the **เลือกหลายชิ้น** button in the tool rail does the same
  for touch.
- **Drag on the empty plan** in Select draws a box; the roads it touches (any part, not only a point inside) are selected,
  added with Shift / multi-select. A plain click on the empty plan clears the selection. Dragging on the empty plan never
  edits; pan stays on the middle button, Space+drag and the Pan tool.
- **Ctrl/Cmd+A** selects all roads; **Esc** clears; **Delete** removes the selection; **Z** zooms to it.
- Selection model: `{kind:'roads', ids}` for two or more roads (one road stays `{kind:'road', id}`).

## Moving

- Dragging a selected road moves the whole selection (`roads.move`, one undo step per drag; a wobble under 4 px is a
  click). Moving by typed distances in the inspector is the touch / keyboard equivalent.
- After a move the ordinary pipeline re-binds junction decisions (settings kept when both roads move), keeps ramp ends on
  the road they attach to (follow a moved main road; slide along it when the ramp moves along it; let go when moved
  further than the capture distance, as when dragging an end), and re-checks crossings and levels.

## Right-click menu and inspector actions

The menu (right-click in Select) and the multi-selection inspector offer the same actions: zoom to the selection, **split
the road here** (one road selected), **join** the two selected roads when their ends meet, select all, clear, delete.
On touch, a sharp point of a road can be split with **แยกถนนที่จุดนี้** in the point panel.

`road.split` (`core/road-first/split.ts`): only on a straight stretch (the two pieces must trace the same ground) and at
least 5 m (tool value) from either end; refused on an arc, inside a vertical curve, across a median opening, or at a
crossing / junction. Levels get a point at the split on both pieces; openings, junction settings (leg keys) and ramp
attachments past the split move to the new piece, re-measured from its start; per-span link settings are cleared (as when
joining). Join is the existing `road.join`.

## Reshaping (second part)

- **Reverse** (`road.reverse`, `core/road-first/reshape.ts`): the drawing direction flips. A two-way road keeps its traffic
  on the ground: forward / backward lane counts swap, levels and median openings are re-measured from the other end, junction
  leg settings swap ahead ↔ behind (the same arms), ramps attached to it are re-measured and change side with the
  direction. Reversing twice gives the same road. A ramp is one-way, so reversing it changes its direction of travel; an
  end still on a road edge would then run against traffic and is refused by the ordinary ramp rule with its reason.
- **Straighten** (`road.straighten`): removes the points between two chosen points (whole road from the menu, any range on
  the road panel). Levels, median openings and attached ramps are re-measured on the ground; refused when level points
  would collapse or a vertical curve no longer fits.
- **Tangent curve between two roads** (`core/road-first/tangent-connect.ts`): the end straights of two selected roads are
  lengthened to where they meet (the end points slide along their own straights), the roads are joined there and that
  point gets the largest radius the straights allow (`vertexCurve` limit, tool value) or a radius typed on the panel.
  One batch, one undo; refused when the straights do not meet ahead of both ends, and by the join rules (e.g. roads with
  level points on curved alignments).

Menu: กลับทิศการวาด / กลับทิศเดินรถของทางลาด, ทำแนวตรงทั้งเส้น, เชื่อมด้วยโค้งสัมผัส (รัศมี … ม.). Panels: “แนวถนน” on the road
panel (reverse, straighten a range); tangent radius on the two-road panel.

## One-shot guides while drawing (third part)

`core/road-first/snap.ts`, after the road ends and points on roads:

- **Extension:** beyond either end of any road, along its end straight, within the road-snap distance of the line
  (rank between road points and angle steps). Drawn as a dashed line from the road end; badge “แนวต่อของ …”.
- **Reference road:** the road the cursor last came onto (a point on it or its end) while drawing; shown with a light
  amber band. From the last drawn point, directions **parallel** and **perpendicular** to the reference road (its direction
  nearest the cursor) are offered alongside the 15° steps, the closer one first (Tab cycles); badge “ขนานกับ …” /
  “ตั้งฉากกับ …”.
- **Distance to the reference road** for whatever point is used, in the readout (“ห่าง … ม.”).
- Shift (or the snap-off toggle) suspends all of them, as before.

## Not yet

Rotate / mirror a selection (roadmap 4D), command search, a picked point (not a road) as reference.

## Verification

- `scripts/verify-select-hub.cjs`: move a selection (junction kept, one undo per drag), ramps follow / slide / let go,
  split keeps the ground with every attached item, refusals, split at a point, box selection, bounds, join pair.
- `scripts/verify-reshape.cjs`: reverse keeps traffic / junction settings / levels / openings / ramps and twice is identity,
  ramp reversal refused while attached and allowed when free; straighten re-measures levels, openings and ramps; tangent
  curve joins two roads with the largest fitting radius (line, quarter circle, line), radius on request, one undo, refusals.
- `scripts/verify-draw-guides.cjs`: extension (ends first, off-line ignored, Shift suspends), parallel / perpendicular to
  the reference road, distance to it.
- `scripts/verify-select-browser.mjs`: extension guide, reference road, parallel guide with its distance; reverse from the menu, tangent curve via Ctrl+A and the menu; pan and empty drags never edit, box select, Shift+click, drag-move with one undo,
  move by number, right-click split and join, Ctrl+A / Delete / undo, multi-select button. Screenshots
  `artifacts/select-multi.png`, `artifacts/select-menu.png`.
