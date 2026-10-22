# Level criteria (before Phase 4B-3)

Owner request 2026-10-22: settle how high bridges go, how deep underpasses go and how steep ramps are before the
diamond template, because they set ramp lengths and footprints.

## Model

`options.levels` on the road-first project: per criterion `{value, source?}`.

| Key | Meaning | Tool starting value |
| --- | --- | --- |
| `clearance` | vertical clearance under a structure (m) | 5.0 |
| `deckDepth` | bridge structure depth incl. deck and surfacing (m) | 1.5 |
| `tunnelRoof` | tunnel roof incl. surfacing of the road above (m) | 1.5 |
| `mainGrade` | maximum grade, main roads (%) | 4 |
| `rampGrade` | maximum grade, ramps (%) | 5 |

Starting values are **tool values, not standards**; a criterion without a source is shown `TO_VERIFY`. The engineer
enters the project's values and their source (manual, edition, page) in the project panel.

Derived: bridge rise = clearance + deck depth; tunnel depth = clearance + tunnel roof; level 2 ≈ 2 × bridge rise;
straight ramp length = height ÷ grade (vertical curves not included).

Used by: bridge / underpass commands (crossing, junction and road panels), drawing presets (ground, level 1, level 2,
underpass), compile checks (gap below the criterion; grade above the maximum — "ต้องตรวจตามเกณฑ์", never "ผ่าน"),
long-section grade labels (orange when steeper).

## Sources found 2026-10-22 (foreign; for orientation only)

| Topic | Value | Source |
| --- | --- | --- |
| Vertical clearance | ≥ 4.5 m | UNESCAP Asian Highway design standards, Annex I §3(h) — https://www.unescap.org/sites/default/files/pub_2173_ah_annexes.pdf |
| Max grade by terrain | 4 / 5 / 6 / 7 % (level / rolling / mountain / steep) | same, Table 9 |
| Interstate clearance | 16 ft (4.9 m) | https://en.wikipedia.org/wiki/Interstate_Highway_standards (secondary) |
| Clearance incl. resurfacing | 16.5 ft incl. 0.5 ft | TxDOT Roadway Design Manual 4.8.6 — https://www.txdot.gov/manuals/des/rdw/chapter-4--basic-design-criteria/4-8-vertical-alignment/4-8-6-vertical-clearance.html |
| Ramp max upgrade by ramp design speed | 45–50 mph 3–5 %; 35–40 4–6 %; 25–30 5–7 %; 15–25 6–8 %; trucks ≤ 5 % | NJDOT Roadway Design Manual §7.5.4 Table 7-1 (from AASHTO) — https://www.nj.gov/transportation/eng/documents/BDC/pdf/RDM-Sec7-rev20081117.pdf |
| Steel girder depth incl. deck | 0.040 L simple, 0.032 L continuous | AASHTO LRFD Table 2.5.2.6.3-1 as quoted in WisDOT Bridge Manual Ch. 24 — https://wisconsindot.gov/dtsdManuals/strct/manuals/bridge/ch24.pdf |
| Thai large passenger vehicle height | ≤ 4.0 m for new registrations (was 4.30 m) | Thai PBS 2017-04-25 on the Department of Land Transport rule — https://www.thaipbs.or.th/news/content/261901 |

Not found / `TO_VERIFY`: DOH / EXAT / BMA vertical clearance and maximum grades; concrete girder depths; tunnel roof
thickness. A 5.50 m figure circulates for Thai overpasses but only from a non-authoritative page; not used.
