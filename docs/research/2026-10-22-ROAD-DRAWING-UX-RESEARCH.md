> Deep research by ChatGPT (owner-requested), 2026-10-22: road drawing and editing UX from games, simulators and design tools, with a review of TSD.
> The researcher's citations were tool tokens without URLs and were removed; claims about other products are **ยังไม่ยืนยัน** here until re-checked against their sources.
> Its TSD review was a static audit (code, screenshots, specs), not a live test.
>
> **Checked against the code on 2026-10-22 (Claude):**
> - Ramp attachment matrix (diverge/merge × both sides × mainline drawn either way, plus wrong-side refusal): all 8 valid cases attach on the correct side, the wrong side is refused. Added as a regression in `scripts/verify-ramps.cjs`. The report's pre-template risk is closed.
> - Snap angles every 15° from the axes and from the previous segment: confirmed (`core/road-first/snap.ts`).
> - Profile point hit target 9 px (smaller than plan handles): confirmed (`app/design/profile-strip.tsx`).
> - Breakpoints: the report says one; there are two (≤ 900 px drawer, ≤ 600 px phone bottom sheet, PR #38). Toast is `white-space: nowrap`: confirmed.
> - Backspace deletes the selected road (and the picked point) in Select: confirmed; the report's "Delete primary, Backspace = step back" rule is adopted in the plan.
> - No P1 found by the report; none found in this check.
> - Decisions taken into the roadmap: see `docs/CONSOLIDATION_ROADMAP.md` Phase 4B (4B-2b quick wins before the template; editing hub after 4B-3; range replace in 4C).

# งานวิจัย UX การวาดและแก้โครงข่ายถนนสำหรับ Thai Street Designer

## ขอบเขต หลักฐาน และข้อจำกัดของการประเมิน

รายงานนี้ใช้สถานะ **Thai Street Designer (TSD) ณ 22 ตุลาคม 2569 / 2026** เป็นฐาน และอ่านเอกสารรอบก่อนก่อนทำข้อเสนอ เพื่อไม่เสนอสิ่งที่มีอยู่แล้วซ้ำโดยไม่จำเป็น โดยเฉพาะ `2026-10-21-GAME-UX-INTERCHANGE-RESEARCH.md`, Phase 4 ใน roadmap, Phase 4A/4B-1/4B-2, UX Architecture และ Golden Workflows. เอกสารรอบก่อนเองระบุชัดว่าลิงก์อ้างอิงโปรแกรมภายนอกที่เคยมากับรายงานถูกนำออก จึงไม่ควรนำข้อเท็จจริงจากรายงานนั้นไปอ้างต่อโดยไม่ตรวจแหล่งต้นทางใหม่; รอบนี้จึงตรวจซ้ำกับคู่มือผู้ผลิต หน้า Steam/Workshop ของผู้พัฒนาหรือผู้สร้าง mod และเอกสารทางการที่ยังเข้าถึงได้ 

Golden Workflows ที่ใช้จัดลำดับคือ GW-01 ทางเข้าโครงการ, GW-02 ทางแยก, GW-03 ขยายถนน, GW-04 median opening/U-turn, GW-05 urban street และ GW-06 presentation; หลักการผลิตภัณฑ์ปัจจุบันกำหนดไว้ดีแล้วว่า 2D เป็น authoring surface หลัก, direct manipulation กับ numeric input ต้องแก้ property เดียวกัน และหนึ่ง gesture ควรเป็นหนึ่ง undo step.  UX Architecture ยังระบุเป้าหมายที่สำคัญมากสำหรับงานนี้ว่าเครื่องมือต้อง “calm, precise, compact”, progressive disclosure, มี Select/Pan ชัดเจน, Esc ยกเลิกอย่างสม่ำเสมอ และอนาคตควรมี command search โดยไม่เปลี่ยน TSD ให้กลายเป็น CAD command-line เต็มรูปแบบ. 

**ข้อจำกัดสำคัญของส่วนรีวิว TSD:** สภาพแวดล้อมวิจัยครั้งนี้ไม่สามารถควบคุมเว็บ `thai-street-designer.vercel.app/design` แบบ interactive ได้ และ Browser connector ไม่พร้อมใช้งาน จึง **ไม่อ้างว่าได้ทำ live gesture test จริง**. การประเมินส่วนที่สองเป็น static acceptance audit จาก (1) ภาพใน `screens/` ที่แนบมา (2) โค้ด branch `main` ปัจจุบัน และ (3) acceptance/spec ใน repository. ดังนั้นคำว่า “ใช้ได้ดี” ด้านล่างหมายถึง “เส้นทางการทำงานมีหลักฐานตรงกันทั้งภาพ/โค้ด/spec และไม่พบความขัดแย้ง” ไม่ใช่ผลจาก usability test กับผู้ใช้จริง

นอกจากนี้ Traffic Architect **ยังไม่ออกตัวเต็มในวันที่ 22 ตุลาคม 2026** โดย Steam กำหนด 3 พฤศจิกายน 2026 และมีเพียง demo; Trafficity กำหนด 16 พฤศจิกายน 2026 และยังไม่เปิดขายเช่นกัน ดังนั้นรายงานนี้ไม่ใช้ข้อมูลของสองรายการเป็นหลักฐาน “ตัวเต็มหลังวางจำหน่าย”. 

## ผลรีวิว TSD ปัจจุบัน

### ภาพรวมความสามารถที่มีแล้ว

ข้อสรุปโดยรวมคือ **ฐาน interaction ของ TSD แข็งแรงกว่าที่ควรรีบเปลี่ยนใหม่อย่างมาก**. วงจรหลัก `วาด → preview → feedback → commit → direct edit → numeric edit → undo` มีอยู่แล้ว และบางส่วนดีกว่าเกมทั่วไปตรงที่ผลการแก้เชื่อมกับ semantic model, profile และ 3D ชุดเดียวกัน. Phase 4 ยังตั้งหลักถูกต้องว่า template ต้องสร้างจาก ordinary editable ramps/anchors/profiles ไม่ใช่ opaque interchange object. 

สิ่งที่ยังขาดจึงไม่ใช่ “road drawing ใหม่ทั้งระบบ” แต่เป็น **editing vocabulary รอบของเดิม** ได้แก่ multi-selection, geometric guides ที่อ้างอิงวัตถุอื่น, move/align/parallel/straighten หลังวาด, selected-stretch operations, preview footprint และ touch/mobile refinement.

| ความสามารถ TSD ปัจจุบัน | ผลตรวจ | หลักฐาน/เส้นทางที่ตรวจ | จุดสะดุดและเทียบกับ reference ที่ดีที่สุด | ข้อเสนอ / ความรุนแรง |
|---|---|---|---|---|
| วาดถนนคลิกทีละจุด, Enter/double-click จบ, Backspace/right-click ย้อน, Esc ยกเลิก | **ใช้ได้ดี** จาก static audit | `app/design/page.tsx` ส่วน `finishDraft`, `draftBack`, `onKey`; `design-canvas.tsx` pointer/double-click/context-menu; hint บอก interaction ครบ.  | flow สั้นและใกล้ C:S II/NIMBY Rails แล้ว; C:S II ก็ใช้ right-click ยกเลิกขั้นการก่อสร้างทีละขั้น.  | **คงของเดิม**. เพิ่ม visible Finish/Back หน้าจอสัมผัสแทนการเปลี่ยน mouse grammar. **P3 desktop / P2 touch** |
| snap ปลายถนน/แนวถนน/มุม + Shift ปิด + typed length | **ใช้ได้ดี แต่ discoverability ยังไม่เต็ม** | `core/road-first/snap.ts`: priority end → road → angle; hit radius คงขนาดเป็น screen pixels; angle จริงรองรับทุก 15° จากแกนและจากแนวก่อนหน้า ไม่ใช่แค่ 0°/ต่อแนว.  | จุดอ่อนคือผู้ใช้เห็น guideline แต่ไม่รู้ชัดว่า “กำลังติดอะไร/เหตุใด”; AutoCAD Object Snap Tracking แสดง alignment path/marker/tooltip และใช้จุดอ้างอิงที่ acquire ไว้ได้ จึงทรงพลังกว่าสำหรับ perpendicular/parallel/extension.  | เพิ่ม snap badge ใกล้ cursor เช่น `ปลาย`, `แนวถนน`, `ต่อแนว`, `15°`; `Tab` วน candidate; เพิ่ม tracking guide ภายหลัง. **P2** |
| preview สีส้ม/แดงพร้อมเหตุผลก่อน commit | **ใช้ได้ดีมาก** | `design-canvas.tsx` สร้าง command preview ด้วย `checkDraft`, error=แดง, warning=ส้ม และ HUD แสดงเหตุผล; เห็นตรงกับ `screens/02-draft-preview-check.png`.  | นี่เป็นจุดแข็งระดับเดียวกับ pattern game-style ที่ดี. สิ่งที่ยังไม่มีคือ **พื้นที่ผลกระทบ/clearance footprint** ไม่ใช่แค่ centerline | รักษาระบบเดิม แล้วเพิ่ม ghost footprint สำหรับ ramp/template/structure โดยใช้สีเดียวกับ validation. **P2 ก่อน 4B-3** |
| ถนนตัดกันเป็น junction อัตโนมัติ + Undo + grade separation; วาดจากปลายเป็นถนนเดิม; join ปลายชนกัน | **ใช้ได้ดี แต่ Join หาเจอยากกว่า Extend** | `page.tsx` continuation จาก end snap; toast มี Undo/grade separation; `commands.ts` มี `road.join` พร้อม descriptive undo; `design-canvas.tsx` แสดง marker ของสองปลายที่ชนกัน.  | auto junction ดีกว่า editor ที่บังคับ node workflow. แต่ join ต้องเลือกก่อนแล้วไปหา action; SUMO ใช้ right-click operations และมี Join Selected Junctions ทำให้ topology command อยู่ใกล้วัตถุมากกว่า.  | เพิ่ม context menu บน endpoint marker: `เชื่อมเป็นถนนเดียว`, `แยกถนน`, `กลับทิศ`. **P3 สำหรับ join; P2 สำหรับ editing vocabulary โดยรวม** |
| ลากจุด, double-click เพิ่มจุด, radius typed/drag, sharp corner, delete point | **ใช้ได้ แต่สะดุดเมื่อ geometry ซับซ้อน** | plan handle มี invisible hit target ~14 screen px; radius handle ~13 px; `road.movePoint/insertPoint/removePoint/setPointRadius` เป็น commands ที่ undo ได้.  ภาพ `screens/03-curve-radius.png` ยืนยัน UI radius handle | TSD เป็น “vertex + fillet radius” ซึ่งง่ายมาก แต่ยังไม่มี constrained tangent relationships. Civil 3D แยก fixed/free/floating entities และคง tangency เมื่อแก้ element ที่มี constraint; Network Multitool มี smooth connection/straight-curve-straight.  | **ไม่เปลี่ยน primary editor เป็น Civil 3D**. เพิ่มคำสั่ง contextual `เชื่อมด้วยโค้งสัมผัส` และ `ทำช่วงนี้ให้ตรง`; full constraint graph รอได้. **P2** |
| preset/section; จำนวนช่อง, width, median, sidewalk/bands; section strip | **ใช้ได้ดีในระดับ concept** | model มี `road.setSection`; section strip อ่าน road เดียวกับ plan; Golden Workflows ใช้ preset และ section เป็นแกน.  | สิ่งที่ขาดเมื่อเทียบ C:S II Replace/Road Builder คือ “เปลี่ยนเฉพาะช่วงที่เลือก” และ batch edit; C:S II มี Replace tool ส่วน Road Builder mod แก้ custom road หรือ use existing road as template ได้.  | อย่ารีบสร้าง ad-hoc split-section ก่อน lane runs 4C. ออกแบบ selected road-range abstraction ตอน 4C แล้วให้ upgrade/replace ใช้ abstraction เดียวกัน. **P3 ตอนนี้ / สำคัญใน GW-03** |
| project access, mid-block median opening, U-turn | **ใช้ได้ดีตามหลักฐาน static** | Roadmap ระบุ Phase 4 closure items เหล่านี้เสร็จแล้ว; Golden Workflows GW-01/GW-04 ใช้โดยตรง.  ภาพ `screens/08-midblock-opening.png` แสดง opening + section | ไม่พบ reference ภายนอกที่ให้ interaction ที่ดีกว่าอย่างชัดเจนโดยไม่ลด semantic engineering model | **ไม่ควรเปลี่ยน grammar**; ให้ได้ประโยชน์จาก multi-select/measure/snap guides ทั่วระบบภายหลัง. **P3** |
| ramp one-way diverge/merge, anchor slide/detach | **ใช้ได้แต่ยังต้องยืนยัน matrix ทุกด้าน** | spec รองรับ `anchors.start` diverge / `anchors.end` merge, station+side, follow mainline, slide/detach, validation และ red reason; `screens/04-ramp-diverge.png` ยืนยัน diverge อย่างน้อยหนึ่งด้าน.  | data model ถูกทาง แต่ภาพที่มีไม่ยืนยันครบ **diverge/merge × สองฝั่งของถนน 4 ช่อง**. NIMBY Rails ให้ control point + blueprint edit ที่เห็น state ก่อน build ชัดมาก ซึ่งควรเอาแนว “editable ghost” มาเสริม ไม่ใช่เปลี่ยน topology model.  | ก่อน diamond ต้องมี automated/browser acceptance matrix 4 กรณี + direction arrows ที่ anchor + ghost taper/footprint. **P2**; ถ้าพบ attach ผิดฝั่งจริงให้ยกเป็น **P1** |
| PageUp/PageDown level, cursor grade, profile strip, bridge/trough/tunnel, stacked levels | **ใช้ได้ดี แต่ profile editor ยังเป็น MVP** | `PHASE_4B_LEVELS` ระบุ per-point level, inherited connection level, cursor grade, profile drag/numeric; `profile-strip.tsx` รองรับ drag station/z, double-click add/remove; `screens/05–07` แสดง profile/grade separation/3D.  | จุดแข็งคือ plan/profile/3D ใช้ state เดียวกัน. จุดอ่อนคือ vertical profile ยัง piecewise-linear ไม่มี vertical curves; criteria ยังไม่ใช่มาตรฐาน. Civil 3D รองรับ vertical curves และ constrained grips แต่เกิน concept scopeของ TSD ส่วนใหญ่.  | เพิ่ม **grade guide + warning**, label declutter, exact station/z HUD ก่อน; vertical curve แบบง่ายค่อยพิจารณาหลัง 4B-3. เกณฑ์ทุกค่าคง `TO_VERIFY`. **P2/P3** |
| 2D/3D state เดียวกัน, named undo/redo, Z focus, map/reference | **ใช้ได้ดี** | 2D ส่ง `ed.compiled.project` ชุดเดียวกับ 3D; Undo button แสดง `ed.undoText`; Z focus selection; reference/map อยู่ใน workspace เดียว.  | architecture ถูกทางมาก. จุดที่ด้อยกว่า editor mature คือ multi-object selection/transform และ touch input | คง architecture; เพิ่ม capability รอบ Select tool แทนสร้าง mode/page ใหม่. **P2 สำหรับ multi-select; P3 ที่เหลือ** |

### การทดลองกรณีบังคับจากโจทย์

เนื่องจาก live UI ใช้งานจากสภาพแวดล้อมนี้ไม่ได้ ตารางนี้แยกชัดระหว่าง **สิ่งที่ยืนยันด้วย code/image** กับสิ่งที่ต้องทำ browser acceptance เพิ่ม

| กรณี | ผล static acceptance audit | ความเสี่ยงที่พบ | ลำดับ |
|---|---|---|---|
| ถนนยาวหลายจุด → ใส่โค้ง → แก้จุดกลาง | **เส้นทางคำสั่งครบ**: move middle point, radius drag/type, delete/insert point เป็น command แยกและ gesture ถูก group เป็น undo step.  | การย้าย vertex ไม่ได้มี tangent constraint; roadmap ยังระบุว่าการตรวจ crossing ใน arc อาศัยเส้นตรงระหว่าง control points อยู่ จึงควรแจ้งสถานะนี้ให้ชัด.  | **P2** |
| ต่อจากปลาย → join สองเส้น → delete point | **รองรับครบใน model/code**; continuation เป็น road เดิม, `road.join`, `road.removePoint` มี descriptive undo.  | join discoverability มากกว่าความถูกต้อง; context menu จะลดขั้นตอน | **P3** |
| ramp diverge + merge บนถนน 4 ช่อง ทั้งสองฝั่ง | **core model รองรับ แต่ยังยืนยันไม่ครบจากภาพ**; spec มี side/direction checks.  | ต้องทดสอบ four-case matrix จริง โดยเฉพาะ direction reversal และหลัง move mainline | **P2 verification gate ก่อน template** |
| ยกระดับข้ามถนน → แก้ profile | **มีหลักฐานครบจาก spec/code/screens**: different levels auto-separate; profile points drag/add/remove; 3D follows z.  | label ชนกันได้เมื่อ crossings/PVIs หนาแน่น; ไม่มี max-grade rule sourced; vertical curves ยังไม่มี | **P2 label/feedback; ไม่ใช่ P1** |
| zoom เข้า/ออกมาก → เลือก/ลาก handle | **plan handles ออกแบบมาดี**: road hit-path และ invisible handle radii คำนวณเป็น screen pixel จึงไม่หดตาม world zoom.  | profile point target ~9 px เล็กกว่า plan; dense points ยังทับกันได้ | **P3 desktop / P2 touch** |
| ≤900 px และโทรศัพท์ | **มี responsive foundation แต่ยังสะดุด**: ≤900px เปลี่ยน inspector เป็น off-canvas drawer และซ่อน label หลายส่วน.  | จาก CSS ที่ตรวจ มี breakpoint หลักเดียว; top actions ยังจำนวนมาก, toast ใช้ `white-space: nowrap`, HUD/profile อาจกิน canvas มากบนโทรศัพท์. นี่เป็น risk จาก static layout ไม่ใช่ผล live test | **P2** |

**P1 ที่ยืนยันได้จากหลักฐานรอบนี้: ไม่มี**. ไม่ควรสร้าง P1 ขึ้นเพียงเพราะยังทดสอบ live ไม่ได้ แต่ก่อน 4B-3 ควรถือ ramp attachment matrix และ grade-separated template placement เป็น release gate เพราะถ้าพบ topology ผิดจะเป็น P1 ทันที

## บทเรียนจากเครื่องมืออื่นและความสามารถที่ควรนำมาใช้

ภาพรวมจากโปรแกรมที่ตรวจได้ชี้ไปในทิศเดียวกัน: สิ่งที่ทำให้ editor “เร็ว” ไม่ใช่การมีเครื่องมือจำนวนมาก แต่เป็น **การใช้วัตถุเดิมเป็น reference แล้วสร้าง constraint/guide ชั่วคราว**, **preview ก่อน commit**, และ **แก้หลายวัตถุหลังวาดได้โดยไม่ต้องรื้อแล้ววาดใหม่**.

Cities: Skylines II เป็นตัวอย่างของ construction grammar ที่สั้น: Grid ใช้สามคลิก, Parallel วางเครือข่ายสองเส้นตามระยะกำหนด, Replace แก้ถนนเดิม, road guides แสดง slope number, crossing สร้าง intersection อัตโนมัติ และ elevation เดียวกันสร้าง cut/elevated/tunnel.  หลักฐาน patch ปี 2026 ที่เกี่ยวกับ UX ยังแสดงแนวคิด QoL ว่า parameter ของเครื่องมือที่สัมพันธ์กัน เช่น elevation ควรถูก carry over แทน reset ทุกครั้ง. 

อีกด้านหนึ่ง AutoCAD/Civil 3D แสดง pattern ที่เกมไม่มีครบ: object-snap tracking สร้าง alignment paths จาก reference point, dynamic input อยู่ใกล้ cursor, polyline สลับ line/arc ได้หลายวิธี และ Civil 3D ใช้ fixed/free/floating alignment elements เพื่อรักษา tangency ตาม constraint.  TSD ไม่ควรคัดลอกทั้งหมด แต่ควรนำ “guide + constrained operation” มาเป็น command ระดับสูงไม่กี่ตัว

### ตารางความสามารถที่ควรพิจารณา

คำว่า **เล็ก/กลาง/ใหญ่** ในตารางเป็นขนาดงานสัมพัทธ์กับ architecture ปัจจุบัน ไม่ใช่ประมาณการเวลา

| ความสามารถ | โปรแกรมและหลักฐาน | ทำงานอย่างไรโดยย่อ | TSD ปัจจุบัน | ข้อเสนอ | ขนาด | Workflow |
|---|---|---|---|---|---|---|
| **Snap label + candidate cycling** | AutoCAD Object Snap Tracking/Dynamic Input แสดง marker, tooltip, alignment path และ numeric input ใกล้ cursor.  | บอกชนิด snap ชัด และเมื่อ targets ซ้อนกันให้เลือก candidate | มี geometry snap แล้ว แต่ชนิด snap บางส่วน implicit | **นำมาใช้ตรง ๆ ในรูปแบบง่าย**: badge + `Tab` | เล็ก | GW-01–05 |
| **Extension / perpendicular / parallel tracking** | AutoCAD tracking ใช้ acquired snap point สร้าง horizontal/vertical/parallel/polar alignment paths.  | hover/reference ก่อน แล้วลากไปตาม guide โดยไม่สร้าง construction line ถาวร | ยังไม่มี generalized tracking | **ปรับก่อนใช้**: extension, perpendicular, parallel เป็นสาม guide แรก | กลาง | GW-01/02/03, ทางต่างระดับ |
| **Parallel road / exact offset** | C:S II Parallel สร้างถนนคู่ที่ระยะปรับได้; Network Multitool มี Parallel mode.  | เลือก reference แล้วลาก/พิมพ์ offset; ghost ก่อน commit | ยังไม่มี user-facing tool | **นำมาใช้** แต่สร้าง ordinary roads เช่นเดิม | กลาง | GW-03, ทางต่างระดับ |
| **สามคลิกสร้าง grid** | C:S II Grid: corner → width → length.  Trafficity ก็โฆษณา road grids ทุกมุมด้วยสามคลิก แต่ยังไม่ออกตัวเต็ม.  | สร้าง orthogonal network block ครั้งเดียว | ไม่มี | **รอหลัง template**; ไม่ใช่ traffic-engineering core | กลาง | GW-05 |
| **จัดจุดให้เป็นเส้นตรง** | Network Multitool “Arrange at line”.  | เลือก nodes แล้ว project ให้เป็นแนวเดียว | ไม่มี | **ควรมี** `ทำให้ตรง` สำหรับ selected points | เล็ก–กลาง | GW-01/03 |
| **จัดเป็นวงกลม** | Network Multitool “Arrange at circle”.  | fit/arrange nodes เป็นวง | ไม่มี | **รอ**; roundabout ควรเป็น semantic object/command ไม่ใช่วงกลมดิบ | กลาง | GW-02 |
| **smooth connection ระหว่างสอง tangents** | Network Multitool มี straight–curve–straight / curve–straight–curve / smooth curve; Civil 3D มี free/floating curve constraint.  | เลือกสองแนวที่ทราบ แล้ว solver สร้าง transition ที่สัมผัส | TSD มี radius ที่ vertex แต่ไม่มี connection solver | **ปรับก่อนใช้**: “เชื่อมสองแนวด้วยโค้งสัมผัส” พร้อม preview | กลาง | GW-02, ทางต่างระดับ |
| **arc ผ่านจุด / three-point arc** | Civil 3D มี fixed/free curve families; AutoCAD polyline arc รองรับ endpoint/second point/radius/center/direction.  | กำหนด curve จาก geometric constraints แทน free Bezier handle | ไม่มี | **ให้เป็น secondary curve mode**, ไม่ใช่ default | กลาง | GW-01/02 |
| **Bezier/control-point curve** | Aimsun Next editor ใช้ road section curve ที่มี endpoints และ control points; geometry สามารถแก้ด้วย handles.  | control point ปรับรูป curve โดยตรง | ไม่มี | **ไม่ควรเป็น primary road geometry**; ยากต่อการสื่อ radius/engineering intent | ใหญ่ | ไม่เร่ง |
| **constrained handles** | Civil 3D grips มีพฤติกรรมต่างตาม constraint; บาง grip ไม่ให้แก้เมื่อจะทำลาย dependency.  | handle ขยับได้เฉพาะ degree of freedom ที่ถูกต้อง | TSD radius handle constrained บางส่วนแล้ว | **ขยายแนวคิด** ให้ offset/ramp/profile handle บอกข้อจำกัดชัด | กลาง | ทุก GW, ทางต่างระดับ |
| **box / additive selection** | SUMO netedit Shift-drag rectangle และย้าย/แก้ selected objects ร่วมกัน; NIMBY Rails box-select และ Shift-add control points.  | เลือกหลาย object แล้ว move/delete/batch edit | ไม่มี generalized multi-select | **นำมาใช้ตรง ๆ** | กลาง | GW-02/03/06 |
| **move whole road/network selection** | SUMO เมื่อ selected junctions/edges สามารถลาก geometry พร้อมกันได้; Move It ถูกสร้างมาเพื่อ select/move/align network elements.  | preserve relative geometry ขณะ translate selection | TSD ลากเฉพาะ point | **ควรมี**, แต่ต้อง rebind junction/ramp หลัง gesture | กลาง | GW-01/02/03 |
| **split / join / reverse** | SUMO มี Split edge/Join Selected Junctions; Network Multitool มี add/remove/join nodes และ invert segment.  | topology operations ใน context ของเส้นที่เลือก | Join มีแล้ว; split/reverse ยังไม่มี | **เพิ่ม context commands** | กลาง | GW-01/02/03 |
| **Replace / Upgrade selected network** | C:S II Replace เปลี่ยนถนนเดิมและ decorations; Road Builder mod มี edit existing custom network / template workflow.  | เปลี่ยน type โดยไม่ redraw alignment | TSD setSection ทั้ง road | **ปรับก่อนใช้**: รอ road-range/lane-run model 4C | ใหญ่ | GW-03 |
| **blueprint/ghost editing ก่อน commit** | NIMBY Rails วาง track ใหม่เป็นสีน้ำเงิน, ลาก control points ได้ และ invalid radius สร้างจริงไม่ได้; blueprint สามารถแก้ freely ก่อน build.  | draft เป็น first-class editable state ก่อน commit | TSD มี draft preview แต่ไม่ใช่ multi-object blueprint | **ใช้กับ template ghost เท่านั้น** ก่อน 4B-3 | กลาง | ทางต่างระดับ |
| **saved template / reusable layout** | Factorio blueprint จับพื้นที่ที่เลือก, วางเป็น ghost, เก็บใน blueprint library และ rotate/flip ได้; แนวคิดนี้ใช้กับ reusable geometry ได้แม้ domain ต่างกัน.  | เก็บกลุ่มวัตถุและวางซ้ำ | Diamond template กำลังจะมา; user template ยังไม่มี | **ปรับก่อนใช้**: template ต้อง unpack เป็น editable TSD objects; library รอหลัง 4B-3 | ใหญ่ | ทางต่างระดับ, GW-06 |
| **template orientation/mirror ก่อน commit** | Factorio blueprint รองรับ rotate/flip แต่มีข้อจำกัดกับ object ที่มีทิศทางบางชนิด.  | transform ghost ก่อน commit | roadmap วาง mirror/rotate ไว้ 4D | **สำหรับ diamond ควรมี orientation/flip ขั้นต่ำ** แต่ต้อง validate traffic direction; generalized transform รอ 4D | กลาง | ทางต่างระดับ |
| **numeric slope guide ระหว่างวาด** | C:S II road guides แสดง slope steepness เป็นตัวเลข; NIMBY แสดง geometry/radius feedback ระหว่างวาง.  | feedback ก่อนยืนยัน ไม่ซ่อนใน property panel | TSD มี grade HUD แล้ว | **มีแล้ว — ไม่ทำซ้ำ**; เพิ่ม threshold warning หลังมี sourced rule เท่านั้น | เล็ก | ทางต่างระดับ |
| **equalize/regularize slope** | Network Multitool มี Slope nodes mode เพื่อทำ slope ระหว่าง nodes ให้เท่ากัน.  | เลือกชุด nodes แล้วกระจาย elevation อย่างสม่ำเสมอ | ไม่มี | **น่าสนใจหลัง 4B-3** เป็น `ทำความลาดสม่ำเสมอ`; ห้ามเรียกว่าผ่านมาตรฐาน | กลาง | ทางต่างระดับ |
| **profile direct + exact editing** | Civil 3D profile grips เปลี่ยน PVI/grade โดย constraints; SUMO elevation mode ลากเฉพาะ z และแสดง elevation ตัวเลข.  | drag กับ numerical value แก้ state เดียวกัน | TSD มีแล้วเกือบครบ | **คงของเดิม**; เพิ่ม constraint option/label declutter | เล็ก–กลาง | ทางต่างระดับ |
| **right-click contextual operations** | SUMO ใช้ right-click context menu และคำสั่งขึ้นกับ element/mode.  | actions อยู่ตรง object ลด inspector hunting | TSD right-click สงวนไว้ย้อน point เฉพาะตอน Draw | **นำมาใช้ใน Select mode**; ไม่ชน grammar ปัจจุบัน | เล็ก | ทุก GW |
| **lane connector เป็น advanced override** | TM:PE lane connector ให้เลือก incoming/outgoing lanes โดยตรง และเอกสารเตือนว่าการตั้ง connection ผิดอาจทำให้ปลายทางเข้าถึงไม่ได้.  | explicit lane graph ให้ power สูงแต่ error-prone | roadmap วางไว้ 4C advanced override | **คง roadmap เดิม**: auto first, advanced only | ใหญ่ | GW-02 / 4C |
| **touch box/lasso + explicit tool modes** | SketchUp for iPad รองรับ box/lasso ผ่าน Pencil, multitouch, trackpad และ mouse; มี Add/Remove selection modes.  | interaction ไม่พึ่ง Shift อย่างเดียว | TSD ยังไม่พบหลักฐาน touch-specific selection | **ปรับใช้**: visible selection mode/floating controls เมื่อ touch pointer | กลาง | ทุก GW |
| **touch shortcut/radial toolbar** | SketchUp iPad มี customizable floating shortcut และ radial toolbar; เปิดได้ผ่าน Pencil/trackpad/mouse.  | ลดการเดินทางไป toolbar บนจอเล็ก | ไม่มี | **รอหลัง phone basics**; floating 3–5 action bar น่าจะเหมาะ TSD กว่า radial เต็มรูปแบบ | กลาง | ทุก GW |
| **freehand → simplify/normalize** | Illustrator มี Simplify path สำหรับลด/ปรับ anchor points ของเส้น.  | sketch ก่อนแล้วลดจุด/fit geometry | ไม่มี | **ไม่ควรเร่ง**; ถ้าทำต้อง preview เส้นเดิมกับเส้น normalize และไม่อ้าง engineering radius โดยอัตโนมัติ | ใหญ่ | tracing เท่านั้น |

### ข้อค้นพบสำคัญจากเกมและ mod ที่ไม่ควรมองข้าม

C:S I mod ecosystem แสดงบทเรียนที่ชัดมากว่า **ผู้ใช้ไม่ได้ต้องการ road-construction mode เพิ่มไปเรื่อย ๆ เท่ากับต้องการ tools สำหรับ “แก้สิ่งที่วาดไปแล้ว”**. Network Multitool มี arrange-line, arrange-circle, equalize slope, smooth connection, parallel และ invert segment ในชุดเดียว.  Node Controller Renewal ยังเพิ่ม free-form offset/rotation/shift และ modifier เพื่อจำกัดการเลื่อนเฉพาะแกน ซึ่งเป็นตัวอย่างของ constrained manipulation ที่เหมาะนำมาเป็นแนวคิด ไม่ใช่ UI โดยตรง. 

NIMBY Rails เป็น reference ที่เหมาะกับ TSD มากกว่าหลายเกมตรงที่ control points, radius, invalid state และระดับของ track เป็นสิ่งที่ผู้ใช้มองเห็นขณะสร้าง และหลาย control points สามารถเลือกพร้อมกันได้. Track ที่คนละ level ผ่านกันโดยไม่ intersect และ endpoint ที่เชื่อมกับของเดิมรักษาระดับเดิมไว้ ซึ่งสอดคล้องกับ semantics ที่ TSD 4B-2 ทำอยู่แล้ว.  ดังนั้นสิ่งที่ควรนำเพิ่มจาก NIMBY ไม่ใช่ level system ใหม่ แต่คือ **blueprint editability + multi-selection + feedback density ที่ไม่ต้องเข้า inspector**

## รายการ “เล็กแต่ได้ผล” เรียงตามความคุ้มค่า

รายการนี้ตั้งใจหลีกเลี่ยงการเสนอ feature ใหญ่ที่ชน Phase 4C/4D และเน้นสิ่งที่ลดจำนวนการคลิกหรือความไม่แน่ใจทันที

| ลำดับคุ้มค่า | การปรับปรุง | เหตุผล | ขนาด |
|---|---|---|---|
| **สูงมาก** | **แสดง snap badge ข้าง HUD** เช่น `ปลายถนน`, `แนวถนน`, `ต่อแนว`, `90°`, `15°` | geometry มีอยู่แล้ว แต่ feedback ยังไม่บอกชนิดละเอียด; แก้ “ทำไม cursor ถูกดูดไปตรงนี้” โดยแทบไม่แตะ model. AutoCAD ใช้ marker/tooltip หลักเดียวกัน.  | เล็ก |
| **สูงมาก** | **Tab วน snap candidate เมื่อมีหลาย target ใกล้กัน** | ลด frustration ตอน endpoint/road/intersection ซ้อนกัน โดยไม่เพิ่ม permanent UI | เล็ก |
| **สูงมาก** | **Space+drag = temporary pan ทุก mode** และคง middle-drag เดิม | UX Architecture เองเปิดทางไว้แล้ว; ช่วยวาดยาวโดยไม่ต้อง H → Pan → R กลับ.  | เล็ก |
| **สูงมาก** | **right-click menu ใน Select mode**: Join, Split here, Reverse, Straighten, Zoom, Delete | ไม่ชนกับ right-click “back one point” เพราะใช้คนละ mode; SUMO พิสูจน์ pattern contextual menu ได้ดี.  | เล็ก–กลาง |
| **สูงมาก** | **เพิ่ม invisible hit target ของ profile PVI จาก ~9 px ให้เท่าระดับ plan handle** | plan editor ทำ hit target scaling ดีอยู่แล้ว แต่ profile point เล็กกว่า; ช่วย mouse และ touch ทันที.  | เล็ก |
| **สูงมาก** | **จัด label ใน profile ไม่ให้ทับกัน**: hide low-priority → stagger → tooltip on hover | profile ที่ crossings หนาแน่นจะอ่านไม่ได้ก่อน geometry จะมีปัญหา | เล็ก–กลาง |
| **สูงมาก** | **phone top bar → “เพิ่มเติม …”** รวม New/Open/Save/Export/secondary actions | ≤900px ปัจจุบันซ่อน text แต่ยังคงปุ่มจำนวนมาก; การรวม secondary actions คืนพื้นที่ให้ canvas.  | เล็ก |
| **สูงมาก** | **touch drawing action strip**: `ย้อนจุด`, `จบ`, `ยกเลิก`, `Snap on/off` | ขจัด dependency ต่อ right-click, Backspace, Enter, Shift บนโทรศัพท์ | เล็ก–กลาง |
| **สูง** | **Straighten selected points** | command ที่ผู้ใช้เข้าใจทันทีและใช้แก้ trace ที่สั่น; Network Multitool มี precedent.  | กลาง |
| **สูง** | **temporary measurement between cursor and acquired reference** | ช่วยวาง access, opening, ramps โดยไม่ต้องสร้าง geometry ทดลอง | เล็ก–กลาง |
| **สูง** | **direction arrows ที่ ramp anchor ขณะ hover/select** | ลดการ attach ผิดทิศก่อนเข้า 4B-3 โดยไม่เปลี่ยน model | เล็ก |
| **สูง** | **แสดง ghost edge/footprint ไม่ใช่ centerline อย่างเดียวสำหรับ ramp/template** | ผู้ใช้เห็นว่าพื้นที่จริงชนอะไร ก่อน commit; ใช้ validation engine เดิมได้ | กลาง |
| **สูง** | **one-shot perpendicular/parallel guide** หลัง hover road | เป็นจุดกึ่งกลางที่คุ้มค่ากว่าการสร้าง CAD tracking system เต็มชุด. AutoCAD แสดงประโยชน์ของ acquired alignment path ชัดเจน.  | กลาง |
| **กลาง–สูง** | **box select + Shift add/remove** | เปิดทางให้ Move, Straighten, Delete, batch operations ทั้งหมด; SUMO และ NIMBY ใช้ pattern นี้.  | กลาง |
| **กลาง–สูง** | **Move selected roads/points เป็น gesture เดียว** | แก้ “วาดถูกทรงแต่ผิดตำแหน่ง” โดยไม่ redraw; topology rebind infrastructure มีอยู่แล้ว | กลาง |
| **กลาง** | **จำค่าทางเรขาคณิตของ tool ที่สัมพันธ์กัน** แต่ไม่จำ semantic role ที่เสี่ยง เช่น Ramp โดยไม่ตั้งใจ | C:S II patch 2026 ใช้แนว carry-over parameter เพื่อลด re-entry.  | เล็ก |
| **กลาง** | **คำสั่ง “ทำความลาดสม่ำเสมอ”** สำหรับ selected PVIs พร้อม preview | ใช้ง่ายกว่า drag ทีละ point; Network Multitool ใช้แนวเดียวกัน.  | กลาง |
| **กลาง** | **toast/HUD ให้ wrap/reposition บน phone** | `white-space: nowrap` ไม่เหมาะกับ warning ภาษาไทยยาว โดยเฉพาะ ramp error | เล็ก |

สิ่งที่ **ไม่อยู่ใน quick wins** แม้จะดูน่าสนใจคือ full Bezier editor, full CAD constraints, arbitrary copy/paste network, user template library, station-based partial section replacement และ vertical-curve criteria engine เพราะแต่ละข้อแตะ data model หรือ semantics มากเกินกว่าจะเรียกว่า “เล็กแต่ได้ผล”

## สิ่งที่ควรทำก่อน Diamond template และสิ่งที่รอได้

Roadmap ปัจจุบันกำหนด 4B-3 ถูกทางแล้ว: diamond ต้องสร้างจาก ramp/anchor/profile ธรรมดา, commit เป็นหนึ่ง undo step, แต่ละชิ้นแก้ต่อได้ และเก็บ template origin/version/parameters.  ดังนั้นไม่ควรแทรก feature ใหญ่จน diamond ถูกเลื่อนออกไป แต่มี foundation บางอย่างที่ควรปิดก่อน เพราะ template จะทวีคูณทั้งข้อดีและข้อเสียของ interaction ปัจจุบัน

### ควรปิดก่อน 4B-3

**Ramp attachment acceptance matrix เป็นข้อแรก.** ต้องมี test อย่างน้อย `diverge/merge × สอง physical sides` บน divided 4-lane road, ทดสอบกลับ drawing direction ของ mainline, ย้าย mainline หลัง attach, extend road start/end, detach/reattach และ undo/redo. Model ระบุ behavior เหล่านี้ไว้แล้ว แต่ภาพที่มีไม่ครอบคลุมทุก combination.  หาก template สร้างสี่ ramp พร้อมกัน ความผิดพลาดเพียงหนึ่ง quadrant จะกลายเป็น topology defect ทั้ง template

**Full-shape ghost + reason ก่อน commit.** 4B-3 spec ต้องมี red footprint preview อยู่แล้ว จึงควรสร้าง primitive นี้ให้เป็น reusable infrastructure ไม่ hard-code เฉพาะ diamond.  Ghost ควรแสดงอย่างน้อย road/ramp envelope, anchor points, crossing relation และ structure stretch; สีแดงต้องแสดง “วางไม่ได้เพราะอะไร” เช่นเดียวกับ road draft ปัจจุบัน

**Template-placement transform ขั้นต่ำ.** ก่อน click commit ควรมี rotate orientation และ flip/mirror ที่เข้าใจ direction ของถนน ไม่จำเป็นต้องสร้าง general transform editor. Factorio แสดงว่าการ transform blueprint ก่อนวางช่วย reuse มาก แต่ TSD ต้องต่างออกไปตรงที่ mirror ต้อง re-evaluate left-hand traffic, diverge/merge side และ road direction ไม่ใช่กลับภาพเฉย ๆ. 

**Snap/guide feedback ของ attachment.** ระหว่างวาง template ให้ highlight main road ที่ template อ้างอิง, station ที่จับอยู่, orientation และระดับที่จะ inherit. ปัญหานี้ควรแก้พร้อม snap badge เพราะ geometry engine มีข้อมูลอยู่แล้ว

**Group transaction และ provenance.** Commit ทั้ง diamond = undo เดียวตาม roadmap แต่หลัง commit roads/ramps ต้องยังเลือกแก้แยกได้ และควรมี action “เลือกชิ้นที่มาจาก template เดียวกัน” หรือ “สร้างใหม่จาก parameter” โดยไม่ทำให้ template กลายเป็น opaque object. 

**phone overflow และ visible commit/cancel.** Template เป็น interaction หลายขั้นกว่าถนนธรรมดา หาก top bar/HUD/inspector กินจอจนไม่เห็น ghost จะทำให้ UX แย่ตั้งแต่รุ่นแรก จึงควรปิด layout defect ที่คาดการณ์ได้ก่อน

### รอหลัง 4B-3 ได้

General box/multi-selection และ move selection มีคุณค่าสูง แต่ไม่จำเป็นต้อง block template หาก placement ghost มี transform ของตัวเอง. อย่างไรก็ดีควรทำไม่นานหลัง 4B-3 เพราะ template จะสร้างวัตถุหลายชิ้นและผู้ใช้จะต้องการ batch edit

Parallel/offset road tool, straighten/align, split/reverse, general copy/paste, arbitrary rotate/mirror และ user-saved blueprint library สามารถตามหลัง template ได้. Roadmap เดิมที่วาง generalized mirror/rotate และ template variants ไว้ 4D ยังสมเหตุสมผล. 

Partial road upgrade/replace ควรรอ 4C เพราะถ้าทำก่อน station-based lane runs อาจสร้าง representation ชั่วคราวที่จะต้องรื้อใหม่เมื่อ GW-03 ต้องรองรับ lane add/drop, auxiliary lanes และ width transitions ตามสถานี. Phase 4C ใน roadmap ตั้งใจแก้จุดนี้อยู่แล้ว. 

Vertical curves, rule-based max grade, clearance compliance และ minimum-radius criteria ควรรอ rule/reference architecture ที่เหมาะสม. Phase 4A ปัจจุบันระบุชัดว่า 6.0 m, 6.5 m, 4% และ tolerances ที่ใช้บางส่วนเป็น **tool values ไม่ใช่มาตรฐาน** และต้อง `TO_VERIFY`. 

Command palette, repeat-last-command, custom shortcut profiles และ tablet radial toolbar เป็น QoL ที่ดีแต่ไม่ควรแทรกก่อน template. UX Architecture มีพื้นที่สำหรับ Ctrl/Cmd+K อยู่แล้ว จึงไม่มีเหตุผลต้องสร้าง temporary command-line UI. 

## สิ่งที่ไม่ควรเลียนแบบ

**ไม่ควรยก Civil 3D constraint vocabulary มาทั้งชุด.** Civil 3D มี fixed/free/floating lines, curves, spirals และ complex transition groups ที่แก้ parameter แล้วรักษา tangency ได้ เหมาะกับ detailed geometric design แต่จะเพิ่มทั้ง terminology, state และ dependency ที่เกิน concept-stage goal ของ TSD อย่างมาก.  สิ่งที่ควรยืมคือผลลัพธ์ระดับสูง เช่น “เชื่อมสองแนวด้วยโค้งสัมผัส” ไม่ใช่ expose constraint graph ทั้งหมด

**ไม่ควรใช้ Bezier/free-control curve เป็น geometry หลักของถนน.** Control handles ทำให้เส้นดูสวยเร็ว แต่ความหมายเชิงรัศมีและ tangent ไม่ชัด และผู้ใช้วิศวกรรมจะต้องย้อนแปลง shape ไปเป็นค่าที่ตรวจสอบได้. ใช้ได้กับ freehand tracing/illustration แต่ไม่ควรแทน vertex+radius หรือ constrained arc

**ไม่ควรทำ freehand normalize แบบเงียบ.** เครื่องมือกราฟิกสามารถ simplify path ได้สะดวก  แต่ใน TSD การเปลี่ยน control points โดย algorithm อาจเปลี่ยน station, crossings, radius และ access positions. หากเพิ่มในอนาคตต้องแสดง before/after ghost, tolerance และ commit เป็นหนึ่ง undo step

**ไม่ควรให้ template เป็น black box.** Blueprint/template จากเกมเหมาะกับการวางซ้ำ แต่ interchange ของ TSD ต้องแตกเป็น ordinary ramp/road/anchor/profile ตาม roadmap เพื่อให้ engineer ตรวจและแก้ทีละส่วนได้. 

**ไม่ควร mirror interchange แบบภาพกราฟิก.** Factorio สามารถ flip blueprint ได้สะดวก  แต่ ramp ของ TSD มี traffic direction, left-hand traffic, diverge/merge semantics และ lane-side attachment. Mirror ต้อง run semantic resolver ใหม่ทุกครั้ง

**ไม่ควรบังคับ lane connector ทุก movement ตั้งแต่เริ่ม.** TM:PE แสดงพลังของ explicit lane connections แต่เอกสารเองสะท้อนความเสี่ยงที่ connectivity ผิดสามารถทำให้บางเส้นทางไปไม่ถึง.  แนว roadmap 4C ที่ auto-map ก่อนแล้ว advanced override เมื่อจำเป็นเหมาะกับ TSD มากกว่า

**ไม่ควรใช้ grade/radius/clearance จากเกมเป็นมาตรฐาน.** Numerical slope feedback แบบ C:S II มีประโยชน์ด้าน UX  แต่ตัวเลข rule ของ TSD ต้องมาจาก source ที่โครงการยอมรับเท่านั้น. จนกว่าจะมี 4E ให้แสดง `geometry invalid`, `needs standards check`, หรือ `TO_VERIFY` ตาม roadmap ไม่ควรใช้คำว่า “ผ่านมาตรฐาน”. 

**ไม่ควร auto-clamp geometry จนผู้ใช้ไม่รู้ว่าแบบถูกเปลี่ยน.** หาก slope/radius เกิน rule ในอนาคต ควร preview/warn และเสนอ action แก้ ไม่ควรเลื่อน PVI หรือยืด ramp โดยเงียบ เพราะ concept ที่เห็นจะไม่ตรงกับสิ่งที่ผู้ใช้วาด

**ไม่ควรออกแบบ critical gesture ที่พึ่ง double-click/right-click/modifier เท่านั้น.** Desktop ใช้ได้ดี แต่ touch ไม่มี equivalent ที่ชัด. SketchUp for iPad แก้ปัญหานี้ด้วย explicit selection modes และ toolbars ที่เข้าถึงด้วย Pencil/multitouch ได้.  สำหรับ TSD ปุ่ม contextual `ย้อนจุด / จบ / ยกเลิก` เหมาะกว่า radial system ใหญ่ในระยะแรก

**ไม่ควรคัดลอก UI mod ecosystem ของ C:S I ตรง ๆ.** Move It, Network Multitool และ Node Controller มีความสามารถสูงมาก แต่ความสำเร็จของ pattern มาจากการแยก “operation” ชัด เช่น align, parallel, slope, smooth connection—not จากการมี toolbar/mod หลายตัว. TSD ควรรวม operation ที่จำเป็นเข้า Select/context layer เดียว. 

## คีย์ลัดและกติกาเมาส์ชุดเดียวสำหรับ TSD

กติกาปัจจุบันมีพื้นฐานดีและไม่ควรถูกเปลี่ยนมาก: `V` Select, `H` Pan, `R` Draw Road, middle-drag pan, `Shift` ปิด snap ชั่วคราว, Enter จบ/commit typed length, Backspace ย้อน point, right-click ย้อน point ระหว่างวาด, Esc cancel, PageUp/PageDown level, `Z` focus selection และ Ctrl/Cmd+Z/Y undo/redo. `page.tsx` ยังจัด Delete/Backspace ให้ลบ selected alignment point ก่อนลบทั้ง road ซึ่งสอดคล้องกับ selection context. 

สิ่งที่ควรเปลี่ยนคือ **ทำให้กฎเดียวกันขยายไปสู่ทุกเครื่องมือใหม่** แทนการแจก shortcut เฉพาะ feature

| การกระทำ | TSD ปัจจุบัน | ชุดที่แนะนำ |
|---|---|---|
| Select | `V` | **คง `V`** |
| Pan mode | `H` | **คง `H`** |
| Pan ชั่วคราว | middle-drag | **middle-drag + Space+left-drag ทุก mode** |
| Zoom | mouse wheel ตาม UI hint | **wheel / trackpad pinch / touch pinch**; gesture ไม่เปลี่ยน mode |
| Fit all | button | เพิ่ม **`F`** ได้เมื่อไม่ชน field editing |
| Zoom selection | `Z` | **คง `Z`** |
| Draw Road | `R` | **คง `R`** |
| วาง point | left click | **คง** |
| จบการวาด | Enter / double-click | **คง**; บน touch มีปุ่ม `จบ` |
| ย้อนจุดล่าสุด | Backspace / right-click | **คง**; บน touch มีปุ่ม `ย้อนจุด` |
| Cancel current operation | Esc | **คง Esc เป็นกฎสากล** |
| Snap off ชั่วคราว | Shift | **คง Shift** |
| เลือกหลายชิ้น | ไม่มี | **Shift+click add/remove; drag empty space = box select** |
| candidate snap ซ้อนกัน | auto priority | **Tab = วน target** |
| numeric input | พิมพ์ตัวเลขระหว่าง Draw = length | พิมพ์ = เปิด dynamic HUD; **Tab วน field ที่ใช้ได้** เช่น Length → Angle → Offset → Level โดยไม่ให้ field ที่ไม่เกี่ยวปรากฏ |
| เพิ่ม/ลดระดับ | PageUp/PageDown | **คง**; visible ▲/▼ ต้องอยู่บน touch |
| Delete selection | Delete/Backspace | **Delete** เป็น primary; Backspace สงวน backward step เมื่อ tool active เพื่อให้ mental model ชัด |
| Object actions | Inspector | เพิ่ม **right-click context menu ใน Select mode** |
| Undo/redo | Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl/Cmd+Y | **คงทั้งหมด** |
| Command search | ยังไม่ implemented | **Ctrl/Cmd+K** ตาม UX Architecture; ใช้สำหรับคำสั่งรอง ไม่แทน toolbar หลัก.  |
| Repeat last command | ไม่มี | **ยังไม่กำหนด key ตายตัว**; เริ่มจากรายการแรกใน command palette/context menu เพื่อไม่ชน browser shortcut |
| Touch | ยังไม่มี grammar ที่ยืนยันครบ | tap=select/place; one-finger drag handle=edit; **two-finger pan/pinch**; floating `Back / Finish / Cancel / Snap` แทน keyboard modifiers |

มีหลักสามข้อที่ควรถือเป็น invariant

**หนึ่ง mouse gesture = หนึ่ง undo step.** โครงสร้าง command/history ปัจจุบันทำไว้ถูกแล้ว โดย drag ใช้ gesture grouping และ command สร้าง Thai undo label.  Multi-move, template placement และ align operations ใหม่ต้องรักษากฎเดียวกัน

**direct manipulation กับ numeric input ต้องแก้ object/property เดียวกัน.** นี่เป็นหลักใน UX Architecture และ Phase 4 อยู่แล้ว.  ไม่ควรมี “drag mode” กับ “exact mode” ที่สร้าง geometry คนละชนิด

**modifier ควรเป็น temporary constraint ไม่ใช่ mode ลับ.** `Shift = snap off` ดีอยู่แล้ว; `Tab = cycle`; `Space = pan`. ไม่ควรสะสม Ctrl/Alt/Shift combinations จำนวนมากแบบ CAD จนต้องจำคู่มือ

## ข้อสรุปจัดลำดับสำหรับการพัฒนา

ข้อเสนอที่สำคัญที่สุดไม่ใช่การเพิ่ม curve mode จำนวนมาก แต่คือทำให้ **สิ่งที่วาดแล้วแก้ต่อได้เร็วเท่ากับตอนวาดครั้งแรก**. โปรแกรมที่เป็น reference ดีที่สุดในแต่ละมิติแบ่งบทเรียนได้ค่อนข้างชัด: C:S II เด่นเรื่อง construction grammar และ parallel/grid/replace/feedback, AutoCAD เด่นเรื่อง snap tracking และ dynamic input, Civil 3D เด่นเรื่อง constrained geometry, NIMBY Rails เด่นเรื่อง blueprint/control-point workflow, SUMO เด่นเรื่อง multi-selection/contextual network editing และ C:S I mod ecosystem เด่นเรื่อง post-draw alignment operations. 

สำหรับ TSD ลำดับที่เหมาะสมคือ:

**ก่อน diamond 4B-3:** ปิด ramp four-case acceptance, full-shape template ghost + red reason, snap/attachment labels, template orientation/flip ที่ traffic-aware, grouped undo/provenance และ phone commit/cancel/overflow. ทั้งหมดช่วย template โดยตรงและไม่เปลี่ยน core geometry model

**ทันทีหลัง 4B-3:** เพิ่ม Select tool ให้เป็น editing hub จริง—box/Shift multi-select, move selection, right-click context actions, Straighten, Split/Join/Reverse และ perpendicular/parallel tracking. สิ่งเหล่านี้ให้ประโยชน์ทั้งกับ template-created roads และถนนที่ผู้ใช้วาดเอง

**ใน 4C:** ทำ selected road-range + Replace/Upgrade, lane add/drop และ lane mapping ให้ใช้ abstraction เดียวกัน หลีกเลี่ยงการสร้าง partial-section workaround ก่อน model พร้อม. 

**หลังจากนั้น:** parallel/offset tool แบบเต็ม, user-saved blueprint/template library, generalized rotate/mirror, equalize slope, freehand normalization และ command palette refinement

ทิศทางนี้รักษาจุดแข็งปัจจุบันของ TSD ไว้: การวาดเร็ว, preview ก่อน commit, topology อัตโนมัติแต่บอกผู้ใช้, profile/3D state เดียวกัน และ descriptive undo. สิ่งที่ควรเพิ่มคือ **precision without ceremony**—ผู้ใช้ควรทำให้ตรง, ขนาน, ตั้งฉาก, ย้ายทั้งชุด หรือเลือก reference ได้โดยไม่ต้องกลายเป็นผู้ใช้ CAD เต็มตัว ขณะเดียวกันทุก geometry ที่เกี่ยวกับ slope, radius, clearance หรือมาตรฐานยังต้องแยกอย่างเคร่งครัดระหว่าง “ค่าที่วาด”, “geometry ใช้ได้”, และ “ตรวจตามแหล่งอ้างอิงแล้ว”; ค่า engineering criterion ที่ยังไม่มี source ให้คงสถานะ **`TO_VERIFY`** ตามนโยบาย Phase 4E. 