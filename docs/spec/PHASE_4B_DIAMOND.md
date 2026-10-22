# Phase 4B-3 — Diamond interchange, the first template (spec)

Source: roadmap Phase 4B (owner decision 2026-10-22: templates only place the free-drawing pieces); research
`docs/research/2026-10-21-GAME-UX-INTERCHANGE-RESEARCH.md`, `docs/research/2026-10-22-ROAD-DRAWING-UX-RESEARCH.md`;
level values from `docs/spec/LEVEL_CRITERIA.md`.

## What it places

At a crossing of two roads (junction, grade-separated crossing or open crossing), one batch command (one undo step):
- the grade separation (`overCommand`: main road or crossroad over, rise from the level criteria);
- up to four one-way ramps (role `ramp`): off-ramps diverge from the main road upstream, on-ramps merge downstream,
  each on the side its traffic runs (left of travel, left-hand traffic); the other end meets the crossroad at a
  steep angle and becomes an ordinary junction — one terminal junction per side (four legs when both ramps of that
  side are placed);
- ramp profiles from the main-road level at the attachment to the crossroad level at the terminal.

Pieces carry `origin {template:'diamond', version:1, group, params}`. After placing they are ordinary roads, ramps
and junctions, edited one by one. "ลบทางลาดทั้งชุด" removes a group in one step (the grade separation stays);
"วางใหม่แทนชุดเดิม" removes and places again with new parameters in one step.

## Parameters

Main road (either road), which road passes over, distance from the crossing to the diverges / merges, distance of
the terminals from the main road, which ramps. Defaults: main road over; distance = the main road's climb
(bridge rise ÷ main grade) beyond the crossroad width; terminals at half the main road width + 15 m.
Tool values (TO_VERIFY): diverge angle 12°, terminal gap 15 m, straight run before the terminal 40 m, ramp section.

## Preview and refusals

Ghost of the ramps on the plan while the panel is open (red with the reason when it cannot be placed); the panel
shows ramp lengths, the steepest ramp grade and any level-criteria flags. Refused: not a two-road crossing, main road
without lanes both ways, main road or crossroad too short, terminals too close to the main road, distance too short
for the diverge angle plus the straight run, crossing too oblique, no ramp selected; plus every ordinary refusal of
the pieces themselves (attachment direction, spacing, junction fit).

## Not yet

Orientation / mirror variants beyond choosing the main road and which road is over (diamond is symmetric);
lane continuity and acceleration / deceleration lanes (4C); other templates (4D); multi-select of the pieces (4B-4).

## Acceptance (`scripts/verify-diamond.cjs`, browser acceptance)

1. One step places separation + four ramps; one undo restores the junction.
2. Bridge rise follows the level criteria; ramps attach on their traffic sides; two four-leg terminals.
3. No level, grade or direction flags with the defaults; crossroad-over variant meets the crossroad at its level.
4. Half diamond: two ramps, one four-leg terminal. A bent main road still gets four attached ramps.
5. Remove group in one step; refusals with reasons.
