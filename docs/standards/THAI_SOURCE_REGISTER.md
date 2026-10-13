# Thai Source Register

Merged on 2026-10-13 from:
- `street-concept-designer/docs/standards/THAILAND_SOURCE_REGISTER.md` (research date 2026-08-25)
- `road-concept-builder/docs/THAI_STANDARDS_NOTES.md`
- existing references in `docs/ENGINEERING_DESIGN_BASIS.md`

**No entry below has been verified to page/table level yet.** URLs and statuses are carried over from earlier research and must be re-checked (availability, edition, supersession) before any value is extracted. Do not encode numeric rules from this register until an entry has page-level evidence recorded.

## Status values

| Status | Meaning |
| --- | --- |
| `PRIMARY` | Direct authority/source suitable for rule extraction after page-level verification |
| `SUPPORTING` | Authoritative context or specification; may be project/construction specific |
| `CONTEXT_ONLY` | Background or applicability; not a direct permanent-design rule source |
| `NEEDS_REVIEW` | Promising; edition and applicability not yet identified |

## Law / regulation

| Source | URL | Status | Use |
| --- | --- | --- | --- |
| กฎกระทรวงกำหนดการจัดทำ ปัก ติดตั้งป้ายจราจร เครื่องหมายจราจร หรือสัญญาณจราจร สำหรับการจราจรบนทางหลวง พ.ศ. 2563 | https://www.npdwebsite.net/knowledge/store_act/p1200620222701.pdf | `PRIMARY` (from RCB; mirror URL — locate an official gazette copy) | Legal taxonomy and meaning of signs, markings, signals: stop line, give-way line, crossing, arrows, lane control, roundabout |

## Department of Highways (DOH)

| Source | URL | Status | Use |
| --- | --- | --- | --- |
| Bureau of Highway Safety (organization page) | https://www.doh.go.th/org-structure/52 | `PRIMARY` for authority context only | Establish DOH as source authority; no values from this page |
| คู่มือมาตรฐานป้ายจราจร เล่มที่ 1 (มี.ค. 2561) | https://doh.go.th/uploads/tinymce/service/bid/doc_bid/manual1.pdf · alt: https://bhs.doh.go.th/files/standard_group/manual1.pdf | `PRIMARY` pending extraction | Sign families, shapes, colours, dimensions |
| คู่มือเครื่องหมายควบคุมการจราจร / เครื่องหมายจราจรบนผิวทาง | https://bhs.doh.go.th/files/standard_group/marking/Marking2.pdf | `NEEDS_REVIEW` (from RCB) | Longitudinal/transverse markings, arrows, symbols, pavement text |
| รายละเอียดและข้อกำหนดการจัดทำเครื่องหมายจราจรบนผิวทาง | https://bhs.doh.go.th/files/standard_group/marking/RoadMarking.pdf | `NEEDS_REVIEW` (from RCB) | Detailed marking specifications |
| มาตรฐานเครื่องหมายจราจร กรมทางหลวง | https://bhs.doh.go.th/sites/default/files/download/manual/%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B8%A3%E0%B8%90%E0%B8%B2%E0%B8%99%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B8%AB%E0%B8%A1%E0%B8%B2%E0%B8%A2%E0%B8%88%E0%B8%A3%E0%B8%B2%E0%B8%88%E0%B8%A3.pdf | `NEEDS_REVIEW` (from RCB) | Marking categories and visual reference |
| Design Guideline: Road Medians & Road Widening | https://bmm.doh.go.th/website/download/manual59/manual_pre_drawings.pdf | Used in `ENGINEERING_DESIGN_BASIS.md`; page refs to be recorded | Median width with turn lanes, U-turn planning ranges |
| DOH KM repository of sign/traffic-control manuals | https://network.doh.go.th/km-web/storage/km/articles/ | `SUPPORTING` index | Locate design/installation volume of sign manual |
| Traffic-control manual for construction areas | https://www.doh.go.th/content/download/174668 | `CONTEXT_ONLY` for permanent design | Work-zone profiles only; never permanent defaults |
| Traffic-engineering safety guidance (lighting, signals) | https://network.doh.go.th/km-web/storage/km/articles/EK1808000187-02-01.pdf | `NEEDS_REVIEW` | Lighting and signal sections |
| แนวทางการออกแบบและติดตั้งไฟฟ้าแสงสว่างบนทางหลวง ชนิดโคมไฟแอลอีดี (9 ม.ค. 2569) | https://bohse.doh.go.th/storage/news/attachments/2026/01/09/6960a0d81442e1767940312.pdf | `PRIMARY` after review | Lighting asset metadata; later advisory checks |

## Department of Rural Roads (DRR)

| Source | URL | Status | Use |
| --- | --- | --- | --- |
| คู่มือปรับปรุงกายภาพทางหลวงท้องถิ่นในเขตเมือง / road-safety knowledge PDF | https://localkc.drr.go.th/storage/knowledge/files/2021/08/24/612495266e6f61629787430.pdf | `NEEDS_REVIEW` (likely `PRIMARY` for DRR) | Urban local-road components: lanes, medians, islands, roundabouts, pedestrian facilities, markings, signals |
| DRR standard drawing set | https://localkc.drr.go.th/storage/knowledge/files/2021/08/24/612492e4b8f9b1629786852.pdf | `NEEDS_REVIEW` | Sign installation, markings, letters/numbers, rumble strips, delineation, guardrail |
| DRR 2568 procurement specification | https://eprocurement.drr.go.th/egp_2563/upload/2568/d/20250417155027_24263_D.pdf | `SUPPORTING` | Points to มทช.241 (thermoplastic marking) and signal criteria; resolve the underlying standard before use |

## Other Thai

| Source | URL | Status | Use |
| --- | --- | --- | --- |
| OTP traffic sign/marking/signal manuals | https://www.otp.go.th/post/view/2098 | Used in `ENGINEERING_DESIGN_BASIS.md`; edition to be recorded | Marking and signal manuals |

## Encoding policy by topic

| Topic | Earliest safe action |
| --- | --- |
| Lane/road geometry primitives | User-defined values; no Thai dependency |
| Pavement-marking shapes and dimensions | Parametric generators; defaults labelled `PROJECT_ASSUMPTION` until verified |
| Signs | Asset schema first; geometry only after page-level review |
| Signals | Semantic assembly only; no warrant or timing rules |
| Lighting | Asset metadata; checks deferred |
| Barriers | Generic objects first; jurisdiction dimensions later |
| Work zones | Separate profile; never permanent defaults |

## Terminology

See `docs/GLOSSARY.md`. Terms marked "verify" there must be checked against the source wording before being presented as official.
