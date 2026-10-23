# Flyover / underpass composer

Review-plan PR-06 (templates T01 flyover over a junction, T03 underpass), based on `main` at `2525fd7` (after PR #66).
Builds on owned profile proposals (PR #65) and measured clearance (PR #66). No numeric criterion is introduced.

## Parameters

`gradeProposal(project, candidateId, roadId, 'over' | 'under', params)` in `core/road-first/grade-separation.ts`.

| Parameter | Starting value | Notes |
| --- | --- | --- |
| Level difference at the crossing | clearance + deck depth (over) / clearance + tunnel roof (under) | From the project's level criteria; TO_VERIFY until sourced. |
| Level length over / under the other road | other road width + 2 × 10 m | Tool value (as before). |
| Approach grade | main-road or ramp maximum grade of the criteria | |
| Vertical-curve length | 0 (straight grades) | Entered by the user only. Applied to the four grade breaks; owned level points are added at the road ends when the profile has none, so the tie-in curves have a tangent on both sides. |
| Release earlier points | off | See below. |

Input sanity ranges (not design limits): difference 0.5–30 m, level length 0–500 m, grade 0.5–15 %, curve 0–500 m.

## Plan, outcome and refusals

- The plan gives the approach / level stations, the length needed either side of the crossing and the road length; the plan
  ghost (`gradeGhost`) draws the approaches and the level stretch along the road with its width.
- `gradeOutcome` applies the command to a copy and compiles it: the panel shows the measured clearance of the result and
  any items to check that name either road (for example a vertical curve long enough to dip the deck over the lower road).
- A proposal that cannot be placed (road too short for the grade or the curve, conflicting authored points, bad input)
  keeps its plan: the panel and the ghost turn red with the reason and placing is disabled. Nothing is edited until “วาง”;
  placing is one command and one undo step.
- A road already clear by the wanted relation is not changed; only the relation is set.

## Earlier untagged points

Rises / dips saved before ownership tags have no known source and stay protected. When the other road has such points
around the crossing and is raised or lowered there, the panel lists their stations and offers to remove them too. Only
when the box is ticked does the command carry `release` (road and stations); the command boundary removes exactly those
and still refuses any other untagged point. Without consent the result is the earlier behaviour (the new structure is
placed relative to the old level).

## UI

The review is a panel in the inspector instead of a modal dialog, so the plan stays visible with the ghost. Entry points
are unchanged (crossing panel, road panel crossings list, junction panel). Escape or “ยกเลิก” closes it and clears the
ghost.

## Verification

- `scripts/verify-grade-composer.cjs`: criteria defaults equal the one-click command; height / level length / grade shape the
  rise and the footprint; entered curves (C1 at curve ends, owned end points); a long curve lowers the measured clearance
  before placing; refusals keep the plan; bad input; one undo restores relation and profiles; bridge → underpass;
  already-clear road unchanged; release only with consent and still protected at the command boundary.
- `scripts/verify-vertical-browser.mjs`: ghost on the plan, measured clearance in the panel, red refusal with placing
  disabled, live re-measure for a new height, cancel clears the ghost; screenshots `artifacts/vertical-rise-preview.png`,
  `artifacts/grade-composer-refused.png`.
