# Engineering Design Basis — Thai Street Designer

Updated: 2026-09-22

This is the engineering basis for a **concept-design tool**. It does not certify compliance with a road authority and does not replace project-specific criteria, traffic analysis, swept-path analysis, road-safety audit or professional review.

## Product calibration: visual plausibility, not compliance checking

The governing product test is: **would a traffic/street engineer look at the concept and immediately see something semantically or visually wrong?** Thai Street Designer should behave like an engineering-informed illustration tool, not a detailed-design checker.

Use three levels when deciding what belongs in runtime logic:

1. **Semantically / physically wrong — fix it.** Examples: incoming/outgoing reversed, a taper develops in the wrong direction, a Slip mutates the base road, a crossing and its pavement use inconsistent width, or 2D/cross-section/3D disagree.
2. **Visually implausible — improve the default or geometry heuristic.** Examples: an abrupt merge, an unnatural island nose, a disconnected/kinked transition, or markings in an obviously implausible sequence.
3. **Detailed engineering — document, do not police in the concept UI.** Examples: queue-based storage, design-speed taper calculation, swept-path certification, sight-distance calculation, signal warrants and exact clear-zone checks.

A numeric value from a standard/guideline is not, by itself, a reason to show an Engineering Warning. Runtime warnings should be reserved for combinations that materially misrepresent the concept or create an obvious feature conflict. Preferred dimensions remain useful as defaults and design references.

## 1. Source hierarchy

1. Current requirements of the Thai authority responsible for the project (DOH, DRR, BMA, local authority, concessionaire).
2. Thai national / agency manuals, especially DOH design guidance and OTP traffic-control manuals.
3. Austroads / FHWA guidance as supplementary evidence where Thai public guidance does not define the concept clearly.
4. Software heuristics only when explicitly identified as concept-tool assumptions.

A context-dependent recommendation must not become a universal geometry rule merely because the software needs a default.

## 2. Geometry Error vs Engineering Warning

- **Geometry Error / data validation**: invalid data, self-intersection, insufficient geometric space, or a condition outside the solver's supported range.
- **Engineering Warning**: geometry can be drawn but needs missing design inputs, standards review or engineering judgement.

This distinction allows existing-condition modelling without representing a constrained or substandard condition as recommended design.

## 3. Function-by-function audit

### Main lanes and cross-section
The current 2.5–4.5 m lane-width range is a modelling envelope, not a universal Thai design standard. Lane width depends on road class, design speed, vehicle mix, context and authority. Shoulder, bicycle, motorcycle and buffer bands are geometric bands; detailed facility standards, drainage and clear-zone checks are not yet implemented.

### Raised median and turn-lane allocation
DOH median guidance identifies about **1.20 m minimum residual raised median** where a turn lane is created or hardware must be accommodated, about **4.20 m minimum** for a normal raised median intended to accommodate a turn lane, and roughly **6–10 m or more** as a planning range for convenient U-turn operation depending on vehicle and receiving roadway.

Auto allocation remains geometry-first and transparent. The retained-median UI default may use 1.20 m as a sensible reference, but the runtime Review should not behave as a 1.20 m compliance checker. It warns only when median consumption materially changes the concept (for example, the usable median is consumed entirely). Explicit **Retain** is available when the designer wants to preserve a chosen width.

### Turn pockets, receiving lanes and tapers
Storage/deceleration length and taper/merge length depend on approach speed, queue, turn volume, signal operation, design vehicle and right-of-way. The tool therefore keeps these as explicit user inputs and checks geometric fit only. Defaults are starting values, not warrants or design minima. Slip-owned auxiliary treatments remain separate from generic Pockets.

### Intersection angle
New/reconstructed intersections should be close to 90 degrees. FHWA guidance recommends not less than 75 degrees where right-of-way is restricted; severe skew around 60 degrees or less is associated with operational/safety problems.

The **40-degree limit is only the geometry solver boundary**:
- below 40 degrees: Geometry Error;
- 40–75 degrees: editable for existing/constrained sites; the value is design-basis context rather than an automatic runtime warning;
- near 90 degrees: preferred conceptual starting point.

### Corner radius
The circular corner model ensures coherent plan geometry only. Real design must check design vehicle/swept path, pedestrian crossing distance, turning speed, encroachment and site constraints. The current radius range is not a normative Thai standard.

