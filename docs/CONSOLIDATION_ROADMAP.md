# Consolidation Roadmap

Updated: 2026-10-13
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

Slices: (1) road-first workspace shell at `/design` — Draw Road with presets, crossing confirmation, road section by number, labelled undo/redo, file open/save, migration of the earlier design on first open; (2) junction detail in place (approaches, turn pockets, Slip, corners, crossings); (3) scenarios, comparison and export; (4) make `/design` the only workspace and retire `/network` and `/junction`.

Status (2026-10-18): slice 1 on `phase3/workspace` (`app/design/`, `scripts/verify-design-browser.mjs`); T3 in 5 actions (baseline 17).

---

## Phase 4 — Engineering depth

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
- Natural-language commands that resolve to the typed command layer.

## Explicitly out of scope

Traffic simulation, assignment, demand forecasting, capacity/LOS, signal timing/optimization, drainage/earthworks/grading, BIM/Civil 3D production, construction documents, full CAD command line, standards compliance certification, tracing from imagery whose provider terms prohibit it.
