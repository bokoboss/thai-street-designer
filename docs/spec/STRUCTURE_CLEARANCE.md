# Structure envelope and measured clearance

Review-plan PR-05, based on `main` at `fb3ecbb` (after PR #65). Closes the structure part of finding F05: the clearance at a
grade-separated crossing was the level difference of the two centre lines at one point, compared with clearance + structure
depth. It is now measured under the structure over the whole area where the two roads overlap.

## Model

`core/road-first/structure-clearance.ts` — `measureClearance(over, under, overStation, underStation, criteria)`:

- **Structure:** `deck` (bridge) when the lower road is at or above ground at the crossing; `tunnel` when it is below
  ground (`< −LEVEL_TOLERANCE`). Depth = the project's structure depth (deck) or tunnel roof (tunnel) from the level
  criteria — the same values that size the generated rise / dip.
- **Envelope:** the lower road's travelled way (median, lanes, bands; footways excluded) is sampled every 0.5 m along and
  across; a sample counts when it lies under the upper road's full width (footways included). Both roads are resolved with
  the shared alignment resolver, so arcs, skew and the station migration of PR #64 are respected.
- **Clearance at a sample** = upper surface level − depth − lower surface level, with both levels from the shared vertical
  resolver (vertical curves of PR #65 included). The result is the minimum, where it occurs, and the overlap spans on both
  roads. Cross sections are level (no crossfall yet). No terrain: ground is the datum `z = 0`, stated as an assumption in
  the report.
- **Unknown is not zero:** when no overlap can be sampled the value is `null`, shown as “ยังวัดไม่ได้” and listed as an
  issue to check by hand; it is never drawn as 0 or as satisfied.

Sampling steps are measuring resolution, not design values. No new numeric criterion is introduced; the clearance value
stays TO_VERIFY until the project enters a source.

## Consumers (one result, many views)

- Compile: `CompiledCrossing.clearance`; the issue compares the measured minimum with the project clearance
  (“ช่องลอดที่วัดได้ … น้อยกว่าที่ตั้งไว้ … — ต้องตรวจตามเกณฑ์”), never pass / fail.
- Network data: `NetworkCrossing.clearance` (min, structure, depth, location); `NetworkProject.structure` carries the deck
  and roof depths; tunnels carry the portal road levels and the roof underside.
- Plan: the deck and tunnel extents are the measured overlap plus a 2 m display margin (`STRUCTURE_MARGIN`).
- 3D: deck sides drop by the project deck depth; tunnel portals open from the road at each portal up to the roof
  underside. Older compiled data without these fields keeps the previous display values.
- Long section: a structure band between the upper surface and its underside over the overlap, a dimension line and the
  measured clearance label at the minimum.
- Inspector: crossing panel and road panel show the measured clearance with the set value and its TO_VERIFY status.
- Report: a clearance column next to the centre-line gap.

## Verification

- `scripts/verify-structure-clearance.cjs`: flat bridge = set clearance; a lower road on a grade gives a smaller minimum
  on its high side and is flagged; re-measured when the criterion or the upper road width changes; skew; tunnel roof and
  portal height; unknown ≠ 0; plan / 3D / report use the same result; older compiled data.
- `scripts/verify-level-criteria.cjs`: the short-clearance flag now reports the measured clearance.
- Browser: crossing panel clearance (bridge and tunnel) in `verify-design-browser.mjs`; long-section structure band and the
  same value in the road panel in `verify-vertical-browser.mjs`.
