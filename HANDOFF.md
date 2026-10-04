# Thai Street Designer — Development Handoff

Updated: 2026-10-01  
Repository: `bokoboss/thai-street-designer`  
Released branch: `main`  
Current post-v1 working branch: `chatgpt/post-v1-transfer-topology`  
Historical audit branch: `chatgpt/full-engineering-ui-audit`  
Product v1 pull request: **#1 — merged 2026-09-30**  
Phase 8A pull request: **#2 — merged 2026-10-02**  
Current Phase 8B pull request: **#3 — Draft · Mainline ↔ Frontage Transfer Topology**  
Product v1 released baseline: merge commit `98198c443b4aee96fcb25c64d5c426aa03bb8d0b` · final pre-release Quality run `36703377299`

> Git branch/commit/PR/files are the source of truth. Do not reconstruct current behavior from old ChatGPT conversation memory.

## Start here

1. For current Phase 8B work, checkout/read `chatgpt/post-v1-transfer-topology`. PR #2 is merged and the Phase 8A branch is historical.
2. Treat `main` as the released Product v1 baseline. `chatgpt/full-engineering-ui-audit` is historical audit evidence only; do not resume feature work there.
3. Read `docs/PROJECT_CONTEXT.md` first to understand why the application exists and how engineering/product decisions should be judged.
4. Read this file completely, then `docs/ARCHITECTURE.md`, `docs/NETWORK_FOUNDATION.md`, `docs/PARALLEL_FRONTAGE_ROAD_DESIGN_BASIS.md`, `docs/TRANSFER_TOPOLOGY_DESIGN_BASIS.md` and `docs/POST_V1_ROADMAP.md`.
5. If PR #2 has already been merged, start the next milestone from current `main` on a new review branch rather than continuing the historical Phase 8A branch.
6. Run the full quality gates before accepting a code change.

## Product v1 mission and guardrails

> **Do not expand Thai Street Designer into traffic simulation, network assignment, signal optimization, or general transportation-analysis software during Product v1. The current objective is to complete, harden, and polish a professional concept-level street geometry design workspace.**

### Product definition

Thai Street Designer is a **concept-level street, junction and corridor geometry design workspace for Thailand / left-hand traffic**.

Its primary job is to help an engineer or designer:

1. **create** street / junction / corridor concepts;
2. **edit** geometry and cross-sections predictably;
3. **review** engineering semantics, continuity and warnings;
4. **compare** design alternatives;
5. **present / export** concept designs clearly.

If a proposed feature does not materially improve one of those five jobs, treat it as out of Product v1 scope unless the product definition is deliberately revised.

### In scope for Product v1

- Junction geometry and direct editing.
- RoadLink / corridor geometry and section continuity.
- Lane, median, sidewalk and semantic edge-band composition.
- Pocket / receiving lanes and other concept-level auxiliary-lane treatments.
- Slip-lane and roundabout concept geometry.
- Multi-junction Network workspace.
- Map and calibrated local-image reference.
- Existing / Alternative scenarios and comparison.
- Engineering review warnings and deterministic design checks.
- Project file workflow, export, design summary and report-ready figures.
- Stability, performance, visual regression and UX hardening of the above.

### Explicitly out of scope for Product v1

Do **not** start these merely because they are technically adjacent or interesting:

- traffic assignment or route choice;
- microsimulation or queue simulation;
- signal timing / signal optimization / adaptive control;
- demand forecasting;
- capacity / LOS analysis as a parallel analysis product;
- autonomous AI street design;
- production-grade BIM / Civil 3D integration;
- general-purpose GIS or CAD replacement;
- unrelated transportation-analysis modules.

These ideas may be recorded as future possibilities, but they must not displace Product v1 hardening.

### Engineering boundary

This is an **engineering-informed concept design / design-support tool**, not a certified detailed-design package. The application should expose assumptions and unresolved conditions rather than implying detailed-design compliance that the engine has not actually checked.

### Architecture guardrail

New functionality must extend the existing ownership model. Do not create a parallel geometry, renderer, section, Slip, scenario or Network engine to obtain a quick visual result.

Prefer:

`one semantic model → one resolver → many consumers (2D / section / 3D / export / review)`

over feature-specific geometry branches.

### UX guardrail

The root interaction hierarchy remains:

**Select → direct manipulate / quick edit → precision tune in Inspector / section dock → review / compare / export**

A new feature should not make basic selection, dragging or editing materially harder. Advanced controls should stay contextual or progressively disclosed.

### Release / priority guardrail

Until Product v1 is declared ready, prioritize:

**Correctness → regression safety → stability/performance → usability → export/reporting → new features**

Do not begin another major feature family while a known core geometry or interaction regression remains unresolved.

### Scope decision gate

Before implementing a new feature, answer all of the following:

