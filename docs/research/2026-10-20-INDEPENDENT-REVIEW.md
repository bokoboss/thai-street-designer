> Independent review by ChatGPT (owner-requested), 2026-10-20, at commit 4878cee. Kept verbatim except tracking
> parameters removed from links. Verification by the maintainer agent and the status of each finding are in the
> section "Verification and status" at the end.

# รายงานรีวิวอิสระ — Thai Street Designer

ฐานการตรวจ: Repository `main` ที่ commit [`4878cee`](https://github.com/bokoboss/thai-street-designer/tree/4878cee6a1c7ede0cd86c0ba98fec9b12bb09abd) วันที่ตรวจ: 20 ตุลาคม 2569 ขอบเขต: วิศวกรรมถนนและทางแยก, UX/UI, ความถูกต้องของข้อมูล, สถาปัตยกรรม และการทดสอบ

## 1. สรุปภาพรวม

1. แนวทาง Road-first เหมาะกับกลุ่มผู้ใช้เป้าหมาย มากกว่าการเริ่มสร้างวัตถุทางแยกทีละแห่ง เพราะผู้ใช้สามารถเริ่มจากแนวถนนและปรับรายละเอียดภายหลังได้
2. โครงสร้างแกนคำนวณมีทิศทางที่เหมาะสม โดยใช้โมเดลถนนประกอบเป็น Network และนำ geometry engine เดิมมาใช้ร่วมกัน แทนการสร้างชุดคำนวณแยกสำหรับแต่ละมุมมอง
3. ยังมีความเสี่ยงด้านความถูกต้องของแบบ: พบกรณีที่ระบบตัดขาทางแยกส่วนเกินออกจาก geometry และอาจยืดขาทางแยกจนไม่ตรงแนวถนนที่ผู้ใช้กำหนด โดยไม่ได้ปฏิเสธการแก้ไขนั้น
4. UX ยังไม่เป็นพื้นที่ทำงานเดียวอย่างสมบูรณ์: การแก้ทางแยกขั้นสูงต้องเปลี่ยนหน้า และบางส่วนของหน้าตัด มุมมอง และคำศัพท์ยังใช้แนวคิดจากระบบเดิม
5. การรักษาข้อมูลยังไม่แข็งแรงพอสำหรับงานจริง: การบันทึกลงเบราว์เซอร์บางกรณีล้มเหลวโดยไม่แจ้งเตือน และมีเส้นทางการกลับจากหน้าแก้ทางแยกที่ไม่ได้ตรวจว่าบันทึกสำเร็จก่อนออก
6. ชุดทดสอบมีขอบเขตค่อนข้างกว้าง: GitHub Actions ของ commit นี้ [ผ่านจริง](https://github.com/bokoboss/thai-street-designer/actions/runs/39372711148) ทั้งงานทดสอบและ Build ตาม workflow แต่ยังไม่ใช่หลักฐานว่ากรณีขอบเขตทั้งหมดหรือการใช้งานโดยคนจริงผ่าน
7. ข้อสรุปความพร้อม: ใช้ทดลองจัดทำแบบแนวคิดเบื้องต้นได้ แต่ยังไม่แนะนำให้ถือผลลัพธ์เป็นรูปเรขาคณิตที่เชื่อถือได้โดยไม่ตรวจทาน โดยเฉพาะโครงการที่มีทางแยกซับซ้อน ช่วงถนนสั้น หรือการย้ายข้อมูลจากไฟล์เก่า

สถานะหลักฐาน: ได้อ่านโค้ดและเอกสารจาก commit ที่ระบุ รวมถึงตรวจผล CI แล้ว แต่ยังไม่สามารถควบคุมหน้าเว็บที่ Deploy เพื่อทดลองคลิกด้วยตนเองได้ ดังนั้นจำนวน Action ด้านล่างจะแยกข้อมูลจาก Browser Acceptance ใน Repository ออกจากผลที่ยังไม่ได้ทดสอบจริง

## 2. ผลประเมิน UX และ Golden Workflows

### 2.1 จำนวนขั้นตอนการใช้งาน

ตารางนี้อ้างอิงการอ่าน `scripts/verify-design-browser.mjs` และการนับปฏิสัมพันธ์ตามแนวทางในเอกสาร UX ของโครงการ โดยถือว่า 1 คลิก, 1 การลาก, 1 คำสั่งคีย์บอร์ด หรือ 1 การกรอกค่าที่กดยืนยัน เท่ากับ 1 Action

ตัวเลขเหล่านี้ไม่ใช่จำนวนคลิกที่ทดลองวัดบนเว็บ Deploy ด้วยตนเอง

| งานที่ขอทดสอบ                                            | จำนวน Action จากหลักฐานที่มี | ผลตรวจและจุดสะดุด                                                                                                                                                                    |
| -------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. วาดถนนสองเส้นตัดกัน                                   | 6                            | เลือกวาดถนน → คลิกต้น → ดับเบิลคลิกปลาย ทำสองรอบ ทางแยกสร้างอัตโนมัติโดยไม่ต้องคลิกยืนยันเพิ่มเติม ตรวจโดย Browser Acceptance แล้ว                                                   |
| 2. แก้หน้าตัดและต่อถนนด้วยตัวเลข                         | 5 + 5                        | การเลือกถนนและแก้ 2 ค่าใช้ 5 Action ในสคริปต์ ส่วนการต่อถนนด้วยระยะ 50 ม. ใช้ 5 Action การต้องกด Enter ครั้งแรกเพื่อวางจุด และครั้งที่สองเพื่อจบถนน เป็นจุดที่ผู้ใช้ใหม่อาจไม่คาดคิด |
| 3. เพิ่มเลนเลี้ยว ปรับ storage ลากจุด และเพิ่ม Slip lane | ประมาณ 6–7                   | เพิ่มเลนพร้อมกรอกระยะใช้ 4 Action ตามสคริปต์ บวกการลากจุดและเพิ่ม Slip lane หากลากจุดรัศมีมุมด้วยจะเพิ่มอีก 1 Action ปัญหาสำคัญคือจุดจับรัศมีมุมหนึ่งจุดเปลี่ยนรัศมีทุกมุม           |
| 4. เพิ่มทางเลือก แก้ไข ดูความต่าง ส่งออก PNG/HTML        | ประมาณ 9–11                  | มีสคริปต์ทดสอบการคัดลอกทางเลือก ไฮไลต์ความต่าง และส่งออกสองรูปแบบ แต่ตัวเลขรวมขึ้นอยู่กับจำนวนการคลิกเพื่อเปิด Inspector และสลับ Scenario การส่งออกแต่ละชนิดใช้ 2 Action             |
| 5. ไป `/junction` แก้ไข กลับ `/design`                   | อย่างน้อยประมาณ 7            | Browser Acceptance ตรวจการส่งค่า Median Opening กลับและตรวจว่ามีรายการ Undo ปรากฏ ทว่าไม่ได้ทดสอบการบันทึกล้มเหลวหรือการย้อนกลับจริงผ่าน UI หลังกลับหน้า                             |
| 6. 3D, ภาพอ้างอิง, แผนที่, หน้าตัดตามระยะทาง             | ไม่มีตัวเลขรวมที่เชื่อถือได้ | สคริปต์ครอบคลุมการสลับ 2D/3D, การปรับมาตราส่วนภาพ, การย้ายแผนที่ และการเปิดหน้าตัดตามระยะ แต่ไม่ใช่การประเมินเวลาหรือความสะดวกของผู้ใช้งานจริง                                       |

หลักฐาน: [Browser Acceptance](https://github.com/bokoboss/thai-street-designer/blob/4878cee/scripts/verify-design-browser.mjs) และ [UX Research](https://github.com/bokoboss/thai-street-designer/blob/4878cee/docs/research/2026-10-UX-RESEARCH.md#L160-L185)

### 2.2 ความสมบูรณ์ของ Golden Workflows

| Workflow                        | สถานะจากการตรวจโค้ด             | ช่องว่างที่ยังพบ                                                                                            |
| ------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GW-01 ปรับปรุงทางเข้าออกโครงการ | ทำได้เป็นส่วนใหญ่ แต่มีเงื่อนไข | การจัดการทางเข้าออกและช่องเปิดเกาะกลางยังต้องพึ่งหน้า Advanced และต้องตรวจความต่อเนื่องของแนวถนน            |
| GW-02 ปรับปรุงทางแยก            | บางส่วน                         | ยังไม่มีรัศมีขอบทางรายมุมจริง และการแก้องค์ประกอบบางชนิดต้องเปลี่ยนหน้า                                     |
| GW-03 ขยายถนน 4 เป็น 6 ช่อง     | ยังไม่ครบ                       | เปลี่ยนหน้าตัดทั้งสายได้ แต่การสร้างและปรับ Lane Transition ตามระยะทางจาก `/design` ยังไม่ครบ               |
| GW-04 ช่องเปิดเกาะกลาง/กลับรถ   | บางส่วน                         | มี geometry ใน Advanced แต่ยังไม่ใช่เครื่องมือวางและแก้ตาม Station บนแนวถนนโดยตรงอย่างสมบูรณ์               |
| GW-05 ถนนเมือง                  | ยังไม่ครบ                       | การเพิ่มและแก้ Bike/Shoulder/องค์ประกอบริมทางใน Road Inspector ยังไม่ครบ แม้ Engine รองรับข้อมูลบางส่วนแล้ว |
| GW-06 จัดภาพรายงาน              | บางส่วน                         | ส่งออก PNG/SVG/HTML ได้ตามโค้ด แต่การพกภาพอ้างอิงและแผนที่ไปกับไฟล์ยังมีข้อจำกัด                            |

ความแตกต่างสำคัญคือ ระบบมีความสามารถในการแสดงผลบางอย่างแล้ว แต่ยังไม่มี Workflow สำหรับสร้างหรือแก้สิ่งนั้นอย่างสะดวกในหน้า `/design` ซึ่งไม่ควรนับเป็นความสามารถที่สมบูรณ์ของผลิตภัณฑ์

### 2.3 เทียบกับรูปแบบการใช้งานของซอฟต์แวร์อื่น

เมื่อเทียบเชิง Interaction Pattern กับ Civil 3D, Streetmix, Vissim/Synchro, SketchUp และ Figma:

- SketchUp: TSD มีการ Snap และกรอกระยะขณะวาด แต่รูปแบบการยืนยันจุดและจบคำสั่งยังต้องเรียนรู้มากกว่าเป้าหมายที่ควรเป็น
- Figma / CAD Properties: TSD ใช้ Contextual Inspector ได้ถูกทิศทาง แต่การมี Inspector สองระบบระหว่าง `/design` และ `/junction` ทำให้ความต่อเนื่องของการแก้ไขลดลง
- Streetmix: การเปลี่ยนหน้าตัดทั้งสายของ TSD ทำได้ แต่การจัดวางองค์ประกอบหน้าตัดยังไม่ตรงไปตรงมาเท่าเครื่องมือที่ออกแบบมาเพื่อปรับ Cross-section โดยเฉพาะ
- Civil 3D: TSD ไม่จำเป็นต้องเลียนแบบระบบ Corridor ที่ซับซ้อน แต่ควรมีความสัมพันธ์ระหว่าง Alignment, Station, Cross-section และ Junction ที่ตรวจสอบย้อนกลับได้
- Vissim/Synchro: จุดแข็งของ TSD คือไม่บังคับผู้ใช้สร้าง Node/Link/Connector ด้วยตนเอง อย่างไรก็ตาม ระบบต้องไม่สร้างภาพที่ดูเชื่อมต่อกันทั้งที่ Topology จริงไม่เชื่อมต่อ

ข้อวินิจฉัยคือ ปัญหาหลักไม่ใช่จำนวนคลิกอย่างเดียว แต่เป็นความคาดเดาได้ของผลลัพธ์และความต่อเนื่องของสถานะการแก้ไข โดยเฉพาะเมื่อผู้ใช้เปลี่ยนจากภาพ 2D ไปแก้ค่าทางวิศวกรรมหรือเปิดหน้า Advanced

## 3. ตารางข้อค้นพบ เรียงตามความรุนแรง

ระดับความรุนแรงประเมินจากผลกระทบต่อความถูกต้องของแบบ ข้อมูลผู้ใช้ และการทำงานหลัก ไม่ใช่ความยากในการเขียนโค้ดแก้ไข

หมายเหตุ: “วิธีทำซ้ำ” ในรายการที่ยังไม่ได้ทดสอบสดเป็น Test Case ที่อนุมานจากโค้ด ไม่ใช่ผลยืนยันจากการคลิกบนเว็บ

| ระดับ | หมวด / ไฟล์และบรรทัด                                                                                                                                                                                                                                                                                                                | ปัญหา                                                                                     | หลักฐาน / วิธีทำซ้ำ                                                                                                                                                        | ผลกระทบ                                                                               | ข้อเสนอแก้ไข                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| วิกฤต | Topology — [commands.ts L43–61](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/commands.ts#L43-L61), [derive.ts L123–125](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/derive.ts#L123-L125)                           | การเพิ่มถนนสายใหม่เข้าจุดตัดเดิมอาจไม่ทำให้ถนนนั้นเป็นส่วนหนึ่งของทางแยก                  | หลัง A และ B ตัดกันจนเกิดทางแยก ให้เพิ่มถนน C มาจบที่จุดตัดเดียวกัน `rebindDecisions()` ย้าย Candidate ID แต่เก็บ `d.roads` เดิมไว้ ขณะที่ Compiler กรองขาถนนตาม `d.roads` | ถนน C ดูเหมือนเข้าทางแยก แต่ไม่ถูกผูกเข้ากับ Junction Geometry                        | เมื่อ Candidate มีสมาชิกเปลี่ยน ให้ตรวจ Topology Delta และบังคับตัดสินใจว่าจะรับถนนใหม่เข้าทางแยกหรือไม่ ห้ามยอมรับโดยไม่แจ้ง |
| วิกฤต | Geometry — [derive.ts L163](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/derive.ts#L163), [commands.ts L195–200](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/commands.ts#L195-L200)                                | เมื่อทางแยกมีเกิน 4 ขา Compiler ตัดขาส่วนเกินออก                                          | `found.length > 4` แล้วเรียก `found.length = 4` โดยเพิ่ม Issue แต่ `engineError()` ไม่ถือ Compile Issue นี้เป็นข้อผิดพลาดที่ต้องปฏิเสธ                                     | แบบที่สร้างอาจขาดขาทางแยก ทั้งที่ผู้ใช้วาดถนนครบ                                      | ให้เป็น Blocking Geometry Error และคงจุดตัดเป็น Unresolved Candidate จนผู้ใช้แก้โครงข่ายหรือเลือกรูปแบบที่รองรับ              |
| สูง   | ข้อมูล / Handoff — [junction/page.tsx L124](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/junction/page.tsx#L124), [L211–216](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/junction/page.tsx#L211-L216)                                      | กดกลับหน้าออกแบบได้แม้การบันทึกจาก Advanced ล้มเหลว                                       | `saveNow()` คืนค่า `void`; ปุ่มและลิงก์กลับหน้าเรียก Save แล้ว Navigate ต่อโดยไม่ได้ตรวจผล เช่น กรณี `junctionDesignLinkIssue()` ปฏิเสธ                                    | ผู้ใช้แก้แล้วเห็นผลใน `/junction` แต่ค่าที่แก้อาจไม่กลับมาที่ `/design`               | เปลี่ยน `saveNow()` เป็นผลลัพธ์ `success/error`; ออกจากหน้าได้เฉพาะเมื่อบันทึกสำเร็จ และเสนอทางเลือกแก้ปัญหาหรือยกเลิก        |
| สูง   | การเก็บข้อมูล — [use-road-editor.ts L19–29](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/use-road-editor.ts#L19-L29), [L78–81](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/use-road-editor.ts#L78-L81)                       | Autosave ล้มเหลวเงียบ ๆ และข้อมูลเดิมที่อ่านไม่ได้ไม่มีขั้นตอนกู้คืน                      | `localStorage.setItem()` ถูก Catch แล้วไม่แจ้งเตือน ส่วนข้อมูลที่ Parse ไม่ได้ทำให้เปิดโครงการเปล่า และอาจเขียนทับ Storage เดิมเมื่อ Autosave ทำงาน                        | งานสูญหายเมื่อ Reload หรือข้อมูลกู้คืนถูกแทนที่                                       | เพิ่ม Saved/Unsaved/Error State, สำรอง Raw Storage ก่อน Recovery, ปิดการเขียนทับเมื่อพบข้อมูลเสีย และแจ้งให้ Export ไฟล์ทันที |
| สูง   | ความถูกต้อง Geometry — [derive.ts L197–205](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/derive.ts#L197-L205)                                                                                                                                                               | Arm Fit อาจยืดขาทางแยกเลยระยะตรงที่มีจริง                                                 | หาก `requiredArmLength > room` โค้ดยังคงกำหนดความยาวที่ต้องการและบันทึกเป็น Issue ว่า “ถูกยืดจึงไม่ตรงแนวถนน”                                                              | รูปทางแยกอาจไม่สอดคล้องกับ Alignment ที่วาด โดยเฉพาะแยกใกล้กันหรือมี Pocket ยาว       | แยก Auto-fit ที่ทำได้ ออกจาก Geometric Shortfall ที่ต้องแก้โดยผู้ใช้ พร้อมระบุระยะขาดและวาดส่วนขัดแย้งบนแผน                   |
| สูง   | โครงข่าย — [derive.ts L63–85](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/derive.ts#L63-L85)                                                                                                                                                                               | ถนนสองสายที่ปลายชนปลายไม่สร้างการเชื่อมต่อ                                                | บรรทัด 75 ข้ามกรณี `endA && endB` โดยระบุว่าเป็น Continuation ที่ยังไม่รองรับ ขณะ Compiler สร้าง Road End แยกตามถนน                                                        | ภาพเหมือนถนนต่อกัน แต่ข้อมูลโครงข่ายยังแยกกัน                                         | เพิ่ม Join/Continue Roads ที่รักษา Alignment และแสดงความแตกต่างระหว่าง “ชนกันทางภาพ” กับ “เชื่อมต่อจริง”                      |
| สูง   | Round-trip — [leg-treatments.ts L32–39](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/leg-treatments.ts#L32-L39)                                                                                                                                                             | ค่าที่เป็นของถนนซึ่งแก้ใน Advanced ไม่ถูกส่งกลับเป็นการแก้ถนน                             | `captureTreatments()` ตรวจพบการเปลี่ยน `ROAD_FIELDS` แล้วเพิ่ม Issue แต่ไม่แปลงการแก้นั้นเป็น Road Command                                                                 | แก้จำนวนช่องหรือความกว้างใน Advanced แล้วอาจพบว่าค่าไม่เปลี่ยนเมื่อกลับหน้าออกแบบ     | ทำช่อง Road-owned เป็น Read-only ใน Advanced พร้อมปุ่ม “แก้ที่ถนน” หรือรองรับการส่งกลับผ่าน Road Command อย่างปลอดภัย         |
| สูง   | Scenario — [page.tsx L76–78](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/page.tsx#L76-L78), [compare.ts L68–77](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/compare.ts#L68-L77)                                        | ID ถนนที่ลบแล้วถูกนำกลับมาใช้ ทำให้ Diff ระบุวัตถุผิด                                     | ลบ `R-1` ใน Alternative แล้วสร้างถนนใหม่ ระบบอาจใช้ `R-1` อีกครั้ง แต่ Scenario Comparison ถือ ID เดิมเป็นถนนเดียวกัน                                                      | ระบบแสดง “แก้ไข” แทน “ลบถนนเดิม + เพิ่มถนนใหม่”                                       | ใช้ Immutable Object ID เช่น UUID หรือ Project-level Monotonic ID ที่ไม่เคยนำกลับมาใช้                                        |
| สูง   | Scenario Undo — [use-road-editor.ts L99–111](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/use-road-editor.ts#L99-L111)                                                                                                                                                           | การลบ Alternative ไม่อยู่ใน Undo History ของโครงการ                                       | `applyScenario()` จัดการรายการ Scenario นอก Editor History และลบ Editor ของ Scenario ที่ถูกลบ                                                                              | ลบทางเลือกผิดแล้ว Undo ไม่สามารถคืนทั้งทางเลือกได้                                    | จัด Workspace History แยกจาก Geometry History หรือใช้ Transaction เดียวที่ย้อนการเพิ่ม/ลบ/เปลี่ยนชื่อ Scenario ได้            |
| กลาง  | UX Geometry — [approach-edit.ts L75–86](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/approach-edit.ts#L75-L86)                                                                                                                                                              | จุดจับรัศมีมุมแต่ละจุดไม่ได้แก้เฉพาะมุมนั้น                                               | โค้ดระบุชัดว่า Handle ทุกตัวแก้ค่า Corner Radius ร่วมของทางแยก                                                                                                             | ผู้ใช้อาจแก้มุมหนึ่งแล้วทำให้มุมอื่นเปลี่ยนโดยไม่ตั้งใจ                               | ระยะสั้นแสดงว่า “รัศมีทุกมุม”; ระยะยาวเพิ่ม Per-corner Radius ใน Geometry Model                                               |
| กลาง  | Undo การกรอกตัวเลข — [history.ts L11–14](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/common/history.ts#L11-L14), [use-road-editor.ts L85–95](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/use-road-editor.ts#L85-L95)              | การกรอกค่าในช่องเดิมสองครั้งต่อเนื่องอาจรวมเป็น Undo ขั้นเดียว                            | History รวมคำสั่งที่มี Group เดียวกัน แต่ Numeric Field ไม่ได้เรียก `finishGesture()` เมื่อ Commit ทุกครั้ง                                                                | Undo ครั้งเดียวอาจย้อนค่าหลายครั้ง มากกว่าที่ผู้ใช้ตั้งใจ                             | ปิด History Group ทุกครั้งหลัง Commit ค่าตัวเลข และเพิ่ม Regression แบบแก้ค่าเดียวกันสองครั้ง                                 |
| กลาง  | หน้าตัดถนน — [section-strip.tsx L13–32](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/section-strip.tsx#L13-L32)                                                                                                                                                                  | หน้าตัดโหมด “ทั้งเส้น” ไม่รวม `bands` ในการแสดงและรวมความกว้าง                            | โค้ดรวมเฉพาะช่องจราจร เกาะกลาง และทางเท้า แม้ RoadSection รองรับ Bike/Shoulder/Buffer                                                                                      | ความกว้างที่แสดงอาจไม่ตรงกับหน้าตัดจริงของแบบ                                         | ให้ทั้ง Strip และ Station View เรียก Section Resolver เดียวกัน                                                                |
| กลาง  | GW-03 / Station Editing — [section-strip.tsx L20–28](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/section-strip.tsx#L20-L28)                                                                                                                                                     | แสดงหน้าตัดตาม Station ได้ แต่แก้ Transition จาก Workflow หลักยังไม่ครบ                   | Station Mode เป็นการเรียก `NetworkSectionDock` ซึ่งแสดงค่าและ Slider เป็นหลัก                                                                                              | งานเปรียบเทียบการขยายถนนตามระยะทำได้ไม่ครบจากหน้าเดียว                                | เพิ่ม Station Cursor บนแผนและ Inspector สำหรับ Lane Add/Drop, Width Transition และ Taper                                      |
| กลาง  | Migration — [migrate.ts L95–96, L162–170](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/migrate.ts#L162-L170), [scenarios.ts L81–91](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/scenarios.ts#L81-L91)              | ความสัมพันธ์บางชนิดจาก Network เดิมไม่ถูกย้าย และ UI แสดงเพียงจำนวน Issue                 | โค้ดระบุว่าถนนวงรอบบางกรณีและ Parallel Corridor Relationships ยังย้ายไม่ครบ ขณะที่ขั้นเปิดงานแสดงจำนวนรายการ ไม่ใช่รายละเอียดทั้งหมด                                       | ผู้ใช้ไม่รู้ว่าความสัมพันธ์ใดสูญหายหรือควรตรวจที่ตำแหน่งใด                            | ทำ Migration Report รายวัตถุ พร้อม Before/After และระดับความสำคัญ ก่อนยอมรับผลนำเข้า                                          |
| กลาง  | ภาพส่งออก — [design-canvas.tsx L168–176](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/design-canvas.tsx#L168-L176), [export-figure.ts L15–23](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/export-figure.ts#L15-L23)          | ไฟล์ SVG อาจอ้างอิงภาพ Blob ที่ใช้ได้เฉพาะ Session และแผนที่ DOM อยู่แยกจาก SVG ที่ส่งออก | Export Clone เฉพาะ SVG; ภาพอ้างอิงใช้ Blob URL ส่วนแผนที่เป็น Component ภายนอก SVG                                                                                         | เปิด SVG บนเครื่องอื่นแล้วภาพอ้างอิงอาจหาย และ PNG สำหรับรายงานอาจไม่มีแผนที่พื้นหลัง | ฝังภาพอ้างอิงเป็น Data URI ก่อนส่งออก และเพิ่มตัวเลือก “ส่งออกพร้อมแผนที่” โดยจัดการสิทธิ์และ Attribution                     |
| กลาง  | Responsive / a11y — [style.css L58](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/style.css#L58), [design-canvas.tsx L169–170](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/design/design-canvas.tsx#L169-L170)                       | Inspector ถูกซ่อนเมื่อความกว้างไม่เกิน 900px และการแก้บน Canvas พึ่ง Pointer              | CSS ใช้ `display:none` สำหรับ Inspector โดยไม่มี Drawer ทดแทน ขณะที่จุดจับบน SVG ไม่มีวิธีแก้ด้วยคีย์บอร์ดที่เทียบเท่ากัน                                                  | Tablet/หน้าต่างแคบแก้ค่าหลักไม่ได้ และ Keyboard-only Interaction ไม่ครบ               | ใช้ Responsive Inspector Drawer พร้อมทางเลือกแก้ค่าผ่านรายการวัตถุและช่องตัวเลข                                               |
| กลาง  | ประสิทธิภาพ — [derive.ts L63–85](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/derive.ts#L63-L85), [commands.ts L175–192](https://github.com/bokoboss/thai-street-designer/blob/4878cee/core/road-first/commands.ts#L175-L192)                        | การคำนวณจุดตัดตรวจ Segment หลายคู่ และการลากจุดเรียก Compile/Validate ซ้ำ                 | ลูปตรวจ Segment ทุกคู่ระหว่างถนน และคำสั่งลากจุดผ่านกระบวนการตรวจแบบเต็ม                                                                                                   | ความเสี่ยงที่ยังไม่ได้ Benchmark: เมื่อจำนวนถนนและจุดมาก อาจลากไม่ลื่น                | เพิ่ม Spatial Index, Incremental Recompute และเก็บ Full Validation เมื่อ Commit การลาก                                        |
| ต่ำ   | ภาษา UI / Map Key — [network-section-dock.tsx L51–57](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/network/network-section-dock.tsx#L51-L57), [junction/page.tsx L218](https://github.com/bokoboss/thai-street-designer/blob/4878cee/app/junction/page.tsx#L218) | มีคำจากระบบเดิมและคำแนะนำ Domain สำหรับ API Key ที่ไม่ตรงกับเว็บ Vercel                   | UI ยังใช้ `Road Link`, `Station`, `FROM/TO` และแนะนำจำกัด Key เฉพาะ `bokoboss.github.io`                                                                                   | ผู้ใช้สับสนเรื่องทิศทางหน้าตัดหรือกำหนด Key Restriction ผิด Domain                    | ปรับตาม Glossary และแนะนำ Origin ที่ใช้งานจริง                                                                                |
| ต่ำ   | QA Evidence — [.github/workflows/quality.yml L44–51](https://github.com/bokoboss/thai-street-designer/blob/4878cee/.github/workflows/quality.yml#L44-L51)                                                                                                                                                    | CI ผ่าน แต่ไม่ได้เก็บภาพ Acceptance ของการทดสอบชุดปัจจุบันไว้                             | Workflow อัปโหลด `artifacts/network-browser-*` แต่ Design Browser สร้างไฟล์ชื่อ `design-*`; ตรวจ Actions Run นี้พบ Artifacts จำนวน 0                                       | ผู้รีวิวไม่สามารถตรวจภาพประกอบย้อนหลังจาก Run นี้                                     | อัปโหลด `design-*` และ `junction-goldens-*` พร้อม Manifest และเพิ่มระยะเก็บที่เหมาะสม                                         |

### ประเด็นที่ไม่พบหลักฐานว่าเป็นข้อผิดพลาด

เพื่อไม่ให้การรีวิวกลายเป็นการกล่าวหาความผิดพลาดเกินหลักฐาน มีบางส่วนที่ควรแยกให้ชัดเจน:

- การ Mapping ขาเข้า–ขาออกใน `core/road-first/derive.ts:99–113` มีตรรกะสอดคล้องกับทิศทางถนนที่วาด และไม่พบหลักฐานชัดเจนว่ากลับด้านจราจรชิดซ้าย
- ตำแหน่งเลนเลี้ยวขวาใกล้เกาะกลางและ Slip lane เลี้ยวซ้ายมีการแยกความหมายไว้ใน Model ไม่ได้ใช้ Pocket ซ้อนกันอย่างอิสระ
- Regression ของ Slip lane ตรวจบางกรณีเรื่อง Pavement, Crossing, Stop Line และการไม่ปนกับเลนเลี้ยวปกติ
- การย้ายข้อมูล Network เดิมมี Golden Fixtures ที่เปรียบเทียบผล Geometry โดยใช้ความคลาดเคลื่อนระดับที่กำหนดไว้ในชุดทดสอบ และตรวจสอบผ่าน CI

อย่างไรก็ตาม สิ่งเหล่านี้ยังไม่เท่ากับการรับรองความถูกต้องของ geometry ทุกกรณี โดยเฉพาะ Swept Path, Sight Distance, Lane Continuity และโครงข่ายที่ซับซ้อนกว่าชุดตัวอย่าง

## 4. การตรวจสอบด้านมาตรฐานวิศวกรรมไทย

โครงการมีนโยบายแยกมาตรฐานหน่วยงานออกจากค่าตั้งต้นของเครื่องมือ ซึ่งควรรักษาไว้ แต่ข้อจำกัดคือเอกสารมาตรฐานบางรายการยังไม่ได้ผูกกับแหล่งอ้างอิงระดับหน้า/ตารางที่ตรวจสอบได้

| ประเด็น            | สิ่งที่พบจากโค้ด                                     | ข้อวินิจฉัย                                                                        |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ความกว้างช่องจราจร | Preset เช่น 3.00 และ 3.25 ม.                         | เป็นค่าตั้งต้นเพื่อสร้าง Concept ไม่ใช่ค่ามาตรฐานที่ใช้ได้กับถนนทุกประเภท          |
| ความกว้างเกาะกลาง  | Preset มีค่า 0, 2, 3 ม.                              | ต้องแยกประเภทเกาะกลางและตรวจตามบริบทของโครงการและหน่วยงานเจ้าของถนน                |
| รัศมีมุมทางแยก     | มี Modeling Range ใน Geometry Engine                 | ไม่เพียงพอจะยืนยันการเลี้ยวของรถออกแบบ ต้องตรวจ Swept Path                         |
| Turn Pocket        | มี Storage, Taper และการตรวจ Fit                     | ยังไม่คำนวณความยาวจากปริมาณรถ ความเร็ว ความยาวคิว หรือการออกแบบช่องเปลี่ยนความเร็ว |
| Slip lane          | มี Radius, Width, Auxiliary และ Departure Treatments | ยังต้องตรวจความเร็วเลี้ยว แนวกวาดรถ พื้นที่เกาะนำทาง Sight Distance และทางข้าม     |
| Arm Fit            | ใช้กฎ Geometry Clearance ภายใน                       | เป็นเงื่อนไขทางคอมพิวเตอร์ ไม่ใช่ระยะมาตรฐานวิศวกรรมที่ใช้แทนการออกแบบได้          |
| 3D                 | แสดงลักษณะ Conceptual Geometry                       | ไม่ใช่แบบจำลองระดับทาง ความลาดชันตามยาว ความลาดขวาง หรือ Clearance ของโครงสร้าง    |

แหล่งที่ตรวจใน Repository: [STANDARDS_POLICY.md](https://github.com/bokoboss/thai-street-designer/blob/4878cee/docs/standards/STANDARDS_POLICY.md), [ENGINEERING_DESIGN_BASIS.md](https://github.com/bokoboss/thai-street-designer/blob/4878cee/docs/ENGINEERING_DESIGN_BASIS.md), [SLIP_LANE_DESIGN_BASIS.md](https://github.com/bokoboss/thai-street-designer/blob/4878cee/docs/SLIP_LANE_DESIGN_BASIS.md)

ยังไม่ได้ตรวจยืนยันเลขหน้า ตาราง และค่าเกณฑ์จากคู่มือกรมทางหลวง กรมทางหลวงชนบท หรือกรุงเทพมหานครฉบับต้นทางในรอบนี้ จึงไม่จัดค่าตั้งต้นข้างต้นเป็นค่ามาตรฐานทางราชการ

ข้อเสนอคือเพิ่ม Design Basis Record ให้กับค่าที่เกี่ยวข้องกับความปลอดภัย โดยระบุหน่วยงานเจ้าของมาตรฐาน ฉบับเอกสาร วันที่ตรวจสอบ สภาวะที่ใช้ และสถานะว่าเป็น ข้อกำหนด / คำแนะนำ / สมมติฐานของเครื่องมือ ก่อนนำไปใช้ใน Engineering Review

## 5. Quick Wins — ไม่เกิน 10 ข้อ

เรียงตามลำดับที่ควรดำเนินการ โดยยังไม่จำเป็นต้องรื้อ Architecture ทั้งระบบ

1. ห้ามสร้างทางแยกเกิน 4 ขาแบบตัดส่วนเกินทิ้ง และตรวจว่าถนนที่เพิ่มภายหลังเข้ากับทางแยกเดิมจริงหรือไม่
2. หยุดการนำทางออกจาก `/junction` เมื่อ Save ล้มเหลว พร้อมข้อความที่บอกเหตุผลและวิธีแก้
3. เพิ่มสถานะการบันทึกใน `/design` และรักษาข้อมูลต้นฉบับเมื่อโหลด Storage ไม่สำเร็จ
4. ปิด Undo Group หลัง Commit Numeric Field แล้วเพิ่มเทสต์แก้ค่าเดียวกันสองครั้งและ Undo ทีละครั้ง
5. แก้การสร้าง ID ถนนใหม่ ไม่ให้ใช้ ID เดิมที่ถูกลบ เพื่อให้ Scenario Diff เชื่อถือได้
6. เปลี่ยนคำอธิบายจุดจับ Radius ให้บอกชัดว่าปัจจุบันเปลี่ยนทุกมุม หรือเหลือจุดจับรวมเพียงหนึ่งชุด
7. แก้หน้าตัด “ทั้งเส้น” ให้แสดง Bands ครบ และใช้การวางทิศทางเดียวกับหน้าตัดตาม Station
8. เพิ่ม Inspector Drawer เมื่อหน้าจอไม่เกิน 900px แทนการซ่อนฟังก์ชันแก้ไขทั้งหมด
9. ทำ Pre-export Check แจ้ง Geometry Issues และแยกตัวเลือกการส่งออกพร้อม/ไม่พร้อมภาพอ้างอิง
10. แก้ QA Artifact Upload และคำศัพท์หน้า Advanced รวมถึงคำแนะนำ API Key ให้ตรงกับ Domain ที่ใช้งานจริง

## 6. ข้อเสนอเชิงโครงสร้าง

### 6.1 เพิ่มชั้นตรวจ Topology และ Geometry Integrity

ก่อนสร้างหรือแก้ทางแยก ควรตรวจเป็นลำดับว่า:

- ถนนที่วาดตัดหรือสัมผัสกันทางเรขาคณิตอย่างไร
- ผู้ใช้ต้องการให้เชื่อมต่อจริงหรือเป็นจุดตัดที่ไม่เชื่อม
- ระบบรองรับจำนวนขาทางแยกและรูปแบบนั้นหรือไม่
- Arm, Pocket และ Slip lane สามารถวางบน Alignment จริงได้หรือไม่

ผลควรแยกเป็น `Valid`, `Needs Decision` และ `Invalid` แทนการปล่อยให้ Compiler แก้รูปร่างที่ผู้ใช้กำหนดโดยอัตโนมัติทุกกรณี

### 6.2 ปรับ Persistence เป็นระบบที่มีการกู้คืน

ให้ Workspace มี ID และ Revision ที่คงที่ พร้อมระบบ Auto-save Status, Backup Snapshot และ Export แบบรวม Assets

สำหรับข้อมูลเบราว์เซอร์ ควรมีการตรวจ Storage Error และ Recoverable Version แทนการใช้ `localStorage` แบบเขียนทับครั้งเดียวโดยไม่มีการแจ้งเตือน ส่วนภาพอ้างอิงใน IndexedDB ควรมีการตรวจความเชื่อมโยงกับ Project ก่อนส่งต่อไฟล์ไปใช้อีกเครื่อง

### 6.3 รวมประสบการณ์ `/design` และ `/junction` เป็น Editor เดียว

แนวทางที่ควรไปถึงคือ:

โครงสร้างพื้นที่ทำงานที่เสนอ — ภาพแนวคิด ไม่ใช่ภาพหน้าจอปัจจุบัน

การแก้ทางแยกขั้นสูงควรเป็น Focus Mode หรือ Advanced Inspector ภายใต้ State เดียวกัน ไม่ใช่กระบวนการ Copy → LocalStorage → Navigate → Capture → Return เหมือนปัจจุบัน

วิธีนี้จะลดทั้งภาระ UX และความเสี่ยงเรื่อง Round-trip, Undo และข้อมูลค้างระหว่างหน้า

### 6.4 ใช้ Geometry/Section Resolver เดียวสำหรับทุกมุมมอง

โมเดลหลักควรให้ข้อมูลเดียวกันสำหรับ 2D Plan, Cross-section Strip, Station Section, 3D และ Export

เน้นการทดสอบความสอดคล้องแบบ Cross-view เช่น หากเพิ่มช่องจักรยานแล้ว ความกว้างรวมและตำแหน่งขอบทางต้องเปลี่ยนตรงกันทุกมุมมอง หากปรับ Storage ความยาวจริงต้องปรากฏเท่ากันทั้งตัวเลข จุดจับ และรูปส่งออก

### 6.5 ปรับชุดทดสอบจาก Feature Tests เป็น Workflow + Fault Tests

นอกจาก Regression ที่มีแล้ว ควรเพิ่มการทดสอบ:

- ถนนสามสายมาบรรจบจุดเดียว, จุดตัด 5–6 ขา และปลายถนนชนปลายถนน
- ถนนโค้งหรือทางแยกใกล้กันจน Arm Fit ไม่พอ
- การเปลี่ยนสถานะใน Alternative แล้ว Undo/Delete/Rename และ Compare
- Storage Full, Invalid JSON, สอง Browser Tabs, Navigation ขณะ Save Error
- หน้าจอ 768px/900px, Keyboard-only, Touch/Pointer Cancel
- 2D–3D–Cross-section–SVG Export Consistency

ให้ Browser Acceptance ที่ผ่าน CI ส่งมอบ Screenshot, Manifest และ Diff Artifacts ที่ตรวจทานย้อนหลังได้จริงด้วย

## 7. หลักฐานที่ตรวจจริงและข้อจำกัด

| ประเภท                                                                                                          | สถานะ                     |
| --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| อ่านเอกสาร Architecture, Roadmap, Golden Workflows, ADR และ Standards Policy                                    | ตรวจแล้ว                  |
| อ่านโค้ดใน `core/road-first`, ส่วนที่เกี่ยวข้องของ `core/junction`, `/design`, `/junction` และระบบจัดเก็บข้อมูล | ตรวจแล้ว                  |
| ตรวจสคริปต์ Regression และ Browser Acceptance                                                                   | ตรวจแล้ว                  |
| ตรวจผล CI ณ commit ที่ระบุ                                                                                      | ยืนยันว่า Success         |
| ทดสอบหน้าเว็บ Deploy ด้วยการคลิกและลากด้วยตนเอง                                                                 | ยังตรวจไม่ได้             |
| รันชุด Regression ด้วยตนเองในสภาพแวดล้อมนี้                                                                     | ยังไม่ได้รัน              |
| ตรวจ Swept Path, Capacity/LOS, Simulation หรือมาตรฐานแบบก่อสร้าง                                                | นอกขอบเขตและยังไม่ได้ตรวจ |
| Benchmark ประสิทธิภาพกับโครงการขนาดใหญ่และทดสอบผู้ใช้จริง                                                       | ยังไม่ได้ทำ               |

ผล CI ที่ยืนยันได้คือ [`Quality Run #1267`](https://github.com/bokoboss/thai-street-designer/actions/runs/39372711148) ซึ่งผ่านเมื่อวันที่ 20 ตุลาคม 2569 แต่สถานะ Success ไม่ได้ครอบคลุมกรณีผิดปกติทั้งหมดที่พบจากการตรวจโค้ดครั้งนี้

## 8. ข้อสรุปและลำดับการพัฒนาที่แนะนำ

ไม่ควรเริ่มจากการเพิ่มฟังก์ชันใหม่จำนวนมากในตอนนี้

แนะนำให้แบ่งงานถัดไปเป็นสามระยะ:

| ลำดับ                                 | เป้าหมาย                                                                                              | เงื่อนไขผ่านก่อนเดินหน้าต่อ                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| P0 — Engineering & Data Integrity     | แก้ Topology, จำนวนขาทางแยก, Arm Fit, Handoff Save, Autosave และ Scenario Identity                    | ห้ามมีถนนหรือขาทางแยกหายโดยไม่แจ้ง และไม่มีข้อมูลสูญหายจากการเปลี่ยนหน้าที่ระบบยอมให้ทำ |
| P1 — UX Workflow Consolidation        | ปรับ Undo, Inspector, หน้าตัด, การแก้ตาม Station และความสม่ำเสมอของ 2D/3D                             | Golden Workflows หลักสามารถทำได้อย่างต่อเนื่อง โดยไม่ต้องทราบโครงสร้างภายในของโปรแกรม   |
| P2 — Engineering Capability Expansion | เพิ่ม Per-corner Radius, Station-based Lane Transitions, Urban Street Components และการอ้างอิงมาตรฐาน | ทุกความสามารถใหม่มี Engineering Basis, Regression และ Browser Acceptance รองรับ         |

คำตัดสินสุดท้าย: PASS WITH CONDITIONS สำหรับการทดลองใช้ภายในเพื่อออกแบบแนวคิด และ BLOCK สำหรับการใช้งานที่ต้องเชื่อถือผล Geometry โดยไม่มีการตรวจทาน

สถาปัตยกรรมโดยรวมยังมีฐานให้พัฒนาต่อได้ ไม่จำเป็นต้องเขียนระบบใหม่ แต่ต้องแก้ปัญหา Topology Integrity, Data Persistence และ Round-trip Editing ก่อน มิฉะนั้นการเพิ่มความสามารถด้านทางแยกและโครงข่ายจะทำให้ข้อผิดพลาดตรวจพบยากขึ้นและมีต้นทุนแก้ไขสูงกว่าเดิม

---

## Verification and status (2026-10-20)

Checked against the code; three findings were reproduced with scripts before fixing.

| Finding | Verified | Status |
| --- | --- | --- |
| Road reaching an existing junction not joined (critical) | reproduced | fixed — PR #26 (joins or reports; `scripts/verify-topology-integrity.cjs`) |
| Over-4-leg junction truncated silently (critical) | reproduced (worse: road through the centre ignored) | fixed — PR #26 |
| Leaving /junction after a failed save | code | fixed — PR #27 |
| Silent autosave failure / unreadable storage overwritten | code | fixed — PR #27 (save state, copy aside) |
| Road id reuse breaks scenario diff | code | fixed — PR #27 (`core/road-first/ids.ts`) |
| Removing an alternative not undoable | code | fixed — PR #27 (restore from notice) |
| Two typed values merged into one undo step | reproduced | fixed — PR #27 |
| CI artifacts not uploaded | confirmed (path stale after #25) | fixed — PR #27 |
| Road-owned values edited in /junction not returned | code | fixed — PR #29: blocked in the advanced editor with "แก้ที่หน้าออกแบบ" |
| Section strip ignores bands; corner handles change every corner; inspector hidden ≤ 900 px; SVG export references a session-only image; API-key domain hint | code | fixed — PR #29 (bands shown and editable; "ทุกมุม" wording; drawer; image embedded; hint uses the current domain) |
| Arm stretched beyond straight room | code | fixed — PR #29 (red mark with the shortfall on the plan) |
| End-to-end roads not joined | code | fixed — PR #30 (marked on the plan, "เชื่อมเป็นถนนเดียว") |
| Per-corner radius | code | fixed — PR #31 (each corner handle edits its own corner; default for the rest) |
| Migration report detail | code | P2 — in progress |
| Station transitions | known limitation | moved to roadmap Phase 4C (lane runs), designed with the interchange model |
| Performance on large networks | known limitation | roadmap "Later": benchmark first |
| Merge /design and /junction into one editor (6.3) | agreed direction | P2 (large); direction from the 2026-10-21 research: refine in place on the plan, lane connector as the advanced view |
