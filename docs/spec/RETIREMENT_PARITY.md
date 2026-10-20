# Retiring `/network` and `/junction` — parity register

Roadmap Phase 3 slice 6 is staged (owner decision 2026-10-20): `/design` becomes the home page first; the earlier
pages are removed only when everything below is available from `/design`.

Status 2026-10-20 (slice 6a; 6b-1 adds the 3D view and the Design Summary to `/design`; 6b-2 the reference image):

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
| Online map background (street / imagery basemaps, place search) | | ✓ (junction only) | `/network` |
| Parallel / frontage corridors, frontage seeds | | | `/network` |
| Auxiliary-lane proposals between junctions, station components | | | `/network` |
| Design Summary (HTML report) | ✓ (ส่งออกรูป → รายงานสรุปแบบ) | | |
| Detailed road section dock with stations | | | `/network` |

Next (slice 6b and later): bring the "only in earlier pages" rows into `/design` (or decide to drop them), then remove
`/network`, the legacy Network storage path and the `/junction` stand-alone mode.