1. Does it directly support **create / edit / review / compare / present** concept geometry?
2. Can it use the existing semantic ownership model rather than creating a parallel engine?
3. Is there a clear Product v1 user workflow that needs it now?
4. Can its engineering behavior be stated and regression-tested?
5. Is it more important than the current hardening / correctness backlog?

If the answer to **1** is no, defer it from Product v1.  
If **2** or **4** is no, research/design the model first rather than coding the feature.  
If **5** is no, put it in the future backlog and continue the current v1 milestone.

## Current project state

The product is now **Network-first**, while preserving the schema-v6 Junction engine as the local intersection source of truth.

Current Network schema is **v5**:

- each `RoadLink` owns semantic endpoints, `LinkVia[]` control points and a radius per PI;
- each `RoadLink` can persist station-based corridor components for lane and width lifecycles;
- `parallelCorridors[]` groups ordinary RoadLinks as Mainline and Left/Right Frontage chains without owning duplicate geometry;
- each Parallel Corridor persists `mainlineStartJunctionId` so Left/Right are interpreted looking ahead along one explicit reference direction;
- `linkPoints()` resolves PI/radius controls into tangent–arc–tangent geometry;
- `RoadLink.sectionProfile.mode` is explicit: `review` or `linear`;
- linear section interpolation is allowed only when lane counts and edge-band topology match at both ends;
- lane-count changes remain unresolved/explicit rather than being hidden by width interpolation;
- Network schema v1/v2/v3/v4 imports migrate conservatively to v5; v4 adds no transfer ports on migration, and early v4 Parallel Corridor files without an explicit reference start still infer it deterministically during load;
- `transferPorts[]` is the Phase 8B.1a semantic foundation for mid-link merge/diverge anchors: each port owns host RoadLink ID, station, travel direction, carriageway side and merge/diverge role;
- `transferConnectors[]` is the Phase 8B.1b topology/section layer joining DIVERGE → MERGE ports with explicit one-way lanes/width; it deliberately has no independent renderer yet;
- plan rendering, link length, Fit, Scenario Comparison and Design Summary consume the same canonical Network state.

The Slip work remains a **structural rewrite of Slip lane architecture**, not a cosmetic patch.

Current design schema is **v6**:

- `Design.slips: SlipLane[]` is the Slip source of truth.
- `Arm` no longer owns runtime Slip state.
- `app/junction/geometry.ts` is base-junction geometry only.
- `app/junction/slip-model.ts` owns Slip state/lifecycle.
- `app/junction/slip-geometry.ts` builds the Slip overlay.
- `app/junction/design-validation.ts` composes base and Slip validation.
- Generic `incomingPockets/outgoingPockets` are no longer used as hidden Slip state.

The key invariant is:

```
edges(designWithSlip) === edges(theSameDesignWithoutSlip)
```

Adding, removing, resizing or changing Slip treatment must not move the main junction mouth, main lane count, base curb, or generic Pocket geometry.

## Current Slip model

A `SlipLane` links one source arm to the next receiving arm and owns:

- width and radius
- approach:
  - `direct`
  - `auxiliary` with width/storage/taper
- departure:
  - `direct`
  - `shared-aux` with width/length/taper
  - `acceleration` with width/length/merge and chevron or raised separator
- crossing enabled/offset
- arrow offset

Baseline creation is deliberately simple:

- no crossing by default
- no approach auxiliary by default
- no receiving/acceleration lane by default
- no experimental high-entry compound curve by default
- Slip is rendered as an overlay over an unchanged base junction

Slip width transitions are variable-width inside the overlay: the channel matches the connected lane/treatment at the entry tangent, transitions toward the requested Slip width, then matches the receiving lane/treatment at the exit tangent. Crossing and stop line use the local width at their own station.

## Migration policy

Schema v5 experimental Slip fields are accepted only by the migration adapter.

v5 → v6 migration is intentionally conservative:

- preserve source arm
- preserve Slip width
- preserve Slip radius
- reset experimental hidden treatment state to the clean v6 baseline

Do **not** reintroduce old runtime fields such as `Arm.slip`, `slipReceivingMode`, `slipEntryAngle`, `slipAccelerationWidth`, etc. Their only valid presence is inside the legacy import type/migration code in `model.ts`.

## Latest verification

Post-v1 Phase 8A.2 baseline `69e9904066c5a97ce9013abf35aabf90c5db1fdf` passed GitHub Quality run `36822921692`, including schema-v4 regressions, TypeScript, lint, both production builds, browser acceptance and Vercel Preview.

Functional release-candidate baseline `24171c685de4ed93bf254e618ea3e48a9558e81d` passed GitHub Quality run `36702892172`:

