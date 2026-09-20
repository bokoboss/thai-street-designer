# Engineering + UI/UX audit remediation — 20 September 2026

This report describes the current audit branch. Thai Street Designer remains a **Concept Design Tool — Not for Detailed Engineering Design**. The implementation provides conceptual geometry and engineering feedback; it does not certify compliance with Thai or foreign design standards.

## 1. Road-space allocation

The former arm-wide Preserve/Widen workflow is no longer the normal authoring model.

New edits use feature-driven allocation:

- **Median-side auxiliary / turn lane:** use available median first, then widen only by the actual deficit.
- **Curb-side auxiliary lane:** widen outward by default.
- **Reallocate shoulder/buffer:** explicit choice only.
- **Retain median:** explicit per-pocket constraint only.
- No hidden 1.50 m residual median is used by Auto.

Example: median 4.00 m + auxiliary lane 3.25 m → median used 3.25 m, residual 0.75 m, outward widening 0.00 m.

A narrow residual median may generate an engineering review, but advice is separated from geometry generation. Schema-4 files retain their former visual result by migrating old hidden retention behavior into explicit per-pocket settings. New designs do not inherit those hidden rules.

## 2. Incoming turn pockets vs outgoing receiving lanes

Incoming and outgoing auxiliary lanes now use different longitudinal datums.

- **Incoming turn pocket:** Storage/full-width region begins from the incoming control datum; taper develops upstream.
- **Outgoing receiving lane:** Receiving length begins at the actual departure-side road-mouth / curb-tangency datum; merge taper follows downstream.

The departure datum is derived from actual intersection edge geometry, including skewed approaches and roundabout exits. Validation, dimensions, grips, section geometry, markings and no-plant calculations use the same directional treatment origins.

## 3. Lane identity and markings

Selection now identifies individual lanes by arm, direction, main/auxiliary role, curb/median side and lane index. Markings are stored per lane for incoming/outgoing main and auxiliary lanes.

Outgoing receiving lanes default to semantic **merge-to-main** markings. The renderer derives the visual diagonal from lane-local geometry, avoiding geographic left/right mirroring errors. If an arrow cannot be placed clear of a crossing or before the full-width lane ends, lane identity is retained while the unsafe arrow is suppressed.

## 4. Independent auxiliary-lane widths

Auxiliary lanes can have an independent design width instead of being forced to inherit main-lane width. That width is used consistently by allocation, carriageway geometry, median consumption, outside widening, dividers, arrows, hit testing, grips, cross-section rendering and inspector editing. Older designs without an auxiliary width inherit the directional main-lane width.

## 5. Cross-section editor

The permanent orientation invariant is:

**LEFT = ขาเข้าแยก · CENTER = เกาะกลาง · RIGHT = ขาออกแยก**

It never mirrors because an approach is North, South, East, West or skewed. The cross-section is a quick editing surface: select an element, click its displayed dimension, Enter/blur to commit, Escape to cancel. Plan, section and inspector share the same model. Tapered auxiliary slices stay proportional to local physical width while the editable value represents the lane design/full width.

## 6. Median landscaping

Median planting remains interval-based. Turn-lane consumption, median openings and unavailable areas generate no-plant intervals. Requested first-tree setback is a minimum request; if it conflicts with geometry, planting moves to the first valid interval and reports the actual result.

## 7. Roundabout geometry

Roundabout Geometry v2 is preserved: central island, truck apron, circulating roadway, external-tangent entry/exit fillets, splitter islands, crossings, yield markings and LHT circulation arrows. Outgoing receiving treatments use the departure/exit tangency where applicable. Multi-lane lane continuity, swept paths and fastest-path analysis remain deferred.

## 8. UI/UX architecture

The application is being consolidated as a **Modern Precision Workspace**:

- compact application header;
- explicit Junction / Free Draw workspace switch;
- compact left tool rail;
- canvas as the dominant surface;
- floating contextual action bar;
- selection-driven right inspector;
- bottom cross-section editing dock;
- one compact status/disclaimer bar;
- View/Display controls separated from design structure.

Roundabout is treated as a junction structure/type rather than a drawing tool. Free Draw is another workspace, not a tool button inside Junction. The visual system uses restrained teal for active/selection states, technical light surfaces, thin borders, limited shadows and a Thai-capable system font stack.

## 9. Reviews and warnings

Feedback is separated into Geometry Error, Engineering Warning and Design Note. Normal successful operations are not warnings merely because median space is used. Widening and complete median consumption are actionable reviews; a shifted first median tree is a Design Note. The header count reports actionable issues rather than low-severity notes.

## 10. Free Draw

Free Draw retains polyline alignments and shared endpoint nodes. Its shell and terminology are aligned with Junction. Median-side pocket overlays now use the same shared Auto allocation logic: median first, widening only the deficit, independent auxiliary width, reported median use/widening/residual, editable lane arrow and flippable travel direction.

The pocket must still fit within one straight alignment segment. Free Draw does not yet convert a mid-link crossing into a complete intersection node automatically.

## 11. Data model and migration

Current design schema: **5**.

Schema 5 adds per-lane markings, semantic merge marking, optional independent auxiliary-lane width and explicit retained-median allocation. Older files migrate forward; unsupported future schemas are rejected explicitly. Legacy `corridorMode` and `residualTarget` remain only for backward compatibility/migration and are not normal new-design controls.

## 12. Verification

Automated regression coverage includes median-first allocation, retained-median behavior, opposing demands, independent auxiliary widths, directional treatment origins, actual departure tangency, lane selection, fixed section orientation for all arms/rotations, merge arrows, schema migration, planting exclusions, roundabouts, Free Draw nodes/pockets and 3D visibility.

Required acceptance commands:

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm test:builds
```

`pnpm test:builds` verifies both ChatGPT Sites/vinext and Vercel/Next.js. GitHub Actions runs the same regression/type/build gate on the audit branch and pull request.

## 13. Deliberately deferred

- swept-path analysis;
- formal standards compliance;
- capacity / LOS and signal optimization;
- fastest-path and full multi-lane roundabout lane-continuity solving;
- terrain / vertical alignment / pavement / drainage / BIM;
- full CAD curve/alignment engine;
- automatic Free Draw mid-link intersection splitting;
- full network-node → Junction workspace handoff.

These require separate engineering scope rather than incremental UI patches.

## 14. Deployment

The source remains shared between two build targets. ChatGPT Sites uses the existing vinext/Cloudflare path; Vercel uses the isolated Next.js path. The GitHub-connected Vercel project creates branch preview deployments automatically. Production remains tied to the configured production branch and should not change until the audit PR is deliberately merged.
