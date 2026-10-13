# UX Baseline Protocol

Purpose: measure how hard the core tasks are **before** the consolidation changes, so later phases can show real improvement.

## Rules

- Use the current production build (or `main`) in a desktop browser at a normal window size.
- Start each task from a fresh page load (New Project / default state).
- Do not read documentation during a task. Note any moment you would have needed it.
- Count an **action** as one click, drag, key press that commits a value, or menu open.
- Stop the timer when the result is visibly correct, not when you give up. If you give up, record "not completed" and the reason.
- Record friction in one short line each: where you hesitated, what was surprising, what you expected instead.

## Tasks

| ID | Task | Done when |
| --- | --- | --- |
| T1 | Create a four-leg junction and add a right-turn pocket on one approach (3.0 m wide, 30 m taper, 50 m storage). | Pocket visible in plan with the stated values. |
| T2 | Connect two junctions with a road and give the road a 2+2 lane divided section. | Both junctions connected; section shows 2 lanes each direction with a median. |
| T3 | Change the section of that road: lane width 3.5 m and sidewalk 2.5 m both sides. | Plan and section show the new widths. |
| T4 | Create an Alternative, change one junction (for example add a Slip lane), and compare with Existing. | Comparison view shows the difference. |
| T5 | Export a plan figure of the whole design suitable for a report. | Image file downloaded and opens correctly. |

## Recording template

Copy into `UX_BASELINE_RESULTS.md` and fill in.

| ID | Completed (Y/N) | Time (mm:ss) | Actions | Friction notes |
| --- | --- | --- | --- | --- |
| T1 | | | | |
| T2 | | | | |
| T3 | | | | |
| T4 | | | | |
| T5 | | | | |

Build / commit tested: `________`  Date: `________`  Browser: `________`

## Setting targets

After the baseline, set a target per task (time and actions) for the end of Phase 3. Record the targets in the same file. Targets are owner decisions and may be revised with evidence.
