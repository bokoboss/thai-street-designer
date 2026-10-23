# Ramp terminals — tangent tie-in and gore

Review-plan PR-08 (geometry side of finding F04), based on `main` at `f85fe37` (after PR #68). Replaces the four-point
taper drawn at a diverge / merge. No acceleration or deceleration lane is drawn or implied: those come with
station-based lane runs (4C). No numeric criterion is introduced.

## Geometry — `rampTerminal(main, ramp, end)` in `core/road-first/ramps.ts`

Built at compile from the anchor and the two roads' own lines, so it follows any edit of either road.

- **Tie-in surface:** starts on the main road's travelled-way edge a taper length (`RAMP_RULES.taper`, tool value) before
  a diverge / after a merge, with zero width and tangent to the edge; a cubic curve runs to the ramp end's outer corner and
  arrives in the ramp's own direction (C1 at both ends); closed back along the edge to the ramp end. It lies outside the
  travelled way.
- **Gore:** the triangle between the main road edge and the ramp's inner edge, from where they separate to where they
  are `GORE_WIDTH` (3 m, tool value, TO_VERIFY) apart on the ramp's first straight (shorter if that straight is shorter).
  Drawn as pavement with a white outline and hatching in the plan and export; a road surface in 3D.

Both are in `NetworkProject.rampTapers` (`points` = tie-in, `gore` = triangle). Validation accepts 3–64 tie-in points and
an optional 3-point gore, so older compiled data (4-point taper, no gore) still validates and draws.

The plan draws terminals after the roads at grade (they cut through the footway beside the travelled way); 3D draws them
just above the footway surface.

## Not yet

Auxiliary lanes and lane continuity (4C), a physical nose, gore on a curved first ramp segment (the triangle uses the first
straight), and a terminal object the user edits directly (the anchor and the two roads remain the inputs).

## Verification

`scripts/verify-ramp-terminal.cjs`: diverge / merge × eastbound / westbound × main road drawn either way — tie-in starts on
the correct edge, tangent to it, on the upstream / downstream side; ends at the ramp's outer corner arriving along the ramp;
gore corners on the edge and its nose `GORE_WIDTH` out on the ramp side; 3D surfaces; follows a moved main road
deterministically; detach removes it; older data. Existing ramp, diamond and U-turn tests pass unchanged.
