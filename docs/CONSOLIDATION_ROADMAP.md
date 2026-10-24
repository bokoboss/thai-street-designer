# Consolidation Roadmap

Updated: 2026-10-21 (Phase 3 accepted)
Decision: [ADR-0001](decisions/ADR-0001-consolidation.md)
Status: **active plan** — replaces `docs/POST_V1_ROADMAP.md` as the source of next work.

Goal: turn Thai Street Designer into **one road-first concept-design workspace** that a traffic engineer can use without reading documentation, while keeping the geometry engine and its regression suite intact.

Priority order while this roadmap is active:

**Usability of core workflows → correctness → regression safety → presentation/export → new features**

A phase does not start until the previous phase's exit criteria are met. Each phase is delivered as small PRs; one PR per vertical slice is preferred over plan/implement/baseline triples.

---

## Phase 0 — Direction and quick wins

### 0A — Decision and specifications (this PR)
- ADR-0001, this roadmap, `AGENTS.md`.
- Specs adapted from SCD and RCB: golden workflows, UX architecture, selection/snapping, pavement marking, glossary, standards policy, Thai source register.
- HANDOFF/README point to the new direction.

Exit: merged; no code changes.

### 0B — Usability baseline (owner task)
- Run the five baseline tasks in `docs/spec/UX_BASELINE_PROTOCOL.md` on the current `main` and record actions, time and friction notes.
- Set numeric targets for each task from the baseline.

Exit: baseline table committed to `docs/spec/UX_BASELINE_RESULTS.md`.

Status (2026-10-18): actions, completion and friction recorded on `main` @ `cc4994c` (T1 12, T2 5, T3 17, T4 not completed, T5 2). Times from a manual run and the Phase 3 targets (proposed in the results file) are owner decisions. The T4 failure (Junction detail dropped the Alternative) is fixed separately.

### 0C — Quick wins (no model change)
1. Remove developer-facing text from the UI (phase numbers, schema names, provenance/runtime jargon). Move necessary explanations to help text or docs. Add a lint/test that rejects those terms in user-facing strings.
2. Mode feedback: every tool states what it expects next and why an action did not happen (for example, Connect mode clicked on a junction body).
3. Fix misleading status labels (for example "Review mismatch" shown when lane counts match).
4. Remove template residue: package name, `examples/d1`, `db/`, `drizzle*`, unused dependencies.
5. Remove the ChatGPT Sites / vinext build path; keep Vercel / Next only. Update `VERCEL.md`, scripts, CI and `test:builds`.

Exit: all existing gates pass; screenshots of Network and Junction inspectors show no developer jargon.

Status (2026-10-13): items 1–5 implemented on `consolidation/0c1-vercel-only`. Item 1 is enforced by `scripts/verify-ui-copy.cjs` (part of `pnpm test`). Remaining English UI labels (File/Export, FROM/TO, Generate Left/Right, Junction/Road Link) and the two section conventions are left for the glossary pass in Phase 3.

---

## Phase 1 — Core extraction and road-first spike

### 1A — Extract `core/`
- Move model, geometry, validation, migration and report logic into a React-free module boundary (for example `core/`).
- UI imports only from the core's public API.
- No behavior change: existing regression and browser suites must pass unchanged.

Status (2026-10-13): done on `consolidation/1a-core-extraction` — 35 modules moved to `core/{junction,network,common,free-draw}`, boundary test added, regression scripts share one TypeScript test build. User-facing engine messages (reviews, proposals, import errors, report header/footer) were also brought under the copy guard.

### 1B — Road-first spike (time-boxed, disposable branch)
Question: can a junction be **derived from crossing roads** while reusing the current edge, curb-return, mouth/datum, pocket and Slip geometry?

Pass criteria (all required):
- Cases: 90° four-leg, 3-leg T, skew (≥ 40°), one curved approach road, one junction with a Slip lane.
- Derived junction geometry matches the current Junction engine output for equivalent inputs within a stated tolerance (golden comparison).
- Arms are represented as the end portions of roads; editing a road's section updates the junction mouth.
- Candidate junction is explicit: crossing roads do not change topology until confirmed.

Exit: written spike report with evidence and a go / fallback decision recorded as ADR-0002.

