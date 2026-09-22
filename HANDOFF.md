# Thai Street Designer — Development Handoff

Updated: 2026-09-22  
Repository: `bokoboss/thai-street-designer`  
Working branch: `chatgpt/full-engineering-ui-audit`  
Pull request: **#1 — draft**  
Code baseline immediately before this handoff documentation commit: `516b2f9315a5b4b499258362b4b935bf68c6c80c`

> Git branch/commit/PR/files are the source of truth. Do not reconstruct current behavior from old ChatGPT conversation memory.

## Start here

1. Checkout/read `chatgpt/full-engineering-ui-audit`. **Do not start from `main`.**
2. Read this file completely.
3. Read `docs/ARCHITECTURE.md`.
4. Read `docs/SLIP_LANE_DESIGN_BASIS.md`.
5. Inspect PR #1 and the latest branch commit/status before modifying anything.
6. Run the full quality gates before accepting a code change.

## Current project state

The recent work was a **structural rewrite of Slip lane architecture**, not a cosmetic patch.

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

The last code baseline before this handoff documentation passed the GitHub quality workflow:

- Geometry/workspace regressions ✅
- TypeScript ✅
- Lint ✅
- Sites/vinext production build ✅
- Vercel/Next production build command ✅

Relevant GitHub Actions run: `35740741708`.

Vercel Git deployment itself was **rate-limited**, not source-failed:

- status: `Deployment rate limited — retry in 24 hours.`
- therefore the current refactor still needs a real Preview visual/interaction acceptance pass after the limit clears
- do not create repeated empty commits while the quota is blocked

## Immediate next work

Do not add more Slip features before visual acceptance.

After Vercel can deploy again, test a fresh/reset design and verify these scenarios independently:

1. Bare/direct Slip:
   - main incoming/outgoing lane count unchanged
   - no Pocket/receiving/crossing appears automatically
   - corner island, entry tangent and exit tangent look plausible
2. Radius changes:
   - Slip overlay moves continuously
   - base junction remains byte-for-structure unchanged
3. Width changes:
   - smooth entry/exit width transition
   - no abrupt curb jump at tangent
4. Approach auxiliary:
   - exists only upstream of Slip
   - does not become a generic Pocket
5. Shared departure auxiliary:
   - main lanes from the junction remain unchanged
   - auxiliary is owned by Slip
6. Slip-specific acceleration lane:
   - begins at Slip exit
   - full length + merge work independently
   - chevron vs raised separator differ visually
7. Crossing/stop line:
   - both follow local Slip width at their own station
   - drag behavior remains aligned
8. Arrow:
   - appears on the Slip centerline and drags continuously
9. Cross-section and 3D:
   - match the 2D overlay semantics

If the picture looks wrong, fix `slip-geometry.ts` or the overlay consumer. **Do not mutate base `geometry.ts` to make the Slip picture look right.**

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
- `scripts/verify-workspace.cjs`
- `VERCEL.md`

## Handoff rule

Before claiming an issue is fixed:

1. reproduce or pin the intended behavior with a regression when practical;
2. pass all source gates;
3. for geometry/UI issues, complete a visual/interaction acceptance pass;
4. distinguish a Vercel deployment problem from a source-code build failure;
5. do not merge PR #1 until the user explicitly accepts the result.