### Pedestrian crossing and stop line
Thai DOH marking guidance uses about 2.0 m minimum crosswalk width for normal cases and 4.0 m in higher-speed/higher-demand contexts. The current 3.2 m crossing zone is a concept default.

Thai intersection-marking guidance places the stop line about 1 m in advance of the crosswalk and calls for a no-lane-change / solid-line treatment for at least **36 m before a crosswalk**. New junctions may use 36 m as a visually plausible default rather than 30 m. A different value is not automatically a runtime warning in a concept tool.

### Outgoing lane-divider datum
Incoming and outgoing markings must not share the incoming stop-line datum. Incoming dividers use the approach control datum; outgoing dividers use the departure-side mouth/tangent and must clear a pedestrian crossing. The engine now uses the departure-side origin for outgoing dividers.

### Lane arrows
Automatic arrow positions are layout heuristics, not an authority-specific marking schedule. Lane-use semantics remain editable per lane.

### Traffic signals
The signal switch is concept visualization only. It does not implement warrants, phasing, clearance intervals, detectors, signal-head visibility or coordination. Review flags a normal signalized approach where the stop line is disabled.

### Median openings and U-turns
Suggested opening locations are convenience heuristics, not spacing warrants. U-turns require design-vehicle swept path, receiving width, storage/deceleration, sight distance and conflict checks. Review flags modelled U-turns with median width below 6 m; narrower existing treatments remain drawable but are not represented as automatically acceptable.

### Roundabouts
Real roundabout design requires entry deflection/path speed, design vehicle, swept paths, splitter islands, pedestrian/cyclist treatments and capacity. The current tool provides concept geometry but does not yet calculate entry-path speed or swept paths.

For new single-lane conversions the default crossing setback is 9 m from the outer roundabout reference. Review warns when the approximate setback from the yield line is below 7.5 m and when a pedestrian splitter/refuge is below 1.8 m. Multilane roundabouts remain explicitly conceptual until lane-path and swept-path logic exists.

### Slip lanes
See `docs/SLIP_LANE_DESIGN_BASIS.md`. Slip remains an overlay; base junction geometry is immutable; no hidden Pocket state is allowed. Crossing, stop line and arrow consume the same Slip geometry. Zebra-stripe count now uses the **local transitioned Slip width at the crossing station**, consistent with the existing local-width stop-line rule.

### Roadside trees, lighting and median planting
Placement is presentation-oriented and checks geometric fit/exclusions. It does not yet validate sight triangles, clear zone/fixed-object offset, lighting photometrics, utility conflicts or species/root-zone requirements.

### Free Draw / road network
Free Draw is schematic. Polyline checks prevent self-intersection/extreme reversals but do not constitute horizontal-alignment design. Tangent/curve/spiral elements, minimum radius by speed/superelevation, stopping sight distance, grades and vertical curves are not yet modelled.

### Cross-section and 3D
These are consumers of the same plan model and must not invent different geometry. 3D is conceptual and does not validate vertical alignment, crossfall, superelevation, drainage, clearance or structures.

## 4. References

Thai:
- Department of Highways — Design Guideline: Road Medians & Road Widening  
  https://bmm.doh.go.th/website/download/manual59/manual_pre_drawings.pdf
- Office of Transport and Traffic Policy and Planning (OTP) — Traffic sign/marking/signal manuals  
  https://www.otp.go.th/post/view/2098

Supplementary:
- FHWA — Designing Roadways for the Aging Population, Intersections  
  https://highways.dot.gov/safety/other/older-road-user/handbook-designing-roadways-aging-population/chapter-2-intersections
- FHWA — Signalized Intersections Informational Guide  
  https://highways.dot.gov/sites/fhwa.dot.gov/files/2022-06/fhwasa13027.pdf
- FHWA — Dedicated Left- and Right-Turn Lanes at Intersections  
  https://highways.dot.gov/safety/proven-safety-countermeasures/dedicated-left-and-right-turn-lanes-intersections
- Austroads — Guide to Road Design Part 4B: Roundabouts, Edition 3.3  
  https://austroads.com.au/publications/road-design/agrd04b

## 5. Future implementation rule

Before adding an automatic engineering treatment:
1. identify the inputs it truly depends on;
2. locate applicable Thai authority guidance;
3. add design-speed / design-vehicle / traffic inputs if necessary;
4. separate geometry validity from engineering recommendation;
5. pin behavior with regression tests;
6. verify 2D, interaction, cross-section and 3D;
7. complete visual acceptance before calling geometry/UI work finished.
