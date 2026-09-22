# Slip Lane Design Basis

Status: engineering design basis for the **concept-design tool**, not a construction-standard certification.

The project is for Thai left-hand traffic. International guidance from right-hand-traffic jurisdictions is used only where the geometry/safety principle can be mirrored logically; it is not treated as a substitute for current Thai statutory/design requirements.

## 1. Why this document exists

Earlier development mixed several meanings of “channelized”, “receiving lane” and “Slip lane”, which caused implementation to drift away from the researched design intent.

This file defines the semantics that code may implement.

If a future feature is not covered here, research it first rather than inventing a new geometric mode.

## 2. Baseline concept

A Slip lane is a separate turning roadway connecting the curb side of an incoming approach to the receiving road.

The base tool should preserve the main intersection:

- a road configured with 2 main incoming lanes remains 2 main incoming lanes at the junction mouth
- a road configured with 2 main outgoing lanes remains 2 main outgoing lanes at the junction mouth
- enabling a Slip does not silently create a turn Pocket, receiving lane, acceleration lane or pedestrian crossing

The corner/channelizing island and turning roadway belong to the Slip overlay.

## 3. Approach treatments

### Direct

Vehicle leaves the curbside main lane and enters the turning roadway.

No separate auxiliary lane is implied.

### Auxiliary / deceleration / storage

Optional extra lane upstream of the Slip.

It is represented as an adjacent auxiliary/deceleration/storage treatment with its own:

- width
- storage/deceleration length
- taper

It is **not** a generic long raised separator by default.

The code must not implement this by borrowing `incomingPockets.left`; it is Slip-owned state because its endpoint and behavior are tied to the Slip connection.

## 4. Departure treatments

Three concepts must remain distinct.

### Direct to main receiving lane

Slip joins the existing curbside main lane.

This is the clean default.

### Shared departure auxiliary

An auxiliary lane exists from the junction/departure side and can receive the Slip movement.

This is distinct from a Slip-specific acceleration lane.

### Slip-specific acceleration lane

The Slip has its own downstream lane, allowing a vehicle to travel parallel to the receiving road and merge later.

This is optional, not a default assumption.

Current concept parameters:

- width
- acceleration/full length
- merge length
- initial separator:
  - painted chevron/gore
  - raised separator

A raised separator is not interpreted as a long island extending for the full lane by default.

## 5. Channelizing island

The corner island is part of the Slip turning-roadway geometry.

Do not confuse:

- corner channelizing island
- approach auxiliary lane
- downstream acceleration lane
- painted gore
- raised downstream separator

They have different functions and must remain separate objects/semantics.

## 6. Speed, entry angle and high-entry geometry

Guidance supports the safety value of lower-speed, higher-angle channelized turns in appropriate urban contexts because they can improve driver sight lines and pedestrian visibility.

However, the former project implementation tried to construct a compound “high-entry” curve from an internally invented relationship between radii/angles. That construction was removed from the production baseline.

Current rule:

- production baseline uses the explicit-radius Slip geometry
- do not reintroduce a compound high-entry algorithm until the geometric construction is derived from an appropriate road-design source and independently validated

The UI may eventually support a researched high-entry mode, but it should be a separate geometry strategy, not a hidden default.

## 7. Pedestrian crossing and control line

A Slip crossing is optional.

The crossing and its control/stop line are station-based objects on the Slip centerline.

Because Slip width may transition between connected lane width and requested channel width:

- crossing width must be evaluated at the crossing station
- stop/control line width must be evaluated independently at its own station

Do not assume one constant width across the entire Slip.

## 8. Width transition principle

The requested Slip width can differ from the curbside source/receiving lane width.

The tool therefore transitions width inside the Slip overlay:

```
entry connection width → requested Slip width → exit connection width
```

The base road is not widened merely because the Slip is wider.

This is a parametric continuity rule for the concept tool, not a claim that the current transition length is a prescribed Thai design-standard value.

## 9. References used for semantics

### Austroads

**Guide to Traffic Management Part 6: Intersections, Interchanges and Crossings**  
Includes the high-entry-angle Give Way concept for left-turn Slip lanes and distinguishes intersection traffic-management treatments.

https://austroads.com.au/publications/traffic-management/agtm20/media/AGTM06-19_Guide-to_Traffic_Management_Part_6_Intersections_Interchanges_and_Crossings.pdf

**Guide to Road Design Parts 4 / 4A material**  
Covers intersection design, auxiliary lanes, truck acceleration lanes and left/right turn treatments. Detailed geometry should be checked against the current edition before encoding normative dimensions.

https://austroads.com.au/publications/road-design/web-r687b-23

### FHWA

**Handbook for Designing Roadways for the Aging Population — Intersections / Right-Turn Channelization Design**  
Illustrates channelized turn geometry, corner-island design, turning-speed/sight-line considerations, and cases with/without an exclusive receiving/acceleration lane.

https://highways.dot.gov/safety/other/older-road-user/handbook-designing-roadways-aging-population/chapter-7-intersections

**Improving Intersections for Pedestrians and Bicyclists: Informational Guide**  
Discusses high-angle entry channelized turns and pedestrian/bicycle considerations.

https://highways.dot.gov/media/10306

### TRB / NCHRP

**Channelized Right Turns Synthesis (NCHRP 03-72 synthesis material)**  
Separates island design, turning-roadway width/radius, angle of entry, and deceleration/acceleration lanes as distinct design topics.

https://onlinepubs.trb.org/onlinepubs/nchrp/docs/NCHRP03-72_ChannelizedRightTurnsSynthesis.pdf

For Thai left-hand traffic, U.S. right-turn examples are mirrored only at the level of applicable geometric/safety concepts.

## 10. Thai design use

Before this tool is used to claim compliance with a Thai road-design standard, confirm the current applicable manuals/requirements from the responsible Thai road authority (e.g. DOH/DRR/BMA as appropriate to the project).

Foreign guidance must not be used to invent a mandatory Thai dimension.

Where Thai guidance and international concept guidance differ, the Thai requirement governs for Thai design work.

## 11. What is currently supported by the code

Supported concept semantics:

- bare/direct Slip
- optional Slip-owned approach auxiliary
- direct receiving lane
- shared departure auxiliary
- Slip-specific acceleration lane and merge
- painted initial gore or raised initial separator
- variable-width connection transitions
- optional Slip crossing
- station-based arrow/crossing/stop placement

Not yet considered fully validated engineering features:

- normative warrants for when a Slip should be provided
- design-speed-based automatic radius selection
- a standards-derived high-entry compound geometry algorithm
- superelevation
- grades/vertical alignment
- swept-path/design-vehicle validation
- sight-distance validation
- pedestrian/bicycle signal-control logic
- Thai standard-compliance certification

## 12. Implementation rule

When a user reports a geometry defect:

1. identify which engineering object owns the behavior;
2. verify the intended design semantics here;
3. add a focused regression when practical;
4. fix the owning geometry module;
5. verify 2D, selection, cross-section and 3D all consume the same result;
6. visually accept the result before calling it complete.
