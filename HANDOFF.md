# Thai Street Designer — Development Handoff

Updated: 2026-09-30  
Repository: `bokoboss/thai-street-designer`  
Working branch: `chatgpt/full-engineering-ui-audit`  
Pull request: **#1 — draft**  
Current verified Product v1 hardening baseline before Phase 6F.1: `c5dfd843bc837cc4bbbec229c0fc31e026c3d743`

> Git branch/commit/PR/files are the source of truth. Do not reconstruct current behavior from old ChatGPT conversation memory.

## Start here

1. Checkout/read `chatgpt/full-engineering-ui-audit`. **Do not start from `main`.**
2. Read `docs/PROJECT_CONTEXT.md` first to understand why the application exists and how engineering/product decisions should be judged.
3. Read this file completely for the current work/status.
4. Read `docs/ARCHITECTURE.md`.
5. Read `docs/SLIP_LANE_DESIGN_BASIS.md`.
6. Inspect PR #1 and the latest branch commit/status before modifying anything.
7. Run the full quality gates before accepting a code change.

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

Current Network schema is **v3**:

- each `RoadLink` owns semantic endpoints, `LinkVia[]` control points and a radius per PI;
- each `RoadLink` can persist station-based corridor components for lane and width lifecycles;
- `linkPoints()` resolves PI/radius controls into tangent–arc–tangent geometry;
- `RoadLink.sectionProfile.mode` is explicit: `review` or `linear`;
- linear section interpolation is allowed only when lane counts and edge-band topology match at both ends;
- lane-count changes remain unresolved/explicit rather than being hidden by width interpolation;
- Network schema v1/v2 imports migrate conservatively to v3; legacy via radii remain 0, older projects retain explicit review semantics, and v1/v2 links gain `components: []`;
- plan rendering, link length and Fit consume the same resolved RoadLink alignment.

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

RoadLink schema-v2 code baseline `4c7acef26c2c042233bcfff09e7ee6638232b461` passed the GitHub Quality workflow:

- Geometry/workspace regressions ✅
- TypeScript ✅
- Lint ✅
- Sites/vinext production build ✅
- Vercel/Next production build command ✅

Relevant Quality run: `35833034259`.  
Audit Preview for the same baseline also deployed successfully: run `35833030822`.

These source/build checks do not replace visual/interaction acceptance of the actual geometry.

## Immediate next work

Product v1 is now in hardening rather than foundation expansion.

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

Keep Parallel / Frontage Road and advanced CAD-like editing after these Product v1 hardening milestones.

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

- Git integration creates Preview deployments from the audit branch.
- Production must remain on the configured production branch until deliberate acceptance/merge.
- Current branch should not be merged merely because CI passes; Slip refactor still needs visual acceptance.

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
5. do not merge PR #1 until the user explicitly accepts the result.
