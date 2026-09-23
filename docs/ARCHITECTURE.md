# Architecture — Thai Street Designer

This document describes the current architecture on the `chatgpt/full-engineering-ui-audit` branch after the Slip lane schema-v6 refactor.

## 1. Architectural intent

The application has two separate geometric systems that must not be conflated:

1. **Base junction geometry**
   - arms
   - main incoming/outgoing lanes
   - generic auxiliary Pockets
   - median
   - sidewalks
   - intersection corner/junction mouth
   - crossings, stop lines and ordinary road markings

2. **Slip lane overlay geometry**
   - turning roadway
   - corner channelizing island
   - Slip-owned approach auxiliary
   - Slip-owned departure/acceleration treatment
   - Slip crossing and stop line
   - Slip arrow

A Slip is a connection between two arms. It is not an attribute of one road arm.

## 2. Data model

### Design

Schema v6 adds:

```ts
type Design = {
  // ...
  slips: SlipLane[]
}
```

The base `Arm` type does not contain runtime Slip fields.

### SlipLane

Owned by `app/junction/slip-model.ts`.

Conceptually:

```ts
type SlipLane = {
  id: string
  fromArm: number
  toArm: number
  width: number
  radius: number

  approach:
    | { mode: 'direct' }
    | {
        mode: 'auxiliary'
        width: number
        storage: number
        taper: number
      }

  departure:
    | { mode: 'direct' }
    | {
        mode: 'shared-aux'
        width: number
        length: number
        taper: number
      }
    | {
        mode: 'acceleration'
        width: number
        length: number
        merge: number
        separator: 'chevron' | 'raised'
        separatorWidth: number
      }

  crossing: {
    enabled: boolean
    offset: number
  }

  arrowOffset?: number
}
```

## 3. Base junction pipeline

`app/junction/geometry.ts` is intentionally Slip-agnostic.

Typical flow:

```
Design.arms
  ↓
section / pockets / median
  ↓
arm mouth + base corner
  ↓
edges(d)
  ↓
base road / sidewalk / marking geometry
```

### Invariant

For the same arm/road configuration:

```ts
edges(withSlip) === edges(withoutSlip)
```

This is a regression-tested architectural invariant, not merely a preferred implementation detail.

Changing these Slip parameters must not change base `edges(d)`:

- width
- radius
- approach treatment
- departure treatment
- acceleration length/merge
- crossing
- arrow position

## 4. Slip overlay pipeline

Owned by `app/junction/slip-geometry.ts`.

```
base Design + SlipLane
        ↓
read base arm/carriageway datums
        ↓
solve Slip entry/exit connection
        ↓
construct centerline and variable-width channel
        ↓
construct Slip pavement / sidewalk / island
        ↓
optional approach auxiliary
        ↓
optional shared departure or acceleration lane
        ↓
crossing / stop / arrow stationing
        ↓
SlipGeometry
```

The output is consumed by the renderer and interaction layers.

## 5. Variable-width channel

Slip width is not allowed to create an abrupt jump at the road connection.

The current model stores:

- requested Slip width
- entry connection width
- exit connection width
- a transition length along the Slip centerline

The channel width transitions smoothly:

```
connected entry width
  → requested Slip width
  → connected exit width
```

The transition exists entirely inside the Slip overlay; the base roadway is not widened or moved to satisfy Slip width.

Crossing and stop line use the width at their own centerline station. They are not assumed to share one constant width.

## 6. Treatment ownership

| Feature | Owner | Must not be stored as |
|---|---|---|
| Main incoming/outgoing lanes | `Arm` | Slip state |
| Generic turn/receiving Pocket | `Arm.incomingPockets/outgoingPockets` | Slip auxiliary |
| Slip turning roadway | `SlipLane` | `Arm.slip` |
| Slip approach auxiliary | `SlipLane.approach` | `incomingPockets.left` |
| Slip shared departure auxiliary | `SlipLane.departure` | `outgoingPockets.left` |
| Slip acceleration lane | `SlipLane.departure` | generic receiving Pocket |
| Slip crossing | `SlipLane.crossing` | `Arm.slipCrossing` |
| Slip arrow station | `SlipLane.arrowOffset` | main lane arrow override |

