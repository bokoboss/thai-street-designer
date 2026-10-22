# Phase 4B-1 — Ramps drawn by hand (spec)

Source: roadmap Phase 4B (owner decision 2026-10-22: free drawing before templates); research
`docs/research/2026-10-21-GAME-UX-INTERCHANGE-RESEARCH.md` (end-to-side attachment, red preview with the reason).
Concept level only. Every threshold below is a tool value marked `TO_VERIFY` until rule-referenced checks (4E).

## Model

- `Road.role = 'ramp'`: a one-way road (starting section 1 lane × 3.5 m, no median, no sidewalk; tool value, editable).
- `Road.anchors.start` (diverge) / `Road.anchors.end` (merge): `{roadId, station, side}` on the road the ramp leaves or
  joins. `side = 1` is that road's forward-lane side (left of its drawing direction on the plan, left-hand traffic).
- The anchored ramp end point is kept on the edge of the travelled way (median half + lanes + bands of that side), so
  the main road stays one continuous road: no junction, no split link. The ramp end takes the main road level.
- Compile: ramp links carry `ramp: true` (drawn under other roads at the same level); `NetworkProject.rampTapers`
  holds a taper at each attachment (main road edge a taper length away → ramp end corners), drawn in 2D and 3D.
- No schema version change: new optional fields; files without ramps compile exactly as before.

## Rules

- A ramp end attaches when it lies on a road or within `capture` (3 m) outside its edge, at an angle of at most
  `maxAngle` (25°) to it, away from that road's ends. A steeper end is an ordinary junction (e.g. a diamond ramp terminal).
- The side is the side of the main road the ramp lies on; traffic on that side must run the ramp's way.
- After every edit: a ramp end the edit moved is attached afresh (slides along the road, or detaches when dragged
  away); an untouched anchored end follows its road at the same station (re-found from the old point when the road
  was extended at its start or joined). Removing the road drops the anchor; the ramp end stays where it was.
- Refused with the reason (red preview while drawing): against the traffic, no lanes on that side, a ramp with lanes
  both ways, within `junctionClear` (40 m) of a junction on the main road, within `spacing` (20 m) of another
  attachment on the same side.
- A ramp crossing another road uses the 4A crossing relation (junction / over / under, bridge, trough, tunnel).

## UX

- Draw Road → "ทางลาด": start on the main road and draw away at a shallow angle; end on the side of another road at a
  shallow angle to merge. The undo label names the attachment ("แยกออกจาก …", "เข้าสู่ …").
- Ramp inspector: each end's attachment (road, station) with "ปลดออก"; dragging the end point slides or detaches it.
- Not yet: lane continuity and acceleration / deceleration lanes (4C), ramp crossing a sidewalk (drawn over it),
  levels while drawing (4B-2).

## Acceptance (regression tests: `scripts/verify-ramps.cjs`, browser acceptance)

1. A shallow ramp start on a road attaches to the edge on the travel side; no junction is created.
2. Moving or extending the main road keeps the ramp attached deterministically; the ramp end takes its level.
3. Dragging the ramp end slides the anchor; dragging it away detaches it; dragging it back attaches it.
4. A merge attaches the ramp end the same way.
5. Wrong direction, too close to another attachment or to a junction, and two-way ramps are refused with the reason.
6. A steep ramp end becomes an ordinary junction.
7. Attach and detach are one undo step each; old files open unchanged.
