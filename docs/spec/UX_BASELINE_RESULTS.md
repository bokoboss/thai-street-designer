# UX Baseline Results

Protocol: `UX_BASELINE_PROTOCOL.md`. Fill in during Phase 0B.

## Baseline (before consolidation)

Build / commit tested: `main` @ `cc4994c` (Vercel/Next production build)  Date: `2026-10-18`  Browser: `Chromium (headless), 1440 × 900`  Tester: `Claude — scripted walkthrough of the shortest path a first-time user can find in the UI`

Actions follow the protocol definition (one click, drag, key press that commits a value, or menu open). Time is not recorded: a scripted run does not measure human time. The owner adds times from a manual run.

| ID | Completed (Y/N) | Time (mm:ss) | Actions | Friction notes |
| --- | --- | --- | --- | --- |
| T1 | Y | — | 12 | The Network inspector can add the median-side lane but has no lane width and only ± steppers for Storage/Taper, so the values need the separate Junction detail page (6 of the 12 actions are typing three numbers there). The Network inspector calls it "ชิดเกาะกลาง"; Junction detail calls the same lane "เลนรอเลี้ยวขวา". The inspector shows developer terms (Design v6, Pocket resolver, auxiliary). |
| T2 | Y | — | 5 | Place junction → Connect tool → click two port circles. The port targets are small. The road section cannot be set on the road; it comes from the junction arms (the default is already 2+2 with a median, so no section edit was needed). After connecting, the inspector opens on the Parallel/Frontage panel and shows "Review mismatch" although lane counts match. |
| T3 | Y | — | 17 | No section editor on the road. The same change has to be made on each end arm and each direction (4 sections), with 0.25 m steppers and no numeric entry. The section dock label "ซ้าย = TO → FROM · ขวา = FROM → TO" is hard to read. |
| T4 | N | — | 6 (until failure) | "+ Alternative" works and the compare bar appears at once. A Slip lane can only be added in Junction detail. Opening Junction detail from Alt A stores only the active project, so on return Alt A is gone and the Slip lane is in Existing (the original Existing is overwritten). Not completed: comparison impossible, and data is lost. |
| T5 | Y | — | 2 | Export ▾ → "Full Network · PNG". The PNG opens correctly with title, scenario name, scale bar and concept disclaimer; there is no north arrow or legend. The menu labels are in English. |

## Targets for end of Phase 3

Set by the owner after the baseline. The values below were proposed after the scripted baseline. On 2026-10-18 the owner chose to skip the manual timing run, so these action targets are the working targets and time is not tracked.

| ID | Target time | Target actions | Notes |
| --- | --- | --- | --- |
| T1 | owner | ≤ 6 (proposal) | Add a right-turn lane on the selected approach and type width / storage / taper in place, without leaving the workspace. |
| T2 | owner | ≤ 4 (proposal) | Draw Road between junctions; choose a 2+2 divided preset on the road itself. |
| T3 | owner | ≤ 5 (proposal) | One section editor on the road with numeric entry; both sides change together. |
| T4 | owner | completes, ≤ 6 (proposal) | Junction edits happen inside the active Alternative; Existing is never changed. |
| T5 | owner | ≤ 2 (proposal) | Keep; add north arrow and legend in Phase 5. |

**Revised targets (owner, 2026-10-19, from `docs/research/2026-10-UX-RESEARCH.md`).** These replace the proposal above. Counting rule from the research: one click, one drag, one keyboard command or one committed field edit = one action; automatic system work (snapping, auto junction) is not an action.

| ID | Baseline | Target |
| --- | --- | --- |
| T1 Four-leg junction + right-turn pocket 3.0 m / 50 m / 30 m | 12 | ≤ 5–6 after the junction exists |
| T2 Road 2+2 divided between two points | 5 | ≤ 3 |
| T3 3.5 m lanes + 2.5 m sidewalks | 17 (old) / 5 (new, click + type counted separately) | ≤ 3 |
| T4 Duplicate Alternative + Slip lane + compare | not completed | 100 % completion, ≤ 4–5, no data loss |
| T5 Export plan figure | 2 | ≤ 2 |

## Later measurements

Add one table per measured build (commit, date) using the same columns.

### Select as the editing hub (2026-10-23, scripted)

Build: `feat/select-hub`, based on `fecefb2` (review-plan PR-03). Chromium headless, 1440 × 1000. No human timing measurement.

