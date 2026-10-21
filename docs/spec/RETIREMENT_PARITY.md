# Retiring `/network` and `/junction` — parity register

Roadmap Phase 3 slice 6 is staged (owner decision 2026-10-20): `/design` becomes the home page first; the earlier
pages are removed only when everything below is available from `/design`.

Status 2026-10-20 (slice 6a; 6b-1 adds the 3D view and the Design Summary to `/design`; 6b-2 the reference image; 6b-3 the online map and the section by station):

- `/` opens `/design`.
- `/junction` is the **advanced junction editor**, opened from the junction inspector in `/design` ("แก้ทางแยกขั้นสูง").
  It edits a hand-off copy (`core/road-first/junction-handoff.ts`); on return the edits come back as one undoable
  command (`junction.setTreatments`) through `captureTreatments()`. The earlier Network data is not touched.
- `/network` stays reachable by URL with a "หน้าจอเดิม" note; edits there do not reach `/design`.

| Capability | In `/design` | Via advanced editor | Only in earlier pages |
| --- | --- | --- | --- |
| Draw / edit roads, sections, presets | ✓ | | |
| Automatic junctions, grade separation | ✓ | | |
| Right/left-turn pockets, Slip lane (width, radius, deceleration lane), corner radius | ✓ | ✓ | |
| Crossing, signal, stop line, offsets | ✓ (per approach; signals on all approaches from the junction) | ✓ | |
| Roundabout (convert both ways, island radius, ring lanes, ring width) | ✓ | ✓ | |
| Roundabout entry/exit radii, splitter, apron | | ✓ | |
| Median openings, U-turn at a junction approach | ✓ (add, type, position, length, plan handle) | ✓ | |
| Median trees | | ✓ | |
| Trees and street lights along a road (links and its junction arms, both sidewalks) | ✓ | ✓ (junction arms) | |
| Mid-block median opening / U-turn (road stations, outside approaches; cuts the median in 2D, 3D, export; station section labels it) | ✓ | | |
| Project access (driveway) | ✓ (road role) | | |
| Incoming lane arrows (main and turn lanes), incoming divider mode and solid length | ✓ | ✓ | |
| Outgoing divider, arrow position overrides | | ✓ | |
| Slip departure (shared auxiliary, acceleration), Slip crossing | | ✓ | |
| Junction 3D view | | ✓ | |
| Scenarios, comparison, report figure (PNG/SVG) | ✓ | | |
| Network 3D view | ✓ (2D / 3D toggle) | | |
| Reference image (place, opacity, rotate, move, scale from a known distance) | ✓ | | |
| Online map background (street / imagery basemaps, place search, drag to line up) | ✓ | ✓ | |
| Parallel / frontage corridors, frontage seeds | — | | dropped for now (owner 2026-10-20); migration reports these relations as not carried over |
| Auxiliary-lane proposals between junctions, editing station components | — | | dropped for now (owner 2026-10-20); existing station components are kept in the road data and still drawn |
| Design Summary (HTML report) | ✓ (ส่งออกรูป → รายงานสรุปแบบ) | | |
| Road section by station (per segment between junctions) | ✓ (หน้าตัด → ตามระยะทาง) | | |

Slice 6c (2026-10-20): `/network` is retired — its URL redirects to `/design`; work it saved in this browser is migrated on
first open of `/design` and can be imported again as extra alternatives (`appendScenarios`). The Network browser acceptance
is replaced by `scripts/verify-junction-goldens.mjs` (the junction editor golden suite it contained). `/junction` stays as the
advanced junction editor; opened directly it still works as a stand-alone junction sketch (used by the golden suite).
