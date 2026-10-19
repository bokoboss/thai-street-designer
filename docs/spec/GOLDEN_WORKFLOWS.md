# Golden Workflows

Source: adapted from `street-concept-designer/docs/product/GOLDEN_WORKFLOWS.md` and `INTERACTION_FLOWS.md` for this web application.

These workflows drive product decisions and acceptance. A feature that does not help at least one workflow needs explicit justification (see `HANDOFF.md` scope gate).

Timing targets are **not invented here**. They are set from the measured baseline in `UX_BASELINE_PROTOCOL.md` and recorded in `UX_BASELINE_RESULTS.md`.

## GW-01 Project access improvement (primary)

1. Start from a blank canvas or a calibrated site-plan image.
2. Draw the main road alignment.
3. Apply a divided-road section preset.
4. Add a project access / driveway.
5. Add a right-turn pocket using taper + storage parameters.
6. Add or edit a median opening.
7. Review generated markings.
8. Inspect the same design in 3D.
9. Duplicate to an Alternative and modify geometry.
10. Compare Existing and Alternative.
11. Export a plan figure for a report.

## GW-02 Intersection improvement

Draw or trace two crossing roads (the junction is created automatically), adjust per-corner geometry, add turn pockets, Slip lane, islands, stop lines and crossings, then compare alternatives.

## GW-03 Road widening

Convert a 4-lane concept to a 6-lane alternative with median, shoulder and sidewalk transitions along station, and show the footprint change.

## GW-04 Median opening / U-turn

Create a divided road, add a median opening with U-turn treatment and pocket (storage/taper), check markings, inspect plan and 3D.

## GW-05 Urban street

Compose traffic lanes, parking, bicycle facility, sidewalk/verge, trees and lighting with synchronized plan, section and 3D.

## GW-06 Presentation

Prepare plan views, dim the reference, switch engineering/presentation display, and export Existing vs Proposed figures.

## Interaction principles carried into every workflow

- The 2D plan is the primary authoring surface; section and 3D are views of the same state.
- Standard features are created from parameters, never by drawing polygons by hand.
- Direct manipulation and numeric entry edit the same property.
- Each meaningful edit is one undoable step; previews during a drag do not create history.
- Crossing roads create a junction automatically, never silently: the result is announced at once with **Undo** and **Make it a grade separation** (owner decision 2026-10-19, replacing "the engineer confirms every junction"). If the junction cannot be built (for example the roads cross at too sharp an angle) the crossing stays open with the reason shown.
- Reference images and maps are visually subordinate and are never engineering truth.

## First usability benchmark

A traffic engineer who has not used the product should complete a simplified GW-01 (draw a 4-lane divided road, add an access, add a right-turn pocket, create an alternative, export a plan) without CAD knowledge and without reading documentation.