Status (2026-10-13): spike done — **GO** (all 8 checks pass; the existing demo is reproduced exactly). Report: `docs/spikes/1B_ROAD_FIRST_SPIKE.md`; decision accepted by the owner on 2026-10-14 in `docs/decisions/ADR-0002-road-first-compile.md`. Phase 2 must add a road-end node, a fit-based arm length rule, length-aware marking defaults and leg-keyed treatments.

---

## Phase 2 — Road-first model

- New schema version where roads own alignment and section; junctions own approaches, corners (per-corner radius), treatments and lane connections.
- Typed command layer for all edits (manual drag, numeric entry, future automation) with readable undo history.
- Lane connections default by left-hand-traffic rules (curb-side lane for left turns, median-side lane for right turns) and remain editable.
- One-way migration from Design v6 / Network v4–v5; golden geometry of migrated files must match (world-space comparison of junction outlines, sidewalks, islands, Slip, arrows, stop/divider marks, RoadLink alignments and surfaces).

Exit: migration golden suite passes; existing regression intent preserved.

Status (2026-10-14): slice 1 — road ends (L1) — implemented on `phase2/road-end`: Network schema v5 with `roadEnds[]`, links junction port → road end and road end → road end, one-way v4 → v5 migration, road-first compile emits road-end links (`scripts/verify-road-ends.cjs`). Slice 2 — fit-based arm length + length-aware divider (L2, L4) — on `phase2/arm-fit`: the fixed 45 m arm minimum is replaced by a fit against the arm's content (`core/junction/arm-fit.ts`, `scripts/verify-arm-fit.cjs`). Slice 3 — leg-keyed treatments (L5) — on `phase2/leg-treatments`: pockets, lane markings and arrows, roadside, median openings and trees, crossing/signal/stop, divider settings, Slip and corner radius are stored per road leg and survive slot reordering (`core/road-first/leg-binding.ts`, `leg-treatments.ts`, `scripts/verify-leg-treatments.cjs`). Slice 4 — road-first project file + one-way migration — on `phase2/road-first-schema`: `RoadFirstProject` v1 (`core/road-first/project.ts`), migration from Network v1–v5 (`core/road-first/migrate.ts`) with a golden geometry digest (`core/road-first/geometry-digest.ts`); 8 golden fixtures pass (`scripts/verify-road-first-migration.cjs`).

Phase 2 exit for the road-first model (ADR-0002 L1, L2, L4, L5 and migration) is met. Typed command layer — on `phase2/commands`: JSON commands for roads, crossings, junction legs and Slip (`core/road-first/commands.ts`), labelled undo history with drag/typing merge (`core/common/history.ts`), stable crossing ids and decisions that follow their crossing (`scripts/verify-road-first-commands.cjs`). The Network workspace keeps its snapshot undo until Phase 3 moves editing onto road-first.

Still open from the Phase 2 list above: left-hand-traffic lane-connection defaults, per-corner radius; plus carrying parallel corridors into the road-first file and continuing the solid divider onto the RoadLink. Continuing the solid divider onto the RoadLink is deferred to the RoadLink marking work.

---

## Phase 3 — One workspace

- Single route and shell; junction detail edited in place (focus mode), not on a separate page.
- Draw Road tool with presets; candidate junction confirm flow.
- Inspector: header → key properties → collapsed advanced. Network summary moves to a status bar / Review panel. Destructive actions are not the first control.
- One cross-section orientation convention everywhere.
- Explicit Select vs Pan modes; snapping per `docs/spec/SELECTION_SNAPPING.md`.

Exit: GW-01 and GW-02 (see `docs/spec/GOLDEN_WORKFLOWS.md`) completed by the owner within the targets set in Phase 0B; UX review gate passed.

