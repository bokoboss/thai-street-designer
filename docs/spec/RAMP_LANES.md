# Auxiliary lanes at ramp ends, lane continuity and weaving (second part of 4C)

Review-plan PR-10, based on `main` at `f9f515b` (after PR #73, lane runs). Lengths are drawn values (tool starting values,
TO_VERIFY against the project's manual); weaving is measured, never judged.

## Auxiliary lane at an attached ramp end — `Road.terminals`, `ramp.setLane`

A ramp end attached to the side of a road can carry an auxiliary lane on that road: `{length, taper}` (starting values
100 m and 50 m).

- **Deceleration lane** (diverge, ramp start): a full lane of `length` up to the diverge, with the `taper` upstream of it.
- **Acceleration lane** (merge, ramp end): a full lane of `length` from the merge, with the `taper` downstream.
- Upstream / downstream follow the traffic on that side: side 1 runs with the drawing direction (lane at lower / higher
  stations), side −1 against it. The lane is built as a lane run on the main road (`auxLaneRuns`, the same lane model as
  PR #73), so plan, section by station, 3D and export show it and it is clipped around junctions with the same items to check.
- **Lane continuity (mapping):** with an auxiliary lane the ramp's centre line sits on that lane's centre (half a lane
  outside the main lanes' edge), so the auxiliary lane continues straight into the ramp (and the ramp into it at a merge).
  The tie-in taper of PR #69 gives way to the lane; the gore is measured from the main lanes' edge.
- The setting belongs to the ramp end; while that end is not attached it is kept but not built. A reversed ramp drops it;
  a split ramp keeps each end's setting on its piece.

## Weaving — `weavingSections`

On each side of a road, a merge followed by the next diverge (in the direction of traffic) is a weaving stretch: its
length (merge to diverge) is listed as an item to check (“ทางเข้าจาก … ถึงทางออกไป … ห่าง … ม. — ต้องตรวจตามเกณฑ์”), up to
2 km. When the acceleration lane of the merge and the deceleration lane of the diverge meet, they become one continuous
auxiliary lane and the item says so (“ช่องเสริมต่อเนื่อง (ช่วงทอผ้า)”). No capacity or level of service is computed.

## UI

Ramp panel: for each attached end, “ช่องลดความเร็วก่อนแยกออก (แบบขนาน)” / “ช่องเร่งความเร็วหลังเข้าสู่ (แบบขนาน)” as a check box,
then full-lane length and taper by number. One undo per change.

## Not yet

Taper-type (direct) terminals, two-lane ramps and lane drops / adds on the main line at a terminal, lane connectors at
junctions, weaving lane-change counts.

## Verification

- `scripts/verify-ramp-lanes.cjs`: deceleration and acceleration lanes on the traffic side in both directions (stations
  and tapers), widened edge next to the diverge, ramp centre on the lane centre, gore from the main lanes' edge, network
  valid, deterministic, save / reopen, one undo; one continuous lane across a weave and the weaving item; refusals; dormant
  when detached; removal.
- `scripts/verify-lane-browser.mjs`: deceleration lane in one click on the ramp panel, ramp starting on its centre, undo.
  Screenshot `artifacts/ramp-decel-lane.png`.
