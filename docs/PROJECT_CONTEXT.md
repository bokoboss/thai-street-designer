# Project Context — Thai Street Designer

Updated: 2026-09-22

This document explains **why this application exists, what problem it is intended to solve, how the product should feel, and why several architectural decisions were made**.

It should be read before the implementation documents. A new developer or AI assistant who understands only the code but not this context is likely to optimize the wrong thing.

---

## 1. Why Thai Street Designer exists

Thai Street Designer started from a practical problem in traffic and street-design work:

**Early-stage road and intersection concepts are difficult to communicate quickly.**

A traffic/transport engineer often needs to discuss ideas such as:

- add/remove a traffic lane
- change lane allocation
- create a turn pocket
- widen or narrow a median
- add a median opening or U-turn
- introduce a Slip lane
- adjust corner radius
- place crossings, stop lines and arrows
- show trees/streetscape
- compare several intersection alternatives

For an early discussion, full CAD production is too slow and cumbersome. At the other extreme, drawing manually in PowerPoint/Illustrator or using a generic street visualizer can be fast, but it usually loses engineering meaning.

The original inspiration was the class of tools represented by **Streetcraft / street-section and street-concept visualizers**: simple, interactive and presentation-friendly. The goal, however, is not to clone one of those tools.

The intended product is a **Thai-context engineering concept designer**:

> fast enough to explore ideas interactively,  
> visually clean enough to use in presentations,  
> but structured enough that a lane, pocket, median, Slip lane or crossing still means what a traffic engineer expects it to mean.

---

## 2. The gap the product is trying to fill

The application sits between three existing ways of working.

### CAD / detailed engineering software

Strengths:

- accurate
- suitable for detailed design
- familiar engineering workflow

Weakness for this use case:

- slow for early alternatives
- too much drafting overhead
- not convenient for live discussion
- presentation output often needs extra polishing

### Generic diagram / presentation software

Strengths:

- fast
- visually flexible
- good for presentation

Weakness:

- objects have no engineering semantics
- changing a lane does not automatically update connected geometry
- easy to create a diagram that looks plausible but is geometrically inconsistent

### Street visualizer / section-builder tools

Strengths:

- approachable
- good visual communication
- fast configuration

Weakness for this project:

- usually not built around Thai left-hand traffic
- often focused on cross-sections rather than intersection geometry
- engineering relationships between pockets, medians, Slip lanes, lane markings and junction mouths are limited

Thai Street Designer is intended to occupy the space between these categories.

---

## 3. Product vision

The desired workflow is:

1. Start from a simple road/intersection.
2. Change geometry through meaningful engineering parameters.
3. See the plan update immediately.
4. Compare alternatives without redrawing everything.
5. Produce a clean figure for discussion, memo, report or presentation.
6. Keep enough semantic structure that the concept can later be checked or reproduced in engineering software.

The application should feel closer to:

> **“parametric concept design for traffic engineers”**

than to:

> “drawing lines in a browser”.

---

## 4. Primary user and use case

The product is being developed from the perspective of an experienced traffic/transport engineer working with real intersection and street-design questions in Thailand.

Typical use is not public map editing. It is professional concept development:

- discuss an intersection improvement
- prepare alternatives before detailed CAD
- explain a traffic-management idea to a client/stakeholder
- create a clear figure during design review
- investigate geometric implications of changing a lane or median
- quickly produce presentation-quality diagrams

This is why visual quality matters, but **engineering behavior takes priority over cosmetic appearance**.

---

## 5. Thai context

The application assumes **left-hand traffic**.

Important conventions include:

- approach/incoming and departure/outgoing semantics must remain stable regardless of screen orientation
- the cross-section editor uses a fixed conceptual orientation:
  - left = incoming toward junction
  - center = median
  - right = outgoing from junction
- turn and receiving behavior must be reasoned from left-hand-traffic geometry
- Thai practice/standards should govern when claiming compliance
- international guidance may inform concepts but must not silently become a Thai mandatory rule

The tool is meant to understand Thai street/intersection situations, not simply mirror a right-hand-traffic product.

---

## 6. What “engineering semantics” means in this product

A visual object should normally correspond to an engineering object.

Examples:

- a main lane is not just two painted lines
- a turn pocket has storage/full-width and taper behavior
- a receiving lane has a downstream merge behavior
- a median has usable width that can be consumed by a median-side pocket
- a Slip lane has its own turning-roadway geometry
- a crossing and its control line have station/offset relationships
- an arrow belongs to a lane/role, not just an XY coordinate
- a warning should correspond to an actual unresolved geometry/design condition

The program should avoid “drawing hacks” that make one screenshot look right while destroying these relationships.

---

## 7. Core design philosophy

