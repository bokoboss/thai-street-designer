# Phase 4C PR D — Manual lane connector overrides

Implementation baseline: main at \`cc92da29\` after PR #81. This document records the persisted data contract and acceptance limits; reference Issue #80.

## Ownership and persistence

\`Decision.treatments.connectors?\` stores an optional, bounded array of **authored differences** from the canonical automatic lane mapping. The old Road-first schema version remains unchanged because the field is optional and existing files do not gain it on open. Nothing stores a transient \`J-n\` identifier, arm slot or generated connector id.

Each record has:
- \`from: {leg: LegKey, role: 'main'|'aux-left'|'aux-right', laneIndex: number}\`
- \`movement: 'left'|'through'|'right'\`
- \`mode: 'replace'|'suppress'\`
- \`to\` with the same lane-reference shape, required only for \`replace\`

There is at most one record per source-lane + movement. \`reset\` removes the record, allowing generation again. \`suppress\` removes the generated mapping for that source/movement, but does not delete the lane or markings. \`replace\` selects a receiving lane by stable road-leg reference.

\`connectorOverrideError\` validates record shape, finite integer lane indices, allowed roles/movements and duplicates on file open or command commit. Semantic checks (source/receiver existence, arrows, movement classification, Slip-owned left turn and same-approach receiver conflict) run against the current compiled junction using the PR C geometry resolver. An invalid *new* command is refused atomically. A previously authored entry that becomes invalid after a road edit remains stored and is shown for review and explicit reset. No lane geometry is changed on invalid data.

## Rebinding and editor lifecycle

- Road reverse, split and join remap **both** source and target \`LegKey\` using each existing transformation; no lane-index guessing is performed.
- \`captureTreatments\` and the Advanced Junction editor roundtrip preserve connector overrides; the advanced editor does not own this field.
- The typed command layer controls set, suppress and reset. Each completed command is one Undo/Redo step.
- The Inspector allows the user to select a receiving lane from compatible candidate legs, suppress an individual connection, see manual/review status, and reset individual overrides. Standard plan geometry is unchanged.

## Engineering scope

A connection represents an **abstract lane pairing**, not a curved vehicle trajectory. It must not be exported as a certified swept path, simulated flow, conflict-free movement or capacity/LOS result. The Thai left-hand traffic bearing classification is a \`TO_VERIFY\` heuristic. Existing Slip geometry remains separately owned by the Slip engine. Roundabout circulation and physical U-turn paths remain out of scope.

PR D changes are consumed by the Inspector and the plan review overlay. On a selected junction, the user can opt in to schematic 2D line pairings, click a connection, click a compatible receiving lane, and Confirm or Cancel (Esc). The same typed command commits changes. The 3D review uses the same derived world-space anchors and displayed lane pairing, offset above the junction surface as engineering review artwork; it is not baked into the road-marking texture. The report PNG/SVG export excludes the connector editor overlay. Generated/manual state is differentiated by dashed line colour and unresolved overrides remain listed for review. No curved swept path or second pavement geometry model is introduced.

## Acceptance gates

Run all existing regression scripts plus \`verify-manual-lane-connectors.cjs\`, TypeScript, Lint, Production Build and Browser Acceptance. New tests cover set/suppress/reset, arrows, Slip invariant, stale references and schema roundtrip, command atomicity, undo/redo and advanced editor capture. Existing road-transform regressions remain mandatory.

Changes are merged only when GitHub Actions \`test-and-build\` and Vercel pass for the same latest commit. Do not infer real-world engineering correctness from a green build alone.
