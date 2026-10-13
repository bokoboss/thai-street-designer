# Pavement Marking Specification

Source: adapted from `road-concept-builder/docs/PAVEMENT_MARKING_SYSTEM.md` (Phases 2C–2E) and `street-concept-designer` interaction flow F08. Scheduled for Phase 5 of `docs/CONSOLIDATION_ROADMAP.md`.

## Principle

Markings are placed by **target**, not drawn freehand:

```text
select lane / approach / road range / junction / area → choose marking → system places and orients it → adjust parameters
```

## What exists today (2026-10-13)

Generated from geometry: lane-use arrows per lane (editable, with manual placement), stop lines, give-way lines at roundabout entries, pedestrian crossings, solid/dashed lane dividers per direction, Slip separator chevrons, signal symbols, median openings with U-turn arrows.

## What to add

| Category | Items |
| --- | --- |
| Linear | edge line, centre/direction-separation line, no-lane-change (solid) line on demand, taper guide line, give-way line on any yield-controlled approach or Slip |
| Symbol | merge/diverge arrow review, bicycle symbol, bus symbol |
| Text | ช้าลง / SLOW, หยุด / STOP, BUS, ONLY, short custom text |
| Area | painted island, general hatch/chevron area clipped to its boundary, gore area |
| Transverse | warning bars, simple rumble-strip representation |

## Targets

`lane`, `approach`, `road range (station from–to)`, `junction`, `median opening`, `slip`, `pocket`, `roundabout entry`, `area`, `custom anchor`.

Prefer station + lateral offset (or lane id) attachment so markings follow geometry edits. Free world XY is only for custom anchors.

## Generated vs manual objects

From RCB Phase 2D–2E, adapted:

- Every marking/annotation object has `source: generated | manual`, `visible`, `locked`, draw order and `sourceStatus`.
- A generated marking can be **detached** into a manual object for presentation tweaks (nudge, rotate, scale, hide). Detaching records that the user overrode it; regenerating geometry must not silently recreate a marking the user deleted.
- Generated road geometry itself is never dragged as a picture; it changes only through parameters or handles.
- Manual objects never affect engineering validation.

## Source status

Every marking default that could be read as a standard carries a status:

| Status | Meaning |
| --- | --- |
| `THAI_AUTHORITY` | From Thai law/regulation, verified to page level |
| `AGENCY_MANUAL` | From a DOH/DRR/BMA manual, verified to page level |
| `INTERNATIONAL_REFERENCE` | From international guidance adapted to LHT |
| `PROJECT_ASSUMPTION` | Concept default chosen for this tool |
| `CUSTOM` | User-created concept marking |
| `TO_VERIFY` | Intended to follow a source that has not been verified yet |

Until a value is verified in `docs/standards/THAI_SOURCE_REGISTER.md`, dimensions (stroke width, dash/gap, arrow size, stop-line offset, crossing stripe size) are `PROJECT_ASSUMPTION` and must not be labelled as Thai standard.

## Consistency rules (safe without numeric standards)

- Signal-controlled approach shows a stop line.
- Yield-controlled approach or Slip shows a give-way line.
- Lane-use arrows match the lane's permitted movements.
- Right-turn pocket and U-turn pocket show the matching arrow.
- Lane drop shows taper and merge guidance.
- Crossing does not overlap an island without a refuge cut.
- A marking's target must exist; automatic rotation requires a target direction.

## Items to check against sources before Phase 5

- Arrows on departure lanes immediately after the junction mouth (currently drawn).
- Distance between stop line and crossing, and distance from stop line to the first arrow.

## Non-goals

Freehand drawing, arbitrary SVG editing, a complete national sign/marking library, enforcement of every dimension, 3D marking textures beyond what the shared renderer already does.
