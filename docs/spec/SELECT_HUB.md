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

## Not yet (rest of 4B-4)

Reverse a road, straighten selected points, tangent curve between two straights, one-shot guides, rotate / mirror.

## Verification

- `scripts/verify-select-hub.cjs`: move a selection (junction kept, one undo per drag), ramps follow / slide / let go,
  split keeps the ground with every attached item, refusals, split at a point, box selection, bounds, join pair.
- `scripts/verify-select-browser.mjs`: pan and empty drags never edit, box select, Shift+click, drag-move with one undo,
  move by number, right-click split and join, Ctrl+A / Delete / undo, multi-select button. Screenshots
  `artifacts/select-multi.png`, `artifacts/select-menu.png`.
