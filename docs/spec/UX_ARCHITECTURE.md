# UX Architecture

Source: adapted from `street-concept-designer/docs/ux/` (UX_ARCHITECTURE, LOW_FIDELITY_WORKSPACE_SPEC, TOOL_TAXONOMY, UX_REVIEW_GATE) plus findings from the 2026-10-13 review of this application.

## Character

A calm, precise, compact engineering editor. Less intimidating than CAD. Not a dashboard, not a game editor.

## One workspace

There is one route and one shell. Junction detail, road editing, sections and 3D are views or focus states inside it, never separate pages with their own headers.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Project ▾   Scenario: Existing ▾   Undo Redo    2D | Split | 3D   Export │
├────────┬───────────────────────────────────────────────┬─────────────────┤
│ Tools  │                                               │ Inspector       │
│ Select │                                               │  selected object│
│ Pan    │               MAIN VIEWPORT                   │  key properties │
│ Road   │                                               │  ▸ advanced     │
│ Junct. │                                               │                 │
│ Mark   │                                               │                 │
│ Measure│                                               │                 │
├────────┴───────────────────────────────────────────────┴─────────────────┤
│ Section strip (contextual, for selected road / approach)                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Status: mode hint · snap · scale · issues count · Existing | Alt A | +   │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:** project and view level only (file, scenario, undo/redo, view mode, export). No object micro-tools.
- **Tool rail:** a small set of modes. Object-specific actions appear contextually next to the selection, not as permanent buttons.
- **Inspector:** contextual to the selected semantic object.
- **Section strip:** shown when a road or approach is selected.
- **Status bar:** current mode and what it expects next, snap state, scale, issues count, scenario strip. Network-wide summary lives here or in the Review panel, not at the top of every inspector.

## Interaction hierarchy

**Select → direct manipulation / quick edit → precise values in Inspector or section → review / compare / export**

Advanced controls are progressively disclosed. A new feature must not make selection, dragging or basic editing harder.

## Inspector layout (every object)

1. Header: object type and name (editable), scenario badge if relevant.
2. Key properties: 3–6 fields used most often for this object.
3. `Advanced ▸` collapsed: stations, lifecycles, overrides, provenance.
4. Object issues (if any), each clickable to focus.
5. Destructive actions last (Delete is never the first control).

## Copy rules (user-facing text)

- Write for a traffic engineer, not for a developer or an AI agent.
- Never show: phase or milestone numbers, schema versions, internal type names, "runtime", "resolver", "provenance", "semantic", "lifecycle" as jargon, branch/PR references.
- Use the terms in `docs/GLOSSARY.md`. One term per concept across the whole app.
- Thai is the primary UI language; engineering abbreviations in English are allowed where common in Thai practice.
- Explanations longer than one sentence belong in a help tooltip or documentation, not in the Inspector body.
- The concept-design disclaimer appears once (status bar / export), not repeated in panels.

## Modes and safety

- Select and Pan are explicit modes. Middle-drag / Space-drag may pan temporarily without changing the mode.
- The active mode and its expected next input are always visible in the status bar.
- Every tool explains failure: if a click does nothing, say why (for example "Click an arm end to start a connection").
- Esc cancels the current tool action consistently.
- Destructive actions require clear intent and are undoable as one step.
- Locked or reference layers are not selectable for editing unless their edit mode is active.

## Cross-section convention

One orientation everywhere. The section is drawn as seen **looking along the road's reference direction**, with direction-of-travel arrows on each lane. Approach sections near a junction use the same convention; the "incoming / outgoing" role is shown by arrows and labels, not by flipping the layout.

(This replaces the current two conventions: "left = incoming / right = outgoing" in Junction and "left = TO→FROM / right = FROM→TO" on RoadLinks.)

## Tool families

Keep the visible set small; everything else is contextual or in command search (Ctrl/Cmd+K).

| Family | Visible tools | Contextual actions |
| --- | --- | --- |
| Navigation | Select, Pan, Fit, Measure | Zoom to selection |
| Road | Draw Road | Apply preset, edit section, insert/remove alignment point, width transition, lane add/drop, turn pocket |
| Junction | (created from candidate) | Corners, lane connections, islands, crossings, stop/give-way lines, Slip, U-turn, roundabout conversion |
| Markings | Mark | Arrow, line, crossing, hatch, text, detach generated marking |
| Reference | (in Project menu) | Import image, calibrate, opacity, lock |
| Scenario | Scenario strip | Duplicate, rename, compare |

## UX review gate

Every interaction change is reviewed against a real task, not screenshots alone. Decision: PASS / PASS WITH CONDITIONS / REVISE / BLOCK.

1. **Task fit** — which golden workflow step does it serve? Is the normal path shorter than the manual escape hatch?
2. **State clarity** — can the user tell what is selected, which scenario is active, whether a value is authored or generated?
3. **Mode safety** — is the mode visible? Can navigation move geometry by accident?
4. **Direct + exact** — do drag and numeric entry change the same property?
5. **Copy** — does any user-facing text break the copy rules above?
6. **Measured** — for workflow-level changes, are action count and time recorded against `UX_BASELINE_RESULTS.md`?

BLOCK if the task requires knowledge of internals, if modes conflict, or if drag and numeric entry diverge.