### 7.1 Semantic geometry before graphics

The source of truth should be parameters and semantic geometry.

Renderer, selection, dimensions, cross-section and 3D should consume the same model.

Do not create separate visual-only geometry to repair a drawing unless it truly represents a separate visual object.

### 7.2 Predictable propagation

When the user changes a parent parameter, dependent geometry should follow automatically.

Examples:

- change Slip radius → entry/exit connection and island update
- change pocket length → storage/taper geometry follows
- change median width → pocket feasibility/allocation updates
- move a crossing → its associated control/stop line follows where appropriate

The user should not have to repair several disconnected shapes after one parameter change.

### 7.3 Explicit rather than hidden behavior

Avoid surprising automatic choices.

For example:

- adding a Slip must not silently add a crossing
- a receiving/acceleration lane should not appear merely because an unrelated outgoing Pocket exists
- a high-entry geometry should not be inferred unless explicitly supported by the design mode
- warnings should disappear once the actual condition is resolved

### 7.4 Main road topology must remain understandable

If an arm is configured as two incoming lanes and two outgoing lanes, those counts must retain a clear meaning at the junction.

Auxiliary treatments must not silently redefine the base road.

This principle eventually led to the schema-v6 Slip refactor.

### 7.5 Presentation quality matters

The output should look clean enough for professional communication:

- readable markings
- coherent lane lines
- well-positioned arrows and crossings
- visually balanced UI
- reliable 2D/3D/export appearance

But a beautiful drawing that is logically wrong is not acceptable.

---

## 8. Important product behaviors developed during the project

The following requirements emerged from repeated real design questions.

### Variable cross-section

The road cannot be treated as one fixed-width rectangle.

Features may widen or redistribute the section along the arm.

### Pocket lanes

A pocket is directional and side-aware.

For Thai left-hand traffic:

- curb-side and median-side treatments have different geometric consequences
- a median-side pocket may consume available median width first
- if the median is insufficient, widening may be required
- this must be explicit and predictable

### Median

Median geometry is not decorative.

Requirements have included:

- editable median width
- openings/U-turn treatments
- rounded noses
- trees in median
- tree setback from intersection
- no trees inside turn-pocket space

### Lane markings and arrows

Requirements have included:

- incoming/outgoing divider logic
- solid/dashed sections with different datums
- arrow identity by lane
- add/remove arrows
- drag arrow positions
- correct alignment through geometry changes

### Crossings

Crossings are selectable/positionable design objects.

For Slip lanes, the crossing and associated stop/control line must remain aligned with the actual local Slip width and station.

### Slip lanes

Slip lanes became the most important architecture lesson in the project.

Early implementations tied Slip geometry into:

- base junction edge geometry
- generic incoming Pockets
- generic outgoing receiving Pockets
- lane datums

That created circular dependencies and repeated bugs: fixing radius could change lane count, a receiving lane could move a junction mouth, and visual fixes affected unrelated road geometry.

The conclusion was that the problem was architectural, not a collection of small rendering bugs.

The current schema-v6 approach therefore treats Slip as a **design-level overlay with its own state and geometry**. See:

- `docs/ARCHITECTURE.md`
- `docs/SLIP_LANE_DESIGN_BASIS.md`

---

## 9. Why the Slip refactor matters beyond Slip lanes

The Slip problem established a general rule for future features:

> **Each engineering feature needs a clear owner and clear dependency direction.**

Bad pattern:

```
main road
  ↕
pocket
  ↕
Slip
  ↕
junction mouth
```

where everything influences everything.

Preferred pattern:

```
base road / junction
        ↓
semantic feature configuration
        ↓
feature geometry overlay
        ↓
shared rendering + interaction
```

This pattern should be considered for other complex future treatments as the product grows.

---

## 10. Interaction philosophy

The canvas should be a working engineering editor, not merely an output preview.

Desired interactions include:

- select a lane or object directly
- drag arrows/crossings where meaningful
- edit dimensions in an Inspector
- edit widths from cross-section
- see warnings near the responsible object
- pan/zoom without fighting object drag
- use stable undo/redo transactions

When the same parameter is editable from more than one UI path, all paths must use the same lifecycle/model update.

This lesson was important during Slip work: separate “Add Slip” and Inspector toggles once used different state behavior and caused hidden-state bugs.

---

## 11. UX direction

The desired interface is:

- clean
- modern
- professional
- not visually heavy
- grouped by the engineer's mental model rather than by implementation files

Canvas interaction is the priority.

Menus should be organized around concepts such as:

- road / section
- lane treatment
- median
- markings
- crossing/control
- Slip/turn treatment
- roadside/landscape
- display/export

The application should not expose internal technical terminology unless it helps the engineering user.

