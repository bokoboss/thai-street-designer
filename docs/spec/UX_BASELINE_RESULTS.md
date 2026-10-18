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

Set by the owner after the baseline. The values below are a **proposal** for the owner to confirm or change.

| ID | Target time | Target actions | Notes |
| --- | --- | --- | --- |
| T1 | owner | ≤ 6 (proposal) | Add a right-turn lane on the selected approach and type width / storage / taper in place, without leaving the workspace. |
| T2 | owner | ≤ 4 (proposal) | Draw Road between junctions; choose a 2+2 divided preset on the road itself. |
| T3 | owner | ≤ 5 (proposal) | One section editor on the road with numeric entry; both sides change together. |
| T4 | owner | completes, ≤ 6 (proposal) | Junction edits happen inside the active Alternative; Existing is never changed. |
| T5 | owner | ≤ 2 (proposal) | Keep; add north arrow and legend in Phase 5. |

## Later measurements

Add one table per measured build (commit, date) using the same columns.
