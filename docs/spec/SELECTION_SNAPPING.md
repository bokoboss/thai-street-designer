# Selection and Snapping

Source: adapted from `street-concept-designer/docs/ux/SELECTION_SNAPPING_MODEL.md`. This application already has priority-based hit candidates, Alt-click cycling and an overlap chooser (see `core/junction/selection.ts`); this document defines the target behavior for the consolidated workspace.

## Invariant

**Selection identifies semantic objects. Snapping proposes geometric intent. Topology is an explicit engineering action.**

## Selection

- Application state stores semantic ids (road, alignment point, lane/component, junction, corner, lane connection, marking, asset, reference layer), never renderer handles.
- 2D, section, 3D and Inspector read the same selection.
- A click selects the most useful editable target for the active mode, not the deepest primitive. Typical priority:
  1. active edit handle;
  2. engineering feature (corner, lane, pocket, marking);
  3. parent road or junction;
  4. presentation object (tree, light);
  5. reference layer — only in reference-edit mode.
- Overlaps: repeat-click or Alt-click cycles deterministically; right-click offers a chooser. No pixel hunting.
- Multi-selection is not required now, but selection state should allow a set with a primary item.

## Snapping

- Snap families to support first: endpoint, nearest point on alignment, intersection of alignments, perpendicular, grid. Add others only when a workflow needs them.
- A snap candidate is ephemeral UI state: kind, target id, point, station (if relevant), and whether accepting it **would propose topology**.
- Ranking uses tool intent and target type, not distance alone (an endpoint slightly further away can outrank an arbitrary edge when drawing a connecting road).
- Show the cue before commit: icon for the snap kind, station/distance where useful, and a distinct style for "connection candidate" versus "position only".

## Snapping is not topology

```text
cursor snaps to Road B (end or alignment)
→ coordinate chosen
→ the edit is committed; where roads now cross, a junction is created automatically
→ notice: "Junction created" · Undo · Make it a grade separation
```

A snap only chooses a coordinate. Junctions come from roads crossing after the edit, are always announced, and are undoable as part of the same step (owner decision 2026-10-19).

## Tolerances

Keep three separate tolerances: UI acquisition radius (screen pixels), geometry computation tolerance (metres), and connection/merge criteria (explicit). Zoom changes acquisition but never the accepted engineering coordinate for the same target.

## Tests to add when implemented

- Same object selected from 2D, section and Inspector.
- Overlap cycling is deterministic.
- A new crossing creates an announced, undoable junction; an impossible junction leaves the crossing open with a reason.
- A stale snap candidate is invalidated when geometry changes before commit.
- Locked/reference layers cannot be edited accidentally.
