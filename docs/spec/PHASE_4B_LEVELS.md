# Phase 4B-2 — Levels while drawing (spec)

Source: roadmap Phase 4B (owner decision 2026-10-22); research `docs/research/2026-10-21-GAME-UX-INTERCHANGE-RESEARCH.md`
(game-style raise / lower while building, numeric slope readout). Concept level; levels and grades are drawn values,
not checked against any standard (rule-referenced checks are 4E).

## Drawing at a level

- Draw Road keeps a current level for the next point: PageUp / PageDown (step `DRAW_LEVEL_STEP` = 1 m, tool value),
  ▲ / ▼ buttons or a typed level in the drawing panel. Each point keeps the level it was placed at.
- Starting on an existing road starts at that road's level there, so the new road meets it rather than passing over it.
- Cursor readout: length, angle, level and the grade from the last point.
- Finishing: the road gets a profile through its points (`drawnProfile`); at level 0 everywhere it gets none.
  Continuing a road extends its profile (continuing at the start shifts the existing profile and openings).
- The red / orange preview reads the same command with the levels, so a crossing at another level is previewed as a
  grade separation, not a junction.

## Long section

- Section strip → "แนวดิ่ง": the selected road's levels along its length, ground (0), grades between points, the roads
  it crosses at their levels (with the level difference) and its junctions.
- Drag a point (station and level; one undo step per drag); double-click the line to add a point; double-click a point
  to remove it. The inspector's typed list edits the same points.

## Stacked levels

- Three or more roads at one point:
  - all at different levels → one grade-separated crossing, compiled as one crossing per pair of roads;
  - roads at one level meet in a junction and the others pass over / under it (junction `excluded`), compiled as one
    crossing with each road of the junction;
  - two junctions at different levels at one point → left open with the reason.
- A road at another level drawn through an existing junction passes over / under it instead of joining it.

## Acceptance (`scripts/verify-levels-drawing.cjs`, browser acceptance)

1. Drawing at levels gives the same compiled design as typing the same levels afterwards; one undo per road.
2. Continuing a road at a level extends its profile; at its start, the profile shifts.
3. A stack of three roads compiles with one crossing per pair, unique ids, drawn bottom to top.
4. A raised road through a junction passes over both its roads; the junction keeps its legs; nothing reported as left out.
5. Browser: PageUp while drawing, crossing becomes a grade separation (deck, no junction), long section shows four
   points and the crossed road, a dragged point is one undo step.