Slices (re-planned 2026-10-19 from `docs/research/2026-10-UX-RESEARCH.md`, accepted by the owner):
1. Road-first workspace shell at `/design` — Draw Road with presets, road section by number, labelled undo/redo, file open/save, migration of the earlier design on first open. **Done.**
2. Quick wins — automatic junction where roads cross (announced, with Undo and "make it a grade separation"; replaces confirmation of every crossing), last-used section for the next road, larger handle targets, plan never shifts when the section strip opens, engineer wording (approach instead of arm), fit messages with numbers.
3. Drawing aids — snap to road ends and alignments with a visible halo, continue from a road end, 90°/15° angle inference, typed length while drawing, Shift to suspend snapping.
4. Junction detail in place — select an approach, then "+ right-turn pocket" / "+ Slip lane" with width, storage and taper typed in place; left-hand-traffic defaults; drag handles for corner radius and pocket length (handles and fields edit the same value).
5. Scenarios on the new workspace — duplicate as Alternative, compare with a highlighted difference, export a report figure.
6. Make `/design` the only workspace and retire `/network` and `/junction`.
7. Later — one-click junction ↔ roundabout conversion keeping compatible details; station-based lane transitions; OSM/GeoJSON start.

Not adopted from the research for now: usage telemetry (no backend; privacy first). Action counts are measured by the browser acceptance scripts.

