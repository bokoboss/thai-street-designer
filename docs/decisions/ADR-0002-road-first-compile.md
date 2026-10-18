# ADR-0002 — Road-first authoring compiles to the existing engine

- Status: **Accepted** (owner decision, 2026-10-14)
- Date: 2026-10-13
- Context: [ADR-0001](ADR-0001-consolidation.md), roadmap Phase 1B, [spike report](../spikes/1B_ROAD_FIRST_SPIKE.md)

## Decision

1. The road-first model is an **authoring layer**. Roads (alignment + section), explicit junction decisions and leg-keyed treatments are the authored state. A pure compile step produces the existing `NetworkProject` (junction instances + RoadLinks), which remains the input to every renderer, review and export.
2. The junction geometry engine is **kept**, not replaced. No second geometry path is introduced.
3. All junction treatments that refer to an arm (Slip, pockets, lane markings/arrow overrides, roadside, median openings, signal/crossing flags) are stored against a **road leg** (`roadId` + `ahead|behind`) and re-bound to arm slots on compile.
4. Phase 2 adds to the model:
   - a **road end** node so roads can exist without a junction at each end (L1);
   - a **fit-based arm length rule** instead of the fixed 45 m minimum, with markings allowed to continue onto the RoadLink (L2);
   - **length-aware marking defaults** for short approach zones (L4).
5. Junctions remain limited to four legs (L3), documented as a known limit.

## Owner note (2026-10-14)

Road-first is the drawing layer. Detailed junction characteristics (corner treatment, approach details, markings) are tuned afterwards in the junction detail work, not as part of the road-first change.

## Consequences

- The fallback in ADR-0001 ("keep junctions as owned objects, change only creation") is **not needed**.
- Existing Design v6 / Network v1–v5 files migrate one way into roads + decisions (`core/road-first/migrate.ts`): each RoadLink chain plus its end arms becomes a road; each junction becomes a confirmed decision listing the roads that join it, with approach zones (arm length and any approach-specific section) and treatments keyed by leg. The golden suite (`scripts/verify-road-first-migration.cjs`) shows migrated files compile back to the same world-space geometry within 1 cm. Parallel corridor relationships are not carried yet and are reported.
- Direct arm angle/length editing in Junction detail becomes road editing in the new workspace (Phase 3 UI work).
- `core/road-first/derive.ts` is a prototype. It is kept as the reference for Phase 2 but must be rewritten with tests before it carries user data.

## Alternatives considered

- **Replace the junction engine with a road-derived one** (SCD style): rejected — the existing engine already handles curb returns, pockets, Slip and roundabouts that SCD's kernel lacks.
- **Keep network-first and only change creation gestures**: viable but leaves two editors for one road (arm + RoadLink) and the section convention split that users found confusing.
