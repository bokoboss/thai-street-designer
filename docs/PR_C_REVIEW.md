# PR C — automatic lane mapping review

Local review date: 2026-10-26. Branch: `feat/automatic-lane-mapping`, existing PR #79.
Baseline: `0671ce83afd7db1dd73b1cccf662eb9eddadf3c9`, after PR B #78.

## Problems and decisions

1. Through mapping centered the receiving group by count. A dedicated neighboring turn lane could therefore push a through movement sideways; gaps between through sources were also lost. Ordered minimum lateral displacement now selects actual resolved receivers, with explicit capacity review instead of hidden merging.
2. A ±45° classification alone mistook an acute side turn for through traffic and could invent through movement from a skew T stem. Through legs now require reciprocal unique opposite-leg matching; supported acute left/right movements remain available. Angular thresholds remain `TO_VERIFY` tool heuristics.
3. Both directions sampled the same mouth-plus-offset station. Incoming/departure anchors now use their own canonical treatment datums, including receiving pockets.
4. Ramp mapping treated requested auxiliary settings as proof of rendered continuity. It now reads the existing compiled project, verifies run coverage, checks overlapping reductions and endpoint alignment, and refuses a false mapped status for omitted or disconnected lanes. The inspector passes its existing compile result; there is no second compiler or pavement engine.
5. Invalid base geometry, unassigned incoming movements and unfit Slip overlays lacked mapping review. Existing geometry and Slip validators now supply review without editing geometry.
6. Chrome did not start its debugging endpoint with relative profile paths on Windows. Both existing browser harnesses now resolve those paths absolutely.

Files: the two mapping modules in `core/`, `app/design/design-inspector.tsx`, the mapping regression script, lane browser assertions, two browser harness files, and mapping specification/review documentation.

## Validation

All local gates passed on Windows with Node 24.20.0 and pnpm 11.25.0. Local logs and screenshots are under ignored `artifacts/`.

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile unchanged |
| `pnpm test` | PASS; all 50 regression scripts |
| `pnpm exec tsc --noEmit` | PASS |
| `pnpm lint` | PASS; 26 existing warnings, zero errors |
| `pnpm build` and `pnpm test:builds` | PASS; production Next build and TypeScript |
| `pnpm test:browser` | PASS; Design, selection, lanes, five junction golden cases, alignment and vertical suites |

Browser acceptance was rerun serially after a concurrent unit/browser run collided on the shared temporary fixture build. The complete serial run passed. Plan/3D reduction, ramp and grade-separation screenshots were inspected; the shared geometry consumers were also checked in source. No screenshot pixels are treated as engineering certification.

The mapping suite covers ordinary/skew T and four-leg junctions, rotation, dedicated/multipurpose and non-adjacent through lanes, median/curb auxiliaries, receiver shortages/zero lanes, ambiguity, invalid geometry, canonical datums, Slip, deterministic reopen, both ramp ends on both traffic sides, wrong-way/stale endpoints, merged auxiliaries, omitted lanes and reductions both at and away from a terminal. Mutation checks preserve authored state and the exact shared compiled geometry.

Browser acceptance retains the existing workflow action counts: automatic junction mapping adds no authoring actions, and a ramp auxiliary still takes one checkbox action. New assertions verify review before that action and mapped status afterward. This supports GW-02 review without adding interaction steps. No human completion times are inferred from scripted runs.

## Remaining engineering limits

- Coincident overlapping ramp auxiliary runs can retain a canonical taper that closes at an attachment. Such a terminal is explicitly reviewed. Changing that saved geometry requires an explicit reviewed geometry correction; PR C does not silently widen it.
- Complex ramp sections/compositions, roundabout circulation and U-turn paths are not inferred. Mapping is lane pairing, not a swept-path, signal conflict, capacity/LOS or standards-compliance check.
- All unverified criteria and dimensions remain `TO_VERIFY`. No standards-derived dimensions were introduced.
- Legacy migrations, schemas, base pavement, markings and Slip ownership are unchanged.

PR D retains manual connector overrides, interactive connector editing and override persistence. PR D is not started. Squash merge of #79 requires successful `test-and-build` and Vercel deployment for the same latest head; retain the feature branch.