Status: slice 1 merged 2026-10-18 (T3 in 5 actions, baseline 17). Slice 2 merged 2026-10-19 (PR #16). Slice 3 merged 2026-10-19 (PR #17). Slice 4 merged 2026-10-20 (PR #18). Slice 5 on `phase3/scenarios` (2026-10-20): scenario tabs, "+ ทางเลือก", comparison highlights by road/crossing identity, report figure PNG/SVG, workspace file with every scenario; earlier Network files migrate every scenario.
Slice 5 merged 2026-10-20 (PR #19); fix PR #20 (left-turn pocket and Slip lane not on the same approach). Slice 6 staged (owner decision 2026-10-20): 6a on `phase3/one-workspace` — `/` opens `/design`, `/junction` becomes the advanced junction editor with a round trip, `/network` kept by URL as the earlier page; parity register in `docs/spec/RETIREMENT_PARITY.md`. 6b-1..3 merged (PR #22–#24): 3D, Design Summary, reference image, online map, section by station; parallel/frontage corridors and auxiliary proposals dropped for now (owner). 6c on `phase3/retire-network`: `/network` redirects to `/design`, import of earlier work as alternatives, Network browser test reduced to the junction golden suite.
Independent review 2026-10-20 (ChatGPT): P0 fixes merged — topology integrity (PR #26), data safety (PR #27). P1/P2 listed in the review follow.
P1 merged (PR #29). P2 merged: road join (PR #30), per-corner radius (PR #31), per-object migration report (PR #33); preview of the outcome while drawing and right-click step back (PR #34).

**Accepted by the owner on 2026-10-21.** Deviation from the exit rule above, by owner decision: the hands-on run of GW-01/GW-02
by the owner is replaced by a usability review by the maintainer agent and ChatGPT, to be done during Phase 4; its
findings are handled as fixes. Carried forward, not blocking:
- Merge the advanced junction editor (`/junction`) into `/design` in place — separate track alongside Phase 4,
  starting with what still needs the advanced editor (crossings, signals, roundabout, median openings, markings).
- Station-based lane transitions — moved to Phase 4C.
- One-click junction ↔ roundabout conversion; OSM/GeoJSON start — unchanged in "Later" of slice 7.

---

## Phase 4 — Grade separation and engineering depth

Owner-approved review sequence (2026-10-22), superseding the earlier “next Select hub” notes below:
**review PR-01+02 together → PR-04 → PR-05 → PR-06 → PR-07 → PR-08**.
These are review-plan IDs, not GitHub PR numbers. Select hub (PR-03) and PR-09 onward are not authorized in this round.
PR-17 is limited to CriterionRef schema after PR-05. Five licensed real-site examples are the v2 closure gate, not a gate to start coding.
Keep road-first and one resolver; retain legacy compile on open and offer explicit previewed conversion. Diamond origin version 1 is never regenerated automatically.
Details of the combined first slice: [canonical alignment and migration](spec/CANONICAL_ALIGNMENT.md).
PR #64 is merged at `7d421c9` after Quality and Vercel success. The next isolated review-plan PR-04 implements [vertical curves and owned profile proposals](spec/VERTICAL_CURVES.md); merged as PR #65 at `fb3ecbb`.
Review-plan PR-05: [structure envelope and measured clearance](spec/STRUCTURE_CLEARANCE.md), merged as PR #66 at `2525fd7`.
Review-plan PR-06: [flyover / underpass composer](spec/GRADE_COMPOSER.md), merged as PR #67 at `55c6a62`.
Review-plan PR-07: [U-turn bridge and U-turn under a bridge](spec/UTURN_STRUCTURES.md), merged as PR #68 at `f85fe37`.
Review-plan PR-08 (this slice): [ramp terminals — tangent tie-in and gore](spec/RAMP_TERMINALS.md). This closes the approved first round (PR-01/02/04–08), merged as PR #69 at `fecefb2`.
Owner go-ahead 2026-10-23: PR-03 next. Review-plan PR-03 (this slice): [Select as the editing hub](spec/SELECT_HUB.md) — first part of 4B-4. Owner go-ahead 2026-10-23 for 4C: review-plan PR-09 [lane runs](spec/LANE_RUNS.md) first, then PR-10 (merge / diverge lanes and lane mapping).

Phase 3 accepted 2026-10-21; Phase 4 is the current phase. 4A done (PR #50, #51); 4B-1, 4B-2, 4B-2b, level criteria and 4B-3 (diamond) done; next 4B-4 (Select editing hub).

### 4.0 — UX closure before 4A (from the [UX / workflow review 2026-10-21](research/2026-10-21-UX-WORKFLOW-REVIEW.md))

1. First open offers: search a place on the map / use a site image / start blank. Map providers state trace rights.
2. Phone widths: review first; the inspector does not cover the plan by default.
3. Median opening at a junction approach, created and edited in `/design`.
4. Project access (driveway) as a road role.
5. Junction focus mode in `/design`: crossings, islands, stop lines, mid-block median opening; `/junction` retired after parity.

Status 2026-10-21: 1 (PR #37), 2 (#38), 3 (#39), 4 (#40) done. 5 in place in `/design`: crossing / stop line / signal
(#41), junction ↔ roundabout (#42), lane arrows and divider (#43), folded inspector sections (#44), mid-block median
opening / U-turn (#45). Still only in the advanced editor (`/junction`, reached from the junction inspector): median trees,
Slip departure and Slip crossing, roundabout entry/exit radii, splitter and apron, arrow position overrides, outgoing
divider. `/junction` is retired when these move (parity register `docs/spec/RETIREMENT_PARITY.md`).

Rule for every Phase 4 feature: created on the same canvas, preview before commit, handle and number edit the same value,
one undo step, no page change, plan / section-profile / 3D / export read the same state.
Source for 4A–4E: [game-UX and interchange research, 2026-10-21](research/2026-10-21-GAME-UX-INTERCHANGE-RESEARCH.md).
Its action-count targets are the researcher's proposals, not industry standards; they are re-measured here
against `docs/spec/UX_BASELINE_RESULTS.md` as each slice lands.

Principle: *sketch as fast as a game, inspect as clearly as an engineering tool.* Every generated object stays an
ordinary editable road, ramp or lane run; nothing is an opaque block. No score or fake simulation visuals.

### 4A — Elevation and crossings (foundation)

- Vertical profile per road (`z` by station; Line + circular arc in plan first), structure runs (at grade / bridge / underpass).
- Crossing relation per road pair: at grade (junction) / A over B / B over A / unresolved.
- 2D draws the upper road over the lower one; 3D, section and export read the same profile.
- Exit criteria (all as regression tests):
  - Two roads crossing in plan at different levels create no junction.
  - Flipping A over B ↔ B over A updates 2D, 3D, selection and export together.
  - Moving an alignment recomputes crossing stations and levels deterministically.
  - One undo reverts a grade-separation change completely.
  - Projects saved before 4A open with every profile at `z = 0`.
  - The report lists each crossing as at grade / bridge / unresolved.
  - Structure stretches (bridge / trough / tunnel) are drawn with a structure finish in 2D and 3D, and an underpass can be chosen per crossing.

### 4B — Free-form interchanges first, then the first template

Owner decision 2026-10-22: free drawing before templates. Ramps, merge/diverge points and levels are built as ordinary
editable pieces first; the diamond template only places those same pieces. Non-standard layouts (flyovers and
underpasses at a junction, constrained urban ramps) are drawn by hand from 4B-1 on, without waiting for 4D.

Status 2026-10-22: 4B-1 done (spec `docs/spec/PHASE_4B_RAMPS.md`). Road curve editing in `/design` added before 4B-2
(owner request): pick a road point, radius typed or dragged (capped by the straights and reported), back to a sharp
corner, delete a point; arms keep clear of arcs; a crossing inside an arc is reported (crossings are still found on
the straight lines between points). 4B-2 done (spec `docs/spec/PHASE_4B_LEVELS.md`). 4B-2b done 2026-10-22. Level criteria (spec `docs/spec/LEVEL_CRITERIA.md`) done before 4B-3: project values with sources drive bridge heights, underpass depths, ramp grades and checks. 4B-3 diamond done (spec `docs/spec/PHASE_4B_DIAMOND.md`). Next 4B-4.

**4B-1 — Ramps drawn by hand**
- Start a road from the side of another road (diverge) and end it on the side of another road (merge); the attachment
  splits the main road at that station automatically (end-to-side, builds on road join and end handling from P2).
- A ramp is a one-way road with a ramp role: same section, plan, 3D and export as any road.
- Merge/diverge anchors stay attached when either road moves; dragging an anchor slides it along the main road.
- A ramp that cannot attach (wrong direction, too close to a junction or another anchor, overlapping another ramp)
  is previewed red with the reason; thresholds are tool values marked `TO_VERIFY` until 4E.
- A ramp crossing another road uses the 4A crossing relation (over / under, bridge, trough, tunnel).
- Exit criteria (regression tests): attach and detach in one undo step each; anchors follow a moved road
  deterministically; red preview reasons; old files open unchanged.

**4B-2 — Levels while drawing**
- Raise / lower the road being drawn in steps (keys and buttons), with a cursor readout of length, radius, grade and Δz.
- Profile strip under the plan: the selected road's long section; drag profile points; typed values edit the same points.
- Stacked levels (three roads or a ramp over a ramp at one place) drawn and reported correctly.
- Exit criteria: drawing at a level creates the same profile as typing it; one undo per gesture; stacked crossings
  compile with the right over/under order in 2D and 3D.

Source for 4B-2b and the editing hub: [road drawing UX research, 2026-10-22](research/2026-10-22-ROAD-DRAWING-UX-RESEARCH.md)
(claims about other products not yet re-checked; its TSD findings were checked against the code).

**4B-2b — Drawing quick wins before the template** (small; each helps the template too)
- Snap badge at the cursor (end / on road / straight on / 15° …) and `Tab` to cycle when targets overlap.
- `Space`+drag pans in every tool (middle-drag stays).
- Ramp anchors: traffic-direction arrows when selected or hovered.
- Long section: plan-size hit targets for level points; labels kept from overlapping.
- Keys: `Delete` deletes the selection; `Backspace` only steps back while drawing.
- Touch / phone: visible ย้อนจุด / จบ / ยกเลิก / snap on-off while drawing; secondary top actions in a "เพิ่มเติม" menu;
  toasts and readouts wrap instead of cutting long Thai messages.

**4B-3 — Diamond interchange (first template)**
- Built only from 4B-1 / 4B-2 pieces: preview → commit as one undoable step → each ramp, anchor and profile stays editable.
- Generated objects keep their origin (`template`, `version`, parameters); regenerating is an explicit action.
- Footprint preview red with the reason when it cannot be placed: a reusable ghost (road / ramp envelope, anchors,
  crossing relation, structure stretches), not diamond-only.
- Orientation and mirror before commit, re-resolved for left-hand traffic and diverge / merge sides (not a picture flip).
- Placement feedback: the main road it attaches to, the station and the level it inherits.
- "Select the pieces of this template" after commit; pieces stay ordinary objects.

**4B-4 — Select as the editing hub** (right after 4B-3) — first part done 2026-10-23 (box / Shift selection, move a selection, right-click zoom / split / join / delete; spec `docs/spec/SELECT_HUB.md`); reverse, straighten and tangent curve done 2026-10-23 (second part, PR #71); one-shot guides (third part) complete 4B-4.
- Box select and `Shift`+click add / remove; move a selection as one gesture (junctions and ramps re-bound after).
- Right-click menu in Select: join, split here, reverse, straighten, zoom, delete.
- Straighten selected points; tangent curve between two straights ("เชื่อมด้วยโค้งสัมผัส").
- One-shot guides after hovering a road: extension, perpendicular, parallel; temporary distance to a picked reference.

Later in Phase 4 or after: parallel / offset road tool, saved templates, general rotate / mirror (4D), equalize grade,
command search (`Ctrl/Cmd+K`), grid in three clicks, freehand sketch with a shown before / after. Not planned: Bezier
road geometry, a full CAD constraint set, silent auto-clamping of drawn geometry.

### 4C — Lane runs and lane connections

Status 2026-10-23: lane runs along a stretch done (PR #73, spec `docs/spec/LANE_RUNS.md`); auxiliary lanes at ramp ends, lane continuity into ramps and weaving measurement (spec `docs/spec/RAMP_LANES.md`). Section of a stretch: more lanes, footway and band widths over part of a road (spec `docs/spec/SECTION_STRETCHES.md`). Section on a structure: a road's own section over its bridge decks and in its tunnels with transitions to the at-grade section (spec `docs/spec/STRUCTURE_SECTIONS.md`). Still open in 4C: lane connectors at junctions.

- Lanes defined by station runs (add / drop, auxiliary lanes, acceleration/deceleration lengths as drawn values).
- Replaces the deferred P2 item "station-based lane transitions".
- Replace / upgrade the section of a selected stretch of road, on the same station-range model as lane runs (research 2026-10-22).
- Custom structure section for bridges and underpasses, with width transitions to the at-grade section (step 2 of the owner decision 2026-10-21; step 1 — same widths, structure finish — is in 4A).
- Automatic lane mapping at junctions and merges; an advanced lane connector for overrides only.

### 4D — More templates

- Templates only place 4B pieces (ramps, anchors, profiles), never a separate object type.
- Trumpet, roundabout interchange, selected cloverleaf variants; mirror / rotate; parameter presets.

### 4E — Rule-referenced checks

- Three states for every check: geometry invalid / needs standards check / checked against a referenced rule.
- A referenced rule shows design value, criterion, source and status. Nothing reads "meets standard" while the source is `TO_VERIFY`.
- Depends on the deferred Thai guideline research (`docs/standards/STANDARDS_POLICY.md`).

### 4F — Engineering depth (earlier Phase 4 list)

- Project access / driveway.
- U-turn treatment built on median opening + general pocket lifecycle.
- Road presets catalogue (2-lane undivided, 4-lane divided, 6-lane divided, urban street with sidewalks).
- Common Thai junction starters (signalized four-leg with right-turn pockets, T with free-left Slip).

## Phase 5 — Markings, annotation and report output

- Marking system per `docs/spec/PAVEMENT_MARKING_SPEC.md`: target-based placement; edge line, give-way line, no-lane-change line, text markings, general hatch areas.
- Generated vs manual objects (detach a generated marking for presentation edits; lock; visibility; source status).
- Annotation layer (labels, callouts).
- Report sheet export: title block, north arrow, scale bar, legend, Existing vs Proposed.
- Concept quantities summary (areas and lane lengths; explicitly not a BOQ).
- Basic DXF export of linework for CAD hand-off.

## Later (not scheduled)

- Design-vehicle / swept-path overlay (concept level).
- Georeferenced maps / CRS, OSM context, WMS/XYZ, GeoTIFF, DXF import.
- Parallel / frontage transfer topology (former Phase 8B).
- Before/after slider, side-by-side compare, saved views.
- Desktop wrapper.
- Large-network rendering (WebGL / deck.gl layers, workers, level of detail) once a benchmark project shows SVG is too slow (research 2026-10-21).
- Natural-language commands that resolve to the typed command layer.

## Explicitly out of scope

Traffic simulation, assignment, demand forecasting, capacity/LOS, signal timing/optimization, drainage/earthworks/grading, BIM/Civil 3D production, construction documents, full CAD command line, standards compliance certification, tracing from imagery whose provider terms prohibit it.
