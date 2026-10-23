# Vertical curves and owned elevation proposals

Review-plan PR-04, based on `main` at `7d421c91344160fbc5b4bec9d08aadb7289d2ecb` after PR #64. This implements the approved profile slice; structure envelopes and composers remain separate approved work.

## Profile contract

`ProfilePoint` retains `station` and `z`, and adds optional `curveLength` and `generatedBy`. A missing/zero length keeps the original linear interpolation, including constant levels outside the profile. Existing projects are not upgraded or smoothed on load. New fields are written as RoadFirst schema 3; versions 1 and 2 remain readable with unchanged geometry. The source of old, untagged points is unknown, so they are protected as authored data. Diamond origin version 1 is never regenerated.

An internal PVI can carry an explicitly entered symmetric parabolic curve. Its two tangent grades come from the adjacent PVIs; its tangent limits are `station ± curveLength / 2`. The quadratic joins both tangents with continuous elevation and grade. The PVI is the intersection of the tangents; the road surface generally does not pass through it. The inspector and longitudinal section distinguish the tangent control from the surface.

Lengths must fit within the actual road and must not overlap adjacent curves. Tangent limits must lie strictly inside neighboring PVI stations so that they cannot coincide with an unsmoothed grade break or constant boundary. Endpoint curves are refused: add boundary PVIs first if a transition is needed there. A horizontal curve still using legacy chord stations must be explicitly converted before vertical curves can be added, so plan and longitudinal distances agree. No curve length, K value, sight-distance criterion or engineering standard is supplied by default.

`core/common/vertical-profile.ts` is the single vertical resolver. Road profiles, crossings, longitudinal drawing and exact Network link elevations use it. Curved profile slices retain the full source profile and station bounds; drawing samples are regenerated from the resolver on reopen. Parabolic subdivision limits vertical chord error to 0.5 mm, a rendering precision rather than a design criterion. Linear legacy slices keep their previous rounding and interpolation.

The current junction engine uses level approach surfaces. A non-flat vertical curve overlapping those approaches is refused instead of being hidden by a flat junction. Curves on standalone roads and grade-separated crossings are supported. This change does not add a sloping junction-arm solver.

## Authored and generated data

An automatic rise/dip tags its new points with a stable owner in `generatedBy`; the decision retains that identity as `profileOwner` when candidate numbering changes. A new crossing cannot reuse an existing owner's identity. A replacement or swap can remove only points owned by that crossing. A manual station, elevation or curve-length edit detaches that point from automatic ownership. Untagged and differently owned points are retained; a conflicting point in the proposed footprint blocks the operation with its station and an explanation. The command boundary independently enforces this protection.

The proposed rise must fit fully within the road and meet the project's entered grade value. A short road no longer gets a clipped partial rise. Existing untagged rises are not guessed to be generated: retain or edit those points explicitly. New automatic rises still start as linear tangent profiles; vertical curves are added by entering their lengths. No unverified curve length is invented. The later composer work can coordinate those controls.

The user sees before/after profile lines and point ownership before confirming a rise/dip. Cancel leaves the project identical. Confirmation changes the crossing relation and affected profiles in one undo step. A stale preview cannot be confirmed. Existing engineering values retain their TO_VERIFY status unless supported by the project's source; this PR introduces no numerical design criterion.

## Verification

- `verify-vertical-curves.cjs`: crest/sag elevation and grade continuity, constrained/overlapping lengths, authored conflicts, owned replacement, manual detachment, atomic command failure, undo/redo, exact shared elevations and persistence.
- Existing base-SHA geometry and migration goldens remain unchanged; existing elevation fixtures now expect insufficient available length to be refused.
- `verify-vertical-browser.mjs`: typed length, surface/tangent display, undo/redo, reopen, 3D, proposal/cancel/confirm and authored-point refusal.
- Full owner gates and the 26-warning lint baseline remain required. Browser evidence is uploaded as `artifacts/vertical-*`.
