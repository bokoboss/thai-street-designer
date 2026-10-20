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
| Crossing, signal, stop line, offsets | | ✓ | |
| Roundabout | | ✓ | |
| Median openings, U-turn, median trees | | ✓ | |
| Lane markings, arrows, divider modes | | ✓ | |
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

Next (slice 6c): with every row either in `/design` or dropped, remove `/network` and the `/junction` stand-alone mode;
the junction editor stays only as the advanced editor opened from `/design`.