## 7. Rendering and interaction

All Slip consumers must derive from the same `SlipGeometry`.

- `drawing.tsx`: SVG overlay
- `selection.ts`: selectable geometry/hit shapes
- `object-layer.tsx`: Slip crossing/arrow drag handles
- `section-view.tsx`: Slip-owned cross-section pieces
- `scene3d.tsx`: raised channelizing/separator geometry
- `objects.ts`: roadside object exclusion near Slip
- `quick-properties.tsx`: edits `SlipLane`, not generic Pocket state

Do not duplicate Slip construction math in these files.

## 8. Validation

`geometry.ts::designError` validates the base road/intersection.

`slip-geometry.ts::slipDesignError` validates the overlay.

`design-validation.ts` composes both.

This separation prevents the Slip overlay from changing base-junction validity rules merely to make a rendering case pass.

## 9. Schema migration

The current schema is v6.

Legacy v5 Slip data was experimental and changed meaning multiple times. Migration therefore does not reinterpret all old fields.

The migration adapter:

- detects a legacy Slip on an arm
- determines the receiving active arm
- keeps width/radius
- creates a v6 `SlipLane`
- returns approach/departure/crossing to the clean baseline
- strips legacy runtime Slip properties from `Arm`

Legacy names are allowed only in `LegacyArmInput` and migration code.

## 10. Tests that protect the architecture

Primary files:

- `scripts/verify-junction.cjs`
- `scripts/verify-workspace.cjs`

Important invariants include:

- adding Slip leaves base edges identical
- removing Slip restores identical base geometry
- Slip approach auxiliary does not create a generic Pocket
- Slip departure/acceleration does not create a generic outgoing Pocket
- radius changes affect only the overlay
- direct/auxiliary/acceleration tangent widths match their connected treatment
- Slip width transitions stay in the overlay
- stop line uses local channel width at its own station
- schema v6 round-trips
- v5 migration is conservative

## 11. Anti-patterns

Do not:

- add `if (slip)` branches to `geometry.ts::edges()`
- clone an Arm and zero a Pocket merely to infer a Slip datum
- infer Slip mode from the presence of generic Pockets
- use `Arm.slip*` runtime fields
- make the base junction mouth depend on Slip radius
- move main-lane count at the junction mouth when enabling Slip
- let 2D, selection, cross-section or 3D calculate separate versions of Slip geometry
- reintroduce the previous experimental high-entry compound curve without a separately researched and validated geometric construction

## 12. Near-term acceptance work

The refactor is source-clean but still requires Preview visual/interaction acceptance after Vercel rate limiting clears.

Priorities:

1. bare Slip proportions and corner island
2. skewed junctions
3. wide/narrow roads
4. variable width
5. approach auxiliary
6. shared departure auxiliary
7. acceleration + chevron/raised separator
8. crossing/stop placement and drag
9. arrow placement and drag
10. cross-section and 3D consistency

If a visual problem is found, first determine whether the defect is in:

- `slip-geometry.ts` (geometry)
- the consumer (render/hit/3D/cross-section)
- or the UI state binding

Do not use base-junction mutations as a visual fix.


## 13. Network foundation

The application now has a project layer above the single-junction `Design v6` model.

```
NetworkProject
├─ JunctionInstance[]
│  └─ Design v6
└─ RoadLink[]
   └─ PortRef → PortRef
```

A Junction instance owns world placement (`x`, `y`, `rotation`) while the embedded Design remains local semantic geometry.

A Road Link owns the corridor between two semantic arm ports. Link endpoint coordinates are derived from `junctionId + armId`; they are not copied into a second independent geometry source.

Important invariants:

- moving a Junction instance must not mutate its Design
- rotating a Junction instance must not mutate its Design
- attached Link endpoints follow transformed ports automatically
- deleting a Junction removes its attached Links
- section mismatches are surfaced explicitly; the foundation does not invent a lane/median transition
- detailed Junction editing round-trips back into the Network project

The root application opens the Network workspace. The existing `/junction/` and `/roads/` routes remain available as detailed editing/laboratory surfaces while migration continues.

See `docs/NETWORK_FOUNDATION.md` for the ownership model, frontage-road boundary and roadmap.