| Task | Completed (Y/N) | Actions | Friction notes |
| --- | --- | --- | --- |
| Select two roads | Y | 2 (box drag on empty plan, Shift+click) — or 3 on touch (multi-select button, tap, tap) | A drag on the empty plan selects, never edits; panning stays on the middle button, Space or the Pan tool. |
| Move several roads together | Y | 1 drag (one undo step) — or 3 by number (type, type, ย้าย) | Junctions between moved roads keep their settings; ramps follow, slide along or let go of their main road like a dragged end. |
| Split a road and join it back | Y | 2 + 2 (right-click → แยกถนนตรงนี้; right-click → ต่อสองเส้นนี้) — on touch: pick a sharp point → แยกถนนที่จุดนี้ | Levels, median openings, junction settings and ramp attachments past the split follow the new piece. |
| Delete a selection | Y | 1 (Delete) or 2 (ลบที่เลือก, confirm) | One undo brings all back. |
| Reverse a road | Y | 2 (right-click → กลับทิศการวาด) or 3 on the road panel | Traffic, junction settings, levels and openings stay on the ground. |
| Straighten a road | Y | 2 (right-click → ทำแนวตรงทั้งเส้น); a range: 4 on the road panel | |
| Connect two roads with a tangent curve | Y | 3 (select both, right-click → เชื่อมด้วยโค้งสัมผัส) | Largest radius that fits by default; typed radius on the panel. |
| Draw on the extension of a road / parallel to a road | Y | 0 extra (hover the road, then move along the guide) | Badge names the guide and road; readout shows the distance to the reference road. |

### U-turn structures (2026-10-23, scripted)

Build: `feat/uturn-structures`, based on `55c6a62` (review-plan PR-07). Chromium headless, 1440 × 1000. No human timing measurement.

| Task | Completed (Y/N) | Actions | Friction notes |
| --- | --- | --- | --- |
| U-turn bridge on a road | Y | 2 (open “สะพานกลับรถ” on the road panel → วางสะพานกลับรถ) | Ghost on the plan follows the solved arcs; footprint, clearance it gives and items to check shown before placing; the new ramp is selected with its set (remove in 1). One undo. Choosing the other traffic direction is 1 more click. |
| U-turn under a bridge | Y | 1 (เพิ่มจุดกลับรถใต้สะพาน on the crossing panel) | Placed in the lower road's median, centred under the structure; moved / resized with the existing median-opening tools. |

### Flyover / underpass composer (2026-10-23, scripted)

Build: `feat/grade-composer`, based on `2525fd7` (review-plan PR-06). Chromium headless, 1440 × 1000. No human timing measurement.

| Task | Completed (Y/N) | Actions | Friction notes |
| --- | --- | --- | --- |
| Bridge with starting values | Y | 2 (ยกข้าม → วาง) | Unchanged from PR-04. The review is now a panel in the inspector instead of a modal, so the plan stays visible with a footprint ghost (approaches and level stretch). |
| Bridge with an adjusted height / level length / grade / vertical curve | Y | 2 + one typed value per parameter | Each value re-plans live: footprint, length needed vs available, measured clearance of the result and items to check. An impossible value turns the ghost and panel red with the reason and disables placing; nothing is edited until “วาง”. |
| Replace an earlier untagged rise | Y | 3 (button, tick release, วาง) | Earlier points of unknown source are listed with their stations and kept unless the box is ticked. |

### Vertical curves and profile review (2026-10-23, scripted)

Build: `feat/vertical-curves-provenance`, based on `7d421c91344160fbc5b4bec9d08aadb7289d2ecb` (review-plan PR-04). Chromium headless, 1440 × 1000. No human timing measurement.

| Task | Completed | Actions | Prior behavior / result |
| --- | --- | --- | --- |
| Apply a rise/dip from its visible inspector action | Y | 2 | Previously 1 immediate action; now open before/after review, then confirm. The extra confirmation protects authored profile work. |
| Cancel an open profile review | Y | 1 | Project remains identical, including all PVI and decisions. |
| Undo / redo the profile transaction | Y | 1 each | Relation, generated points and ownership are restored together. |
| Edit an internal vertical curve | Y | 1 committed value | After the field is open, the entered length changes the same profile used by longitudinal drawing and 3D; undo/redo and reload retain it. |

UX review: **PASS** for this slice. The diagram distinguishes the road surface from the tangent PVI. The review shows old/new profiles and point source; cancellation is initially focused. Conflicting authored points are refused with their station. `verify-vertical-browser.mjs` exercises the task; screenshots are `artifacts/vertical-curve-profile.png`, `artifacts/vertical-rise-preview.png` and `artifacts/vertical-curve-3d.png`. No automatic curve length or engineering compliance claim is introduced.

