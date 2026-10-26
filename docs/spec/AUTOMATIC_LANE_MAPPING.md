# Phase 4C — PR C: Automatic lane connections

Status: implementation in isolated PR C after PR B (#78), based on main at edc3539.
The result is a *derived/read-only mapping*, not a new saved junction design or a simulation network.
PR D owns any user-authored connector overrides.

## What the engine does

- \`automaticLaneMapping(Design)\` joins individual incoming lanes to outgoing lanes at ordinary 3-/4-leg junctions, based on the existing semantic Arm, section, turn-arrow configuration and actual resolved lane centre.
- Angular classification is based on the *incoming* travel bearing, not the radial arm bearing. In the y-down plan used here, left is a -90° turn and right +90°. Through movements are within ±45°; turns within 45–155°. Unclassifiable movements are **not inferred**.
- Receiver lanes are ordered **median to curb**, as in \`lane-configuration.ts\`. Right turns take the median-side receivers, left turns the curb-side receivers, through lanes the closest order-preserving set.
- There is **no hidden many-to-one merge** when the source group exceeds the receiver group. The extra sources produce a review item, and only feasible 1:1 assignments are emitted. Two approaches may legitimately point at the same receiver: this does not simulate conflicting simultaneous turns.
- Missing/ambiguous exit legs and zero receiving lanes produce review items; the original junction geometry is unchanged.
- Existing Slip lanes retain their own geometry and identity. The through-core resolver does not duplicate the Slip movement. The base \`edges()\` and the Slip invariant are untouched.
- Roundabout circulation, U-turn path planning, standards-based taper, capacity/LOS, and conflict/signal simulation are **not implemented**. Authored U-turn arrows require review.

\`automaticRampLaneConnections(Road[])\` separately covers one-lane, one-way ramps. Start = diverge, end = merge. It resolves direction from the existing anchor side and connects through the *already-authored* auxiliary run. No terminal lane means a review item, not a created lane; overlapping runs keep the canonical auxiliary resolver.

## Storage / identity / geometry

- Mapping is re-derived from the current project. It is **not serialized** and does not change schema versions, old files, Road Link components, the Slip engine or the 2D/3D pavement.
- Individual connector IDs include source + turn + receiver lane references. Road-first junction leg identity remains bound to road ID and ahead/behind on every compile; arm slots are ephemeral render locations.
- Lane centre points use \`resolvedLaneCenterY\` with the canonical \`edges()\` and rotation. These are mapping anchors **only**, not a new pavement geometry or line markings path.
- The Design inspector displays connections in a folded, read-only Thai review. A selected ramp displays its mapped/review status. Manual overrides and interactive connector handles are reserved for PR D.
- Dimensions and drawing defaults remain \`TO_VERIFY\`; a mapped lane means geometric/semantic pairing only, never standards compliance.

## Acceptance

\`scripts/verify-automatic-lane-mapping.cjs\` covers: Thai left-hand left/through/right, multi-arrow assignment, receiver capacity shortage and zero lanes, T-junction missing exit, U-turn review, deterministic JSON roundtrip, unchanged base geometry and Slip invariant, ramp diverge and opposite-direction merge, and refusal to invent a missing ramp auxiliary.

\`scripts/verify-design-browser.mjs\` verifies that an automatically created junction surfaces generated mappings in the Inspector. Existing network/geometry, legacy reopen, section, lane reduction, Slip, and full browser/golden regressions continue to run.

Merge only when GitHub Actions \`test-and-build\` and Vercel both report success for the **same head commit**.
