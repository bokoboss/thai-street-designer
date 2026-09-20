# Modern Precision Workspace — implementation and validation

This extends the existing application. It remains **Concept Design Tool — Not for Detailed Engineering Design**.

## Implemented

1. **Space allocation:** a pure, shared allocator supports Auto, prefer median, keep median/widen, explicit curbside shoulder/buffer reallocation, and inherited legacy preservation. Auto right-side lanes share available central reserve and widen only by the remaining deficit. Auto curbside lanes widen outward without consuming sidewalk, bike or motorcycle space. The adjustable 1.5 m residual target and 0.2 m graphical threshold are conceptual values, not engineering minima. Profiles, outer edges, band widths, sections and reviews use the same result.
2. **Selection:** object identities connect plan, section and inspector. Priority-based hit candidates provide deterministic selection, Alt-click cycling and a right-click overlap chooser. Hover and selected outlines are independent of geometry calculation.
3. **Grips:** storage, taper, crossing setback, median-opening ends and requested first-tree position. New grips preview changes and commit a single history transaction; cancel restores the original design. Existing approach endpoint editing remains.
4. **Quick actions:** selected approach/direction and selected object determine the action strip. Add left/right lanes, crossing, slip, signal, median trees/openings, or select roundabout components. Command search exposes additional actions.
5. **Inspector:** object-specific quick properties precede an All Properties / Advanced section retaining the original controls. Shared direction context remains.
6. **Cross-section:** dimensioned, clickable main/auxiliary lanes, median, bands and sidewalks; station slider; synchronized object selection; planting shortcut; shared allocation numbers. A plan station marker identifies the section location. Roundabout sections are restricted to the straight approach beyond the splitter.
7. **Median trees:** independent enable, requested setback, spacing, height, crown and offset; actual first tree and count; common 2D/3D object generation.
8. **No-plant intervals:** pocket storage/taper where median is consumed, median head/splitter, crossings/refuges, openings and insufficient-width intervals are merged before placement. Planting resumes at the next valid interval while maintaining at least the chosen longitudinal spacing from the previous tree.
9. **Review:** geometry rejection appears in the inspector and review panel; engineering reviews navigate to affected objects and focus the plan. Notes explain conceptual assumptions. Optional canvas review markers are excluded from exports.
10. **Search:** Ctrl/Cmd+K, searchable actions, Enter to run; shared component used by Junction and Free Draw.
11. **Display:** grid, labels, arrows, scale, trees, lights, dimensions, review markers and grips can be hidden without deleting design features.
12. **Visual system:** consolidated Junction CSS, reusable workspace variables, compact tool rail/drawers, calm inspector, restrained palette and dimensions. Free Draw uses the same workspace variables and search surface. Four starter designs are available.
13. **Preservation:** retained advanced section, divider, arrow, roadside, copy, alignment, slip, signal, 2D/3D, file, recovery, export and touch code paths. Free Draw polyline editing, endpoint snapping and shared nodes remain. Roundabout V2 remains, with one corrected crossing-boundary regression.
14. **Migration:** schema 4; schema-3 preserve/widen semantics remain inherited, rather than silently becoming Auto. New features use explicit Auto. Older schemas remain migrated; unsupported future versions are rejected.

## Automated validation

All passed:

- `pnpm exec tsc --noEmit`
- `node scripts/verify-junction.cjs`: existing geometry/render cases, divider/stop-edge, gestures, mouse controls, skew datum, JSON and furniture regressions.
- `node scripts/verify-pockets.cjs`: independent directions, auxiliary/receiving lanes, tapers, skew, slip, roundabout and JSON.
- `node scripts/verify-constraints-roundabout.cjs`: inherited preservation/widening and **10 roundabout cases**, including the new skewed three-arm unequal-width crossing case.
- `node scripts/verify-network.cjs`: polyline projection, bend validation, endpoint snapping, shared nodes and shared pocket rules.
- `node scripts/verify-visibility.cjs`: **36 camera angles / 9,723 overlap probes**.
- `node scripts/verify-workspace.cjs`: median-only/mixed/outward/reallocated/opposing allocation; actual edges/profile; planting intervals/openings/spacing/narrow widths; schema migration and round-trip; deterministic overlap ordering; transaction commit/cancel; shared section widths and display/data separation.

## Actual Site-preview checks

- Added incoming right pocket immediately; 4 m median / 3.25 m lane reported **2.50 m median + 0.75 m widening**, residual 1.50 m.
- Added curbside lane: **3.25 m outward widening**, sidewalk retained.
- Dragged taper from 15 m to 28 m; one Undo restored 15 m.
- Clicked section median, changed width, and observed plan/section/allocation update together.
- Enabled median trees: requested start 18 m moved to **49.5 m** after pocket; adding opening shifted it to **52.0 m**, count changed from four to three. Inspected 2D and 3D; clicked a tree to open landscaping inspector.
- Clicked plan crossing; inspected right-click overlap choices; navigated a review to the pocket inspector and focused view.
- Used action search in Junction and Free Draw; display tree toggle hid objects without disabling their design settings.
- Generated 2D PNG transparent preview, JPEG white preview, and 3D PNG preview (2400 × 1378); preserved export controls and renderer.
- Created single-lane four-arm roundabout; tested three-arm, 15° approach and unequal lane width. Found and fixed a remote-arm curb intersection causing an oversized crossing; reopened saved case and visually confirmed correction.
- Drew a three-vertex Free Draw road snapped to an existing endpoint (shared node), added/moved/deleted an internal vertex, and used Fit via action search.
- Reset-to-four-way and reopen-last-design tested.

## Limitations and deliberate deferrals

- These are conceptual plan/section geometries, not certified engineering, landscape or sight-distance checks. Residual planting clearance is crown-based; narrow intervals are sampled at 0.25 m before placement.
- Cross-section is a dimensioned allocation strip, not an elevation/vertical-profile editor. It does not model a roundabout entry flare, slip lane or curb-nose cross section; roundabout station range starts beyond the splitter.
- Direct object selection/grips are in 2D and the section. 3D retains camera/image context controls; no 3D ray-picking or 3D grips.
- Dimension overlay is limited to selected median, pocket storage/taper, crossing setback, opening length and requested tree spacing/start. No CAD dimension solver.
- Free Draw retains its existing conservative, explicit legacy-preserve pocket treatment and shared validation. Mixed-widening pockets are exposed in Junction; no automatic full junction conversion or new topology system was added.
- Context menu offers relevant edit/selection/delete/fit operations. Property copy remains in Advanced; no arbitrary object duplication or multi-selection system.
- Drag cancellation has pure transaction coverage; physical touch devices, exhaustive imported user-file collections, and every combination of slip/roundabout/pocket parameters were not manually exercised in this pass. Existing gesture regressions pass.
- No vehicle simulation, standards certification, advanced multi-lane roundabout analysis, GIS, backend or unrelated features were added.
