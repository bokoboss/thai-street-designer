# Product v1 Release Audit

Updated: 2026-09-30  
Branch: `chatgpt/full-engineering-ui-audit`  
Status: **Final hardening in progress — no new feature family until this audit closes.**

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

## Remaining audit sequence

1. **7A.4 Release documentation / status cleanup**
   - update stale verification references;
   - record final Quality run and preview;
   - enumerate intentional Product v1 limitations.
2. **Release decision**
   - keep PR #1 Draft until the user explicitly accepts Product v1;
   - do not begin Parallel / Frontage Road or advanced CAD editing before that decision.