---

## 12. 2D, cross-section and 3D

These are different views of one semantic model.

### 2D

Primary editing and presentation surface.

### Cross-section

Used to understand and edit section allocation.

It must agree with the plan geometry.

### 3D

Used mainly for visual communication and spatial understanding.

It must consume the same geometry rather than creating its own alternative design logic.

The 3D system is not intended to become BIM or a full civil 3D model.

---

## 13. What the product is not

Thai Street Designer is currently **not**:

- a traffic microsimulation package
- a capacity/LOS model
- a pavement design program
- a full CAD replacement
- BIM
- a survey/GIS database
- a swept-path package
- an automatic road-design optimizer
- a certified Thai standard-compliance checker

It may exchange ideas/data with such tools later, but the current role is conceptual geometric design and communication.

---

## 14. Standards and evidence philosophy

Engineering behavior should not be invented from intuition.

Use this hierarchy when a feature needs design logic:

1. applicable Thai authority guidance/standard where available
2. established road-design guidance appropriate to the concept
3. clearly documented project assumption if no normative rule is available

For international references:

- distinguish a design principle from a mandatory dimension
- account for left-hand vs right-hand traffic
- do not label foreign guidance as Thai compliance

For Slip lanes specifically, see `docs/SLIP_LANE_DESIGN_BASIS.md`.

---

## 15. Development history at a high level

### Initial concept

The repository began as a web prototype for quickly drawing Thai roads/intersections in a way similar in spirit to street-concept visualizers, but with more engineering control.

### Expansion into an editor

The product then grew to include:

- variable road sections
- directional lane counts
- medians
- crossings
- arrows
- Pockets/receiving lanes
- Slip lanes
- roundabouts
- roadside furniture
- 3D
- image/SVG export
- JSON persistence
- selection/dragging
- undo/redo
- validation

### Engineering audit

As capability increased, visual bugs exposed deeper geometry inconsistencies.

The project moved toward:

- semantic object ownership
- regression tests
- explicit datums
- separation of incoming/outgoing treatments
- shared geometry across views

### Slip architecture reset

Repeated Slip bugs showed that incremental patches were no longer reliable.

The Slip implementation was therefore redesigned around schema v6:

- Slip removed from `Arm`
- Slip removed from base `geometry.ts::edges()`
- standalone `SlipLane[]`
- standalone `slip-geometry.ts`
- conservative v5 migration
- architecture invariants protecting the base junction

This is the most important recent architectural change.

---

## 16. How to judge a proposed feature

Before implementing a feature, ask:

1. What real engineering object does this represent?
2. Who owns its state?
3. What are its parent parameters?
4. Which geometry must change when it changes?
5. Which geometry must **not** change?
6. Does it alter base road topology or is it an overlay/treatment?
7. What is the design basis?
8. Can the behavior be expressed as an invariant/test?
9. Will 2D, cross-section, selection and 3D all read the same result?
10. Can the user understand what the control means without knowing the code?

If these questions are unclear, architecture/design work should happen before implementation.

---

## 17. Quality bar

A feature is not complete simply because:

- TypeScript compiles
- tests pass
- the screenshot looks acceptable

For geometric/editor features, completion normally requires all of:

1. correct semantic model
2. focused regression coverage
3. TypeScript/lint/build gates
4. visual acceptance
5. interaction acceptance
6. consistency across 2D/cross-section/3D where relevant
7. migration compatibility when persisted data changes

---

## 18. Working style for AI-assisted development

The project intentionally uses AI as part of the engineering/software workflow.

The useful division is:

- **ChatGPT**: requirements, design reasoning, research, architecture, review, test strategy, UX critique
- **Codex/local execution**: code implementation, runtime investigation, local test execution when appropriate
- **GitHub**: source of truth for code, branches, commits, PRs and handoff state

An AI assistant should not optimize for “producing code quickly”. It should optimize for **maintaining engineering meaning while evolving the editor safely**.

---

## 19. Current priority

The immediate priority is not adding many new features.

The priority is to make the existing intersection geometry—especially the newly refactored Slip system—**predictable, visually correct and trustworthy**.

After the current Slip v6 work passes real visual/interaction acceptance, development can continue with broader UI/UX and geometry improvements.

---

## 20. Reading order for a new contributor

Read in this order:

1. `docs/PROJECT_CONTEXT.md` — why the application exists
2. `HANDOFF.md` — current work/status
3. `docs/ARCHITECTURE.md` — how it is structured
4. `docs/SLIP_LANE_DESIGN_BASIS.md` — current Slip engineering semantics
5. `README.md` — product usage and broader feature set
6. `VERCEL.md` — deployment
7. current PR and GitHub Actions

Only after this should implementation begin.
