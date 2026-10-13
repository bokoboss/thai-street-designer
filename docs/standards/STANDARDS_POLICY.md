# Standards Policy

Source: adapted from `street-concept-designer/docs/standards/STANDARDS_POLICY.md` and `road-concept-builder/docs/THAI_STANDARDS_NOTES.md`. Complements `docs/ENGINEERING_DESIGN_BASIS.md`, which remains the function-by-function engineering basis.

## Goal

Support engineering guidance without falsely claiming compliance. This is a concept-design tool; output is not a construction-ready design or a certified signing-and-marking plan.

## Source hierarchy

1. Current requirements of the authority responsible for the project (DOH, DRR, BMA, local authority, concessionaire).
2. Thai law and regulation (for example ministerial regulations on traffic signs, markings and signals).
3. Thai agency manuals and standard drawings.
4. International guidance (Austroads, FHWA, others) adapted to left-hand traffic, used where Thai guidance does not cover the concept.
5. Tool defaults — always labelled as project assumptions.

"Thailand" is not one profile. Keep DOH, DRR and BMA/local contexts separate; never merge their values silently.

## Recording a standards-derived value

Before a value or rule is encoded as anything stronger than a default, record in `THAI_SOURCE_REGISTER.md` (or the relevant design-basis document):

- authority, document title and identifier;
- edition / revision and publication or effective date;
- page, table, figure or drawing number;
- applicability (road class, context, mandatory vs preferred vs typical);
- the extracted value or rule;
- implementation file path;
- verification status and date verified.

Check whether a newer document supersedes the source before encoding.

## Behavior in the product

- Advisory first: explain and cite. Block only geometry that is internally impossible.
- Allow explicit engineer override where a design is feasible but outside preferred guidance.
- A saved project keeps the interpretation it was created with; an application update must not silently change it. (Implement project-pinned profile versions when the first standards profile is introduced.)
- Construction/work-zone rules never feed permanent-design defaults.

## Prohibitions

- Do not label tool defaults, numeric safeguards or international references as Thai requirements.
- Do not invent page numbers, editions or values. If unverified, mark `TO_VERIFY`.
- Do not trace imagery whose provider terms prohibit digitizing.