- Geometry/workspace regressions ✅
- TypeScript ✅
- Lint ✅
- Sites/vinext production build ✅
- Vercel/Next production build ✅
- Network browser acceptance ✅
- Browser golden artifacts ✅
- keyboard Delete / Escape / Ctrl+Z / Ctrl+Shift+Z release sweep ✅
- Inspector selection/viewBox stability ✅

Vercel status for this functional baseline is **success**.

Earlier Release Audit evidence:
- persistent Project File baseline across reload: Quality run `36701877517`;
- rejected malformed/unsupported Project recovery: Quality run `36702325780`.

Product v1 was explicitly accepted by the user and PR #1 was merged to `main` as `98198c443b4aee96fcb25c64d5c426aa03bb8d0b`.

## Immediate next work

Product v1 hardening is complete and the audited release has been merged to `main`.

Phase 8A is released on `main` through PR #2. Post-v1 work is now **Phase 8B — Mainline ↔ Frontage Transfer Topology** on `chatgpt/post-v1-transfer-topology`.

Read `docs/PARALLEL_FRONTAGE_ROAD_DESIGN_BASIS.md` before implementing this feature family. The first step is a Network semantic relationship over existing RoadLinks, not a second geometry engine and not an Arm-level frontage flag.

Phase 8A.1 status:
- **8A.1a model foundation** — Network schema v4, migration, validation, deletion/reconnect hardening and regression coverage complete.
- **8A.1b Inspector workflow** — staged mainline + frontage creation, existing-group membership editing, canvas member highlighting, safe membership removal/dissolve and Undo/Redo acceptance implemented.
- **8A.2 assisted creation** — one-shot Left/Right/Both frontage seeding over ordinary Junction/RoadLink objects is implemented on the working branch. Seed offset is not persisted as a constraint; generated treatments are deliberately neutralized for review. Left/Right uses a persisted looking-ahead Mainline reference direction. Generated seed Junction review points are persisted per frontage chain, surfaced in Design Summary/Scenario Comparison and can be explicitly Mark reviewed without changing geometry.
- 8A.2 does not auto-connect cross streets and rejects roundabout mainline chains.
- **8A.2 accepted / merged** — assisted-frontage golden evidence, Thai-readable visual QA and one-shot/review UX passed Quality run `36850268921`; PR #2 merged as `cc4994c9331dad12353e9dd13f88902d9dd9b74c`.
- **8B.1a station-port model gate — passed** — schema v5 station anchors passed Quality run `37026206062`; no visual-only ramp and no fake 3-arm Junction.
- **8B.1b connector semantic ownership — passed** — persisted DIVERGE → MERGE connector state, own one-way section, dependency-safe lifecycle and Scenario/Design Summary metrics passed Quality run `37027183441`.
- **8B.2a geometry datum — passed** — shared tangent primitive + host traveled-way-edge station anchor + connector tangent control line passed Quality run `37027973983`.
- **8B.2b host speed-change lane lifecycle — passed** — RoadLink lifecycle reuse + transfer-terminal provenance passed Quality run `37031456049`.
- **8B.2c1 connector pavement surface — passed** — shared connector pavement + stable datum passed Quality run `37032098310`.
- **8B.2c2 painted/physical nose + neutral gore — passed** — dedicated gore regression + focused 2D/3D golden acceptance passed Quality run `37132540363`.
- **8B.3a transfer selection + Inspector workflow — passed** — direct UI create/select/connect/gore/cascade-delete/Undo workflow passed Quality run `37135645697`.
- **8B.3b direct connector alignment editing — passed** — shared-resolver PI insert/select/drag/radius/delete + complete Undo sequence passed Quality run `37139164316`.
- **8B.3c acceptance / Phase 8B engineering freeze — passed** — focused connector/PI + impossible-gore acceptance passed Quality run `37139617777`.
- **8B.4 workspace UX hardening — current before PR #3 review** — no new engineering model. 8B.4a separates Network Inspector into Object / Review / Reference and aligns the Network / ทางแยก / Road Lab application shell.
- **Phase 8C remains frozen** until the UX hardening pass and PR #3 are reviewed.


Completed foundations include RoadLink tangent–arc–tangent geometry, explicit lane-count transitions, station-based corridor lifecycles, Network section dock, Junction-to-corridor handoff, scenario comparison/export, deterministic browser golden cases, and Slip/Roundabout engineering-review audit.

Current sequence:

1. **Phase 6C — Network Editing Hardening**
   - post-connect port-facing transition guard completed;
   - safe cascade-delete + Undo completed;
   - safe endpoint reconnect preserving Link-owned state completed in Phase 6C.3.
2. **Phase 6D — Project File Workflow**
   - Phase 6D.1 adds versioned portable Project JSON, New / Open / Save / Save As, dirty-file status and legacy import through the canonical migration path.
   - Keep local raster bytes and credentials outside engineering JSON unless a later packaging design explicitly owns them.