The existing two-road browser fixture now includes 1 camera gesture before its 6 drawing actions, to provide full approach lengths for the bridge. It no longer relies on a clipped partial rise. The drawing controls themselves retain the same action count; the short-road refusal is tested separately.

### Explicit curved-alignment conversion (2026-10-22, scripted)

Build: `fix/interchange-alignment-migration`, based on `1cd8f5972116beed8867a6482b041c0c3fb661b5` (combined review-plan PR-01+02). Chromium 153, 1440 × 1000. No human timing measurement.

| Task | Completed | Actions | Evidence |
| --- | --- | --- | --- |
| Convert an opened legacy project from its project inspector | Y | 2 | Open review, confirm. Before/after stations and crossing locations are shown before confirmation. |
| Cancel preview | Y | 1 | Authored project remains identical. |
| Undo / redo conversion | Y | 1 each | Entire active scenario returns in one step; reload keeps the confirmed result. |

There was no conversion workflow in the prior baseline. Existing design-browser workflows and junction visual goldens pass unchanged. UX review: **PASS** for this conversion task: active-scenario scope is explicit; preview does not edit; cancellation is initially focused; errors disable confirmation; numeric and dragged radii share the same property; UI copy guard passes. Evidence: `verify-alignment-browser.mjs`, `artifacts/alignment-upgrade-preview.png`, `artifacts/alignment-upgrade-3d.png`.

### Road-first workspace `/design`, first slice (2026-10-18, scripted)

Only tasks the new workspace already supports are measured; the rest follow in later Phase 3 slices.

| ID | Completed (Y/N) | Time (mm:ss) | Actions | Friction notes |
| --- | --- | --- | --- | --- |
| T2 (road-first form) | Y | — | 8 | Draw two crossing roads with the 4-lane divided preset (3 + 3 actions) and confirm the crossing as a junction (2). The section is set by the preset on the road itself. |
| T3 | Y | — | 5 | Select the road, type lane width 3.5 and sidewalk 2.5 (both sides together). Baseline: 17. |

### `/design` slice 2 — automatic junctions (2026-10-19, scripted)

| ID | Completed (Y/N) | Time (mm:ss) | Actions | Friction notes |
| --- | --- | --- | --- | --- |
| T2 (road-first form) | Y | — | 6 (3 per road) | Tool, click start, double-click end, twice; the junction appears by itself with a notice (Undo · grade separation). One road = 3, the research target. |
| T3 | Y | — | 3 by the research counting rule (5 counting click and typing separately) | Unchanged from slice 1; meets the ≤ 3 target. |

### `/design` slice 3 — drawing aids (2026-10-19, scripted)

| ID | Completed (Y/N) | Time (mm:ss) | Actions | Friction notes |
| --- | --- | --- | --- | --- |
| Continue a road by an exact length | Y | — | 5 (tool, click road end, type length, Enter, Enter) | Snaps to the road end and continues that road (one road, not two); angle locks to 15° steps; typed length places the point exactly. Shift held turns snapping off. A sharp corner still renders as a plain mitre — curves come later. |

### `/design` slice 4 — junction detail in place (2026-10-20, scripted)

| ID | Completed (Y/N) | Time (mm:ss) | Actions | Friction notes |
| --- | --- | --- | --- | --- |
| T4-style detail: right-turn pocket with a typed storage length | Y | — | 4 (click approach on the plan, "+ เลนเลี้ยวขวา", click storage field, type + Enter) | Stays in `/design`, no page switch, nothing lost. Storage handle and corner handles on the plan edit the same stored values as the fields (one undo step per drag). "+ Slip lane" adds a Slip to the next approach in 1 action; approaches now stretch along the road to fit a Slip lane. Default sizes are tool starting values, not standards. |

### `/design` slice 5 — scenarios, comparison, report figure (2026-10-20, scripted)

| ID | Completed (Y/N) | Time (mm:ss) | Actions | Friction notes |
| --- | --- | --- | --- | --- |
| T5 (alternative + see the difference) | Y | — | 1 ("+ ทางเลือก"; comparison turns on by itself) | Copies the active scenario, keeps each scenario's own undo history, highlights added / removed / changed roads and junctions on the plan and lists what changed with metric deltas. Matching is by road and crossing identity, so unrelated objects never show as changed. |
| Report figure | Y | — | 2 ("ส่งออกรูป" → PNG or SVG) | Whole design with title block, scenario, comparison legend and counts, scale bar, concept-design note. No north arrow: the plan has no surveyed orientation. |
