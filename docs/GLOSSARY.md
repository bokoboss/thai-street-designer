# Glossary — Thai / English

Sources: `street-concept-designer/docs/product/DOMAIN_GLOSSARY.md`, terminology table in `road-concept-builder/docs/THAI_STANDARDS_NOTES.md`, and labels currently used in this application.

Rules:
- One concept → one Thai UI term → one English term across the whole app. Code names may differ, meaning may not.
- Terms marked **verify** must be checked against the wording of the cited Thai source before being presented as official terminology.
- Developer-only concepts (schema, resolver, provenance, lifecycle as an implementation term) do not appear in the UI. See copy rules in `docs/spec/UX_ARCHITECTURE.md`.

## Project and scenario

| UI (Thai) | English | Meaning |
| --- | --- | --- |
| โครงการ | Project | Saved design document: scenarios, reference context, settings |
| ทางเลือก | Scenario / Alternative | One design alternative. "สภาพเดิม" (Existing) and "ทางเลือก A, B…" |
| สภาพเดิม | Existing | Scenario representing current conditions |
| ชั้นอ้างอิง | Reference layer | Map, aerial or site-plan image used for context; never engineering truth |
| ปรับมาตราส่วนภาพ | Calibrate image | Set image scale from a known A–B distance |

## Roads and sections

| UI (Thai) | English | Meaning |
| --- | --- | --- |
| ถนน | Road | Longitudinal facility with an alignment and a cross-section |
| แนวถนน | Alignment | Reference line used for stationing; made of straights, arcs and smooth curves |
| ระยะทาง (สถานี) | Station | Distance along the alignment in metres; display as 0+120 |
| หน้าตัดถนน | Cross-section | Ordered components across the road at a station |
| องค์ประกอบหน้าตัด | Section component | Lane, median, shoulder, bicycle lane, motorcycle lane, separator, sidewalk |
| ช่องจราจร | Traffic lane | Use "ช่องจราจร" in formal output; "เลน" acceptable in compact UI |
| เกาะกลาง | Median | Raised or painted separator between directions — state which type |
| เกาะกลางยก / เกาะสี | Raised / painted median | |
| ไหล่ทาง | Shoulder | |
| ทางเท้า | Sidewalk | |
| เลนจักรยาน | Bicycle lane | |
| เลนรถจักรยานยนต์ | Motorcycle lane | |
| แถบคั่น | Separator / buffer | |
| แบบหน้าตัดสำเร็จรูป | Section preset | Starting configuration; becomes ordinary editable components |
| ขยายผิวทาง / ลดผิวทาง | Widening / narrowing | Width change along station |
| เพิ่มช่องจราจร / ลดช่องจราจร | Lane add / lane drop | |
| ช่วงเปลี่ยนความกว้าง (taper) | Taper | Longitudinal width transition |
| ความยาวช่องจอดรอ (storage) | Storage length | Full-width length of a turn lane |

## Junctions

| UI (Thai) | English | Meaning |
| --- | --- | --- |
| ทางแยก | Junction / intersection | Confirmed connection between roads |
| ทางแยกที่เสนอ | Candidate junction | Shown when roads cross or meet; needs confirmation (สร้างทางแยก / ทางต่างระดับ / ไม่สนใจ) |
| ขาทางแยก | Approach (arm) | The end portion of a road at a junction. **Use this term only**; replaces both "ขาถนน" and "แขนทางแยก" currently mixed in the UI |
| ขาเข้าแยก / ขาออกจากแยก | Incoming / outgoing direction | Role of a direction at a junction |
| ปากแยก | Junction mouth | Where an approach meets the junction area |
| มุมทางแยก / รัศมีขอบทาง | Corner / corner radius | Per-corner curb return |
| ช่องเลี้ยวขวา / ช่องเลี้ยวซ้าย | Right-turn / left-turn pocket | Turn lane created by a lane add with taper + storage |
| ช่องรับรถ | Receiving lane | Added lane on the outgoing side |
| ช่องเลี้ยวซ้ายผ่านตลอด | Free-left slip lane | **verify** agency usage ("ช่องเลี้ยวซ้ายแยก" also seen) |
| เกาะนำทาง / เกาะแบ่งช่องทาง | Channelizing island | **verify** |
| ช่องเปิดเกาะกลาง | Median opening | |
| ช่องกลับรถ | U-turn opening | |
| ช่องรอกลับรถ | U-turn pocket | Project term — **verify** agency term |
| วงเวียน | Roundabout | |
| การเชื่อมช่องจราจร | Lane connection | From-lane → to-lane through a junction, with a movement |
| ทิศทางการเคลื่อนที่ | Movement | ตรง / เลี้ยวซ้าย / เลี้ยวขวา / กลับรถ — defined by travel direction, never screen left/right |

## Markings and control

| UI (Thai) | English | Notes |
| --- | --- | --- |
| เครื่องหมายจราจรบนผิวทาง | Pavement marking | Source wording varies (บนพื้นทาง / บนผิวทาง) — follow the cited source |
| เส้นแบ่งช่องจราจร | Lane line | Same-direction separator |
| เส้นแบ่งทิศทางจราจร | Direction separation (centre) line | Opposing-direction separator |
| เส้นขอบทาง | Edge line | |
| เส้นห้ามเปลี่ยนช่องจราจร | No-lane-change line | **verify** |
| เส้นหยุด | Stop line | |
| เส้นให้ทาง | Give-way line | |
| ทางข้าม | Pedestrian crossing | |
| ลูกศรบนผิวทาง | Lane-use arrow | |
| พื้นที่ตีเส้นทแยง | Hatched area | **verify** |
| สัญญาณไฟจราจร | Traffic signal | Symbol/assembly only; no timing |

## Review

| UI (Thai) | English | Meaning |
| --- | --- | --- |
| ข้อผิดพลาดเรขาคณิต | Geometry error | Geometry cannot be built; edit is rejected |
| ข้อควรตรวจสอบ | Engineering warning | Drawable but needs review/inputs; advisory |
| หมายเหตุ | Note | Assumption or context |
| ค่าตั้งต้นของเครื่องมือ | Tool default (project assumption) | Never presented as a standard |
