# Product v1 Release Audit

Updated: 2026-09-30  
Branch: `chatgpt/full-engineering-ui-audit`  
Status: **Release candidate technically gated — awaiting explicit user acceptance; PR #1 remains Draft.**

## Release objective

Confirm that Thai Street Designer Product v1 works as one coherent professional concept-design workflow:

**create → edit → review → compare → save/open → export/report**

The audit does not add traffic analysis, simulation, assignment, signal optimization, BIM/CAD replacement or other post-v1 feature families.

## Release gates

| Gate | Current evidence | Status |
| --- | --- | --- |
| Junction / Slip / Roundabout semantic regressions | `pnpm test` + golden browser cases | Passing baseline |
| Network create/edit | browser create/connect/drag/alignment/section cases | Passing baseline |
| Cross-boundary auxiliary continuity | handoff regression + browser corridor cases | Passing baseline |
| Scenario isolation / comparison | model + browser compare/ghost/change inspector | Passing baseline |
| Project JSON portability | v1 envelope + legacy migration tests | Passing baseline |
| Project file association after reload | Phase 7A.1 persistent file-session metadata · Quality run `36701877517` | Passing |
| Engineering figure export | Current/Full × SVG/PNG browser acceptance | Passing baseline |
| Design Summary / report | canonical report model + HTML export | Passing baseline |
| Dual deployment paths | Next/Vercel + Sites/vinext `pnpm test:builds` | Passing baseline |
| Runtime/browser stability | browser acceptance + runtime console-error gate | Passing baseline |

## Phase 7A — release workflow hardening

### 7A.1 Persistent Project File session

Engineering autosave and portable Project JSON remain separate.

A lightweight browser-only file-session record now stores:

- last project file name;
- compact deterministic signature of the last Save/Open baseline.

It does **not** store another copy of the Project JSON and does not become engineering state.

Expected behavior:

1. Open/Save a Project → file status is clean.
2. Edit engineering state → file status becomes dirty.
3. Reload → filename and dirty/clean relationship survive.
4. Save again → baseline refreshes and remains clean after reload.
5. New Project → prior file association is cleared.

This closes a release-level UX defect where reload previously lost the file association and always reported the autosaved workspace as an unsaved anonymous project.

Quality evidence: run `36701877517` passed model, TypeScript, lint, dual-build and browser acceptance gates.

### 7A.2 Failure / recovery behavior

Release acceptance now covers rejected portable files in both clean and dirty file states.

Required invariants:

- malformed JSON reports an Open failure but does not replace the active Scenario Workspace;
- unsupported Project file versions are rejected rather than silently migrated;
- rejected files preserve the current file name and saved-baseline signature;
- rejected files preserve the current dirty/clean relationship;
- after a rejected file, reload still restores the autosaved active workspace independently of portable-file metadata.

This deliberately keeps two responsibilities separate:

- **autosave** = browser recovery of the current working state;
- **Project File session** = relationship between the working state and the last successful Open/Save baseline.

Quality evidence: run `36702325780` passed all release gates including rejected-file browser recovery.

### 7A.3 Release interaction sweep

The browser release flow now pins keyboard and panel behavior that can otherwise regress when the Inspector grows:

- first **Delete** on a connected Junction only arms cascade deletion;
- **Escape** cancels the armed destructive action without changing engineering state;
- confirmed keyboard Delete removes the Junction and connected RoadLink atomically;
- **Ctrl+Z** restores the atomic cascade;
- **Ctrl+Shift+Z** redoes it;
- another Ctrl+Z restores the project before continuing the release workflow;
- **I** toggles the Inspector without changing Scenario Workspace state, selected RoadLink context or the SVG world viewBox.

These checks complement the existing button-based Undo/Redo, comparison navigation and contextual editing cases.

Quality evidence: functional release-candidate head `24171c685de4ed93bf254e618ea3e48a9558e81d` passed Quality run `36702892172`; Vercel status is success.

### 7A.4 Release documentation / status cleanup

Release-facing documentation now identifies the product as Network-first and points to this audit as the release source of truth. Stale schema-v2 verification references have been replaced with the current functional release-candidate evidence.

#### Intentional Product v1 limitations

These are release boundaries, not unresolved implementation promises:

- **Concept design only.** The tool does not certify compliance with Thai detailed-design standards and does not replace engineer review.
- **No traffic analysis.** No demand forecasting, assignment, capacity/LOS, queue/microsimulation, signal timing optimization or adaptive control.
- **No terrain/elevation design.** Network/Junction geometry is concept-level plan geometry; 3D is a presentation/review view rather than a grading, bridge or earthworks model.
- **No CAD/BIM replacement.** Production Civil 3D/Revit/BIM integration and construction-document workflows are outside v1.
- **No Parallel / Frontage Road family yet.** This remains deliberately after v1 acceptance because it requires its own semantic/network design basis.
- **Raster references are references.** Basemap/aerial/local raster pixels are not embedded in engineering SVG/PNG exports; provider-aware licensing/CORS/attribution packaging is deferred.
- **Local image bytes are browser-local.** Portable Project JSON carries engineering/scenario state, not IndexedDB image bytes or map-provider credentials.
- **Browser Save is download-based.** The app remembers filename + saved-baseline relationship, but does not claim native in-place filesystem write access.
- **External imagery availability varies.** Provider coverage, key requirements and imagery currency are external dependencies.
- **Device/geometry coverage is finite.** Automated golden and geometry suites are substantial but do not constitute exhaustive testing of every screen size, physical multi-touch device or possible geometric parameter combination.

#### Release gate evidence

Functional head `24171c685de4ed93bf254e618ea3e48a9558e81d`:

- Quality run: `36702892172` — success;
- Geometry/workspace regressions — pass;
- TypeScript — pass;
- Lint — pass;
- Next/Vercel + Sites/vinext builds — pass;
- Network browser acceptance + golden artifacts — pass;
- Vercel status — success.

Earlier audit-specific runs:

- 7A.1 file-session reload baseline: `36701877517` — success;
- 7A.2 rejected-file recovery: `36702325780` — success.

## Release decision

The engineering/product release audit is technically complete. The next step is **explicit user acceptance of the Product v1 release candidate**.

Until that decision:

- keep PR #1 Draft;
- do not merge into the production branch;
- do not begin Parallel / Frontage Road, advanced CAD-like editing or another major feature family.