3. **Phase 6E — Unified Network Export**
   - Phase 6E.1 adds Current View / Full Network × SVG / PNG engineering figures with title, scenario, scale and concept-design disclaimer.
   - Raster basemap / aerial / local-image inclusion remains deliberately deferred until provider-aware attribution and CORS policy is explicit.
4. **Phase 6F — Design Summary / Report**
   - Phase 6F.1 adds a canonical report model, Inspector Design Summary, normalized review findings and self-contained report-ready HTML with optional scenario delta.
   - Report logic reuses Junction reviews, RoadLink continuity and handoff-integrity engines; do not create a separate validation path.
5. **Phase 7A — Product v1 Release Audit / Final Hardening**
   - 7A.1 persists lightweight Project File association + saved-baseline signature across reload without adding file metadata to engineering JSON; Quality run `36701877517` passed.
   - 7A.2 pins rejected-file recovery: malformed/unsupported Open preserves engineering workspace, file association and dirty baseline; Quality run `36702325780` passed.
   - 7A.3 pins keyboard destructive safety, Ctrl+Z / Ctrl+Shift+Z and Inspector/view/selection stability; Quality run `36702892172` passed.
   - 7A.4 refreshes release documentation, verification references and intentional Product v1 limitations.
   - Release decision completed: user accepted Product v1 and PR #1 was merged to `main`.
   - Audit checklist: `docs/PRODUCT_V1_RELEASE_AUDIT.md`.

Parallel / Frontage Road and advanced CAD-like editing may now be considered as **post-v1** work, but must start on a new branch from released `main` and pass the scope/model gate before implementation.

For Slip visual acceptance, continue to preserve the v6 invariant and fix Slip-owned geometry rather than base junction geometry.

## Non-negotiable architecture rules

- Do not put Slip special cases back into `geometry.ts::edges()`.
- Do not put Slip runtime fields back into `Arm`.
- Do not reuse generic `Pocket` as Slip approach/receiving state.
- Do not infer Slip departure mode from the existence of an outgoing Pocket.
- Do not allow renderer, selection, cross-section or 3D to invent their own Slip geometry.
- All consumers must use `slip-geometry.ts`.
- Do not encode a new engineering treatment from intuition. Check design guidance first and document the basis.
- Keep schema migration explicit when data semantics change.

## Engineering/product expectations

This is a conceptual street/intersection design tool for Thai left-hand traffic. It is not a certified final-design package.

The user cares more about:

- correct engineering semantics
- predictable parametric behavior
- explicit assumptions
- evidence-backed design logic
- visual quality suitable for presentation

than about quickly adding options.

When design logic is uncertain, research current/authoritative guidance before implementation. Record the decision in `docs/SLIP_LANE_DESIGN_BASIS.md` if it affects Slip semantics.

## Development workflow

Repository/Git/branch/commit/PR is canonical.

Recommended division of work:

- ChatGPT: architecture, research, review, test design, UX/engineering reasoning
- Codex/local runtime: implementation and local execution when available

Use TDD for behavior changes: add/adjust a failing regression first, then implement the smallest coherent change.

Required gates:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm test:builds
```

The GitHub workflow `.github/workflows/quality.yml` runs these gates.

## Deployment

Read `VERCEL.md`.

- Product v1 was merged to the production branch on 2026-09-30.
- Historical audit Preview evidence remains useful for regression tracing, but new development should branch from current `main`.
- Production changes after v1 should again use a review branch/PR rather than direct feature work on `main`.

## Important files

- `README.md`
- `HANDOFF.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/SLIP_LANE_DESIGN_BASIS.md`
- `app/junction/model.ts`
- `app/junction/geometry.ts`
- `app/junction/slip-model.ts`
- `app/junction/slip-geometry.ts`
- `app/junction/design-validation.ts`
- `app/junction/drawing.tsx`
- `app/junction/selection.ts`
- `app/junction/object-layer.tsx`
- `app/junction/section-view.tsx`
- `app/junction/scene3d.tsx`
- `scripts/verify-junction.cjs`
- `lib/network-project.ts`
- `lib/alignment.ts`
- `app/network/page.tsx`
- `app/network/network-drawing.tsx`
- `docs/NETWORK_FOUNDATION.md`
- `scripts/verify-network-project.cjs`
- `scripts/verify-workspace.cjs`
- `VERCEL.md`

## Handoff rule

Before claiming an issue is fixed:

1. reproduce or pin the intended behavior with a regression when practical;
2. pass all source gates;
3. for geometry/UI issues, complete a visual/interaction acceptance pass;
4. distinguish a Vercel deployment problem from a source-code build failure;
5. for post-v1 work, use a new branch/PR and do not merge until its own acceptance criteria pass.
