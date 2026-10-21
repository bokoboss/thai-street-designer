> UX / display / workflow review by ChatGPT (owner-requested), 2026-10-21, at commit cd24924, using the screenshot pack.
> Citation markers carried no links and were removed. Verification by the maintainer agent is at the end.

# รายงานตรวจ UX การแสดงผล และ Workflow ของ Thai Street Designer ก่อนเข้าสู่ Phase 4A

## สรุปสำหรับผู้บริหาร

1. **ข้อสรุปหลัก: TSD ควรคง “2D plan เป็นหน้าทำงานหลัก” และไม่ควรเปิด 3D หรือแผนที่เต็มหน้าทันทีเมื่อเริ่มงาน** แต่หน้าแรกควรเปลี่ยนจาก blank canvas ที่มีเพียง hint เป็นตัวเลือกเริ่มงาน 3 ทางใน shell เดิม: **ค้นหาสถานที่บนแผนที่ / ใช้ภาพหรือผังอ้างอิง / เริ่มแบบว่าง**; แนวนี้รักษาหลัก one-workspace ของ TSD และใกล้กับวิธีที่ InfraWorks ให้เริ่มจากตำแหน่งจริงโดยไม่บังคับผู้ใช้ทุกคนเข้าสู่ map workflow.  
2. **Phase 3 ทำแกน road-first ได้ดีขึ้นมากแล้ว**: วาดถนน, auto-junction, typed length, snapping, pocket/Slip, Alternatives, comparison, export และ 3D อยู่ใน `/design` เป็นส่วนใหญ่; ไม่ควรรื้อสถาปัตยกรรมนี้ แต่ควรปิด UX debt ที่ยังทำให้ Golden Workflow หลักไม่สมบูรณ์.  
3. **GW-01 ยังไม่ถือว่าครบ** เพราะ “ทางเข้าโครงการ” ยังเป็นเพียงถนนสายรองที่ชนถนนหลัก และ “ช่องเปิดเกาะกลาง” ยังบังคับออกไปหน้า Advanced; ทั้งสองเป็นงานหลักใน Golden Workflow ที่ตั้งใจให้วิศวกรใหม่ทำได้โดยไม่อ่านคู่มือ. [ภาพ 05, 15–17]  
4. จึงแนะนำให้ **ย้าย driveway/access connection แบบ semantic ขั้นต่ำ และ median-opening/U-turn entry workflow ขึ้นมาก่อน Phase 4A** แต่ไม่ต้องย้าย engineering depth ทั้งหมดของ Phase 4F ขึ้นมา; เป้าหมายคือปิดเส้นทางหลัก ไม่ใช่ขยาย feature scope.  
5. **หน้า Advanced Junction ควรถูกรวมเข้า `/design`** อย่างน้อยในรูป focus state/drawer ก่อนหรือพร้อมต้น 4A เพราะสถาปัตยกรรม UX ที่โครงการอนุมัติไว้ระบุชัดว่า junction detail ต้องเป็น view/focus state ใน workspace เดียว ไม่ใช่ route ที่มีบริบทใหม่.  
6. **3D ควรเป็น review view ไม่ใช่ default authoring view**; เมื่อ 4A มาถึง 3D จะเริ่มมีคุณค่าทางวิศวกรรมจริงเมื่อแสดง profile, over/under, bridge/underpass, ramp level และ reference ground จากข้อมูลชุดเดียวกับ 2D/profile/export. ปัจจุบัน 3D เป็น renderer แบบฉายภาพจาก compiled surfaces และ workspace เริ่มที่ 2D.  
7. **แผนที่ไม่ควรเปิดอัตโนมัติในทุกงาน** แต่ควรเป็นเส้นทางเริ่มต้นที่เด่นเมื่อผู้ใช้ต้องการออกแบบตามสถานที่จริง; เมื่อเลือกเส้นทางนี้ให้ค้นหาสถานที่ก่อน แล้วล็อก reference หลังจัดตำแหน่ง. ปัจจุบัน map reference เริ่ม `enabled:false`, ใช้ OpenFreeMap Positron และมี search/opacity/move/lock แล้ว.  
8. **ยังไม่พบแหล่งภาพถ่ายความละเอียดสูงทั่วประเทศไทยที่พร้อมกันทั้ง “ฟรี, ไม่ใช้ key, coverage เชื่อถือได้ และมีสิทธิ์เหมาะกับการ trace ในผลิตภัณฑ์ลักษณะนี้”**; OpenAerialMap เปิดกว้างแต่ coverage เป็นรายพื้นที่, EOX Sentinel-2 ละเอียดไม่พอสำหรับงานถนนระดับช่องจราจร, และ VersaTiles Satellite นอกยุโรปโดยทั่วไปหยุดที่ประมาณ zoom 12.  
9. สำหรับ imagery เชิงพาณิชย์ **Mapbox และ MapTiler ไม่ควรถูกนำเสนอใน UI ว่า “วาดตามได้” โดยปริยาย**: Mapbox ให้ tracing สำหรับ OSM แต่ derivative เชิงพาณิชย์ต้องมี Commercial Satellite license; MapTiler Cloud อนุญาต derivative vector แบบ non-commercial/OSM และห้าม commercial tracing เว้นแต่มีข้อตกลงอื่น. Esri ให้ถือเป็น `TO_VERIFY` เพราะ World Imagery มี third-party imagery ที่อาจมีข้อกำหนดเพิ่มเติม.  
10. ลำดับที่เหมาะสมคือ **UX closure ก่อน 4A → elevation/crossing → ramps/diamond → station-based lane runs → interchange templates/engineering checks** โดยทุกระยะต้องรักษาหลัก “แก้ที่เดียว เห็นตรงกันใน plan/section/3D/export” และไม่เพิ่ม simulation, LOS หรือ score ซึ่งอยู่นอกขอบเขตผลิตภัณฑ์.

## หลักฐานและการตรวจหน้าจอปัจจุบัน

### ขอบเขตหลักฐาน

การตรวจครั้งนี้ยึด `main` ที่ commit `cd24924b...` วันที่ 21 ตุลาคม 2026 ซึ่งเป็น commit เพิ่ม map providers ล่าสุดตามหลักฐาน GitHub และใช้ชุดภาพหน้าจอที่แนบมาเป็นหลักฐาน visual หลัก.

ได้อ่านเอกสารที่ผู้ใช้กำหนดก่อนประเมิน ได้แก่ Golden Workflows, UX Architecture, Consolidation Roadmap Phase 4, independent review เดิม, game-UX/interchange research และ map-provider research เพื่อไม่รายงาน P0/P1/P2 เดิมที่ roadmap ระบุว่าแก้แล้วซ้ำอีกครั้ง.

**ข้อจำกัดสำคัญ:** สภาพแวดล้อมการวิจัยครั้งนี้ไม่สามารถควบคุมหน้า Deploy ผ่าน browser connector ได้ และชุดภาพระบุเองว่าเครื่องที่ถ่ายภาพ `24-map-panel.png` เข้า tile servers ภายนอกไม่ได้ ดังนั้นข้อสรุปว่า provider ใด “render ได้จริงบน `thai-street-designer.vercel.app` ณ วันนี้” ต้องระบุเป็น **TO_VERIFY** ไม่ควรตีความจากการมีโค้ด integration ว่า runtime ผ่านแล้ว การประเมิน UI ใช้ภาพ 01–26 เป็นหลัก ส่วน map service/terms ตรวจจากเอกสารต้นทางของแต่ละ provider

GitHub connector ส่งเนื้อหา source file ยาวเป็น JSON record บรรทัดเดียวในบางไฟล์ จึงไม่สร้าง line number เทียมขึ้นมา รายการที่ต้องการ source-code evidence ระบุชื่อไฟล์/ส่วนของไฟล์พร้อม file citation แทน; หลักฐาน visual ระบุชื่อภาพโดยตรง

### หน้าเปิดครั้งแรก

**[ข้อเท็จจริง]** ภาพ `01-first-open.png` แสดง canvas ว่าง, scenario Existing, tool rail, inspector และข้อความบอกให้เริ่มวาดถนน ผู้ใช้จึง “พอเดาได้” ว่าต้องกด Draw Road แต่ยังต้องตัดสินใจเองว่าควรเริ่มจาก blank, map หรือ reference image ทั้งที่ทั้งสามกรณีเป็น workflow ที่ผลิตภัณฑ์รองรับอยู่แล้ว. Golden Workflow เองกำหนดให้ GW-01 เริ่มจาก blank canvas หรือ calibrated site plan และกำหนด benchmark ว่าผู้ใช้ใหม่ควรทำ workflow หลักได้โดยไม่อ่าน documentation.

Streetmix ใช้แนวตรงข้ามคือเปิดด้วยถนนตัวอย่างที่แก้ได้ทันทีพร้อมคำเชิญให้ย้าย segment ซึ่งลด “blank-page problem”; InfraWorks Model Builder เริ่มจาก search location แล้วให้เลือก road/aerial view และพื้นที่โครงการ.

**[ข้อเสนอ]** สำหรับ TSD ไม่ควรคัดลอก Streetmix โดยโหลด “งานตัวอย่าง” เข้า Existing อัตโนมัติ เพราะในเครื่องมือวิศวกรรมวัตถุตัวอย่างอาจถูกเข้าใจผิดว่าเป็น project data ควรใช้ **start chooser แบบบาง ๆ บน canvas เดิม**:

| ตัวเลือกเริ่มงาน | พฤติกรรมที่แนะนำ |
|---|---|
| **ค้นหาสถานที่บนแผนที่** | เปิด map panel → focus ช่องค้นหา → เลือกสถานที่ → map lock หลังจัดแนว |
| **ใช้ภาพ/ผังอ้างอิง** | เปิด file picker → วางภาพ → บังคับ calibration ก่อนใช้เป็น reference เชิงระยะ |
| **เริ่มแบบว่าง** | ปิด chooser → arm Draw Road หรือแสดง CTA “วาดถนนสายแรก” |
| เปิดงานเดิม | อยู่ top bar ตามเดิม ไม่ต้องเป็น fourth project mode |
| ตัวอย่างการใช้งาน | เป็น help/demo แยก ไม่ผสมกับ Existing จริง |

Start chooser ควรหายทันทีเมื่อมี road/reference/map และไม่ควรกลับมาเป็น modal ขวางงาน

### ค่าเริ่มต้น 2D, 3D และลำดับการแสดงผล

**[ข้อเท็จจริง]** TSD เริ่ม `view='2d'`; Section Strip แสดงเมื่อเลือกถนนใน 2D และ 3D เป็น view แบบสลับแทน viewport เดิม. หลัก UX Architecture กำหนดไว้แล้วว่า 2D plan คือ primary authoring surface และ section/3D เป็น views ของ state เดียวกัน.

**[ข้อเสนอ]** ค่าเริ่มต้นนี้ถูกต้องและควรรักษาไว้:

| จอ | Default | 3D ที่แนะนำ |
|---|---|---|
| Desktop | 2D เต็มพื้นที่ | Toggle เป็น 3D; อาจเพิ่ม **Split** ภายหลังเมื่อ 4A เสถียร |
| ≤ 900 px | 2D + inspector drawer | 2D/3D แบบ exclusive toggle |
| โทรศัพท์ | Review/navigation เป็นหลัก | ไม่ควรพยายามแสดง inspector + 2D + 3D พร้อมกัน |
| Presentation | Saved 2D/3D views | ไม่ใช่ authoring mode ใหม่ |

ภาพ `25-narrow-820.png` แสดงว่า breakpoint ปัจจุบันที่เปลี่ยน inspector เป็น drawer เป็นแนวทางที่เหมาะสม และ CSS กำหนด behavior นี้ที่ `max-width:900px`. แต่ `26-phone-390.png` แสดงข้อจำกัดชัด: drawer กินพื้นที่เกือบทั้ง viewport จนการแก้ geometry แบบ precision ไม่ใช่ประสบการณ์ที่ดี จึงควรมอง **phone เป็น review/quick inspection target ก่อน full authoring** ไม่ควรลงทุนทำ full mobile CAD-like editing ก่อน Phase 4 core workflow เสถียร

3D ปัจจุบันอ่าน compiled junction/link surfaces, มี pan/orbit/fit/iso/top, ใช้ map texture บน ground plane และ renderer รองรับค่า `z` ที่ surface level บางส่วน แต่ road-first project ปัจจุบันยังไม่มี vertical-profile workflow ตามที่ Phase 4A จะเพิ่ม.

เมื่อเข้าสู่ 4A **3D จะมีคุณค่าต่อการตัดสินใจเมื่อทำให้สิ่งต่อไปนี้เห็นชัด**: ถนนใดอยู่บน/ล่าง, bridge/underpass extent, ramp profile, จุด merge/diverge, clearance ที่ “ยังไม่ตรวจ/ต้องตรวจ”, และ relation กับ reference ground—not เมื่อเพิ่มความสวยแบบ photorealistic เท่านั้น Autodesk InfraWorks เองแยก horizontal manipulation ใน plan และ vertical/profile manipulation โดยมี station/elevation/grade และ Profile View; Bentley ConceptStation ใช้ real-world context พร้อม horizontal/vertical alignments ที่แก้ได้.

ดังนั้น Phase 4A ควรให้ **Profile Strip สำคัญกว่า Split 3D**: เลือก road → plan ยังอยู่ → profile เปิดด้านล่าง → station tracker เชื่อมสองมุมมอง → 3D ใช้ตรวจ spatial relation หลังแก้เสร็จ

### Visual hierarchy และความสอดคล้อง

ภาพชุดปัจจุบันโดยรวมมี hierarchy ที่เหมาะกับ “calm engineering editor”: canvas สีอ่อน, road เด่น, active state สี accent, warning/danger แยกกัน และ Section Strip overlay ด้านล่างแทนการ resize plan; CSS ระบุ intention นี้โดยตรง.

อย่างไรก็ดี ก่อน Phase 4 ควรกำหนด display contract ชัดขึ้น:

**[ข้อเสนอ]**

- reference/map ต้องจางกว่า authored geometry เสมอ และ opacity ต้องปรับได้โดยไม่ลด contrast ของ selected geometry;
- snap halo, control handles และ active warning ควรเป็น **screen-space size** ไม่ย่อจนคลิกไม่ได้เมื่อ zoom out;
- label รอง เช่น station/annotation ควรแสดงตาม zoom และ selection แทนการแสดงทั้งหมดพร้อมกัน แนวคิดนี้สอดคล้องกับ InfraWorks ซึ่งเปลี่ยนระดับ annotation ตาม zoom และ selection.
- engineering warning ต้องไม่ใช้สีอย่างเดียว: icon + ข้อความสั้น + click-to-focus;
- เมื่อมี over/under ใน 4A plan ต้องมี bridge-mask/edge convention เดียวกันทั้ง screen และ export;
- **สีเขียวไม่ควรตีความว่า “ผ่านมาตรฐาน”** เว้นแต่ Phase 4E มี criterion/source ที่ตรวจสอบจริงตาม policy ของ roadmap.

เรื่อง consistency ปัจจุบันมีฐานดีเพราะ `/design` compile ไปยัง project เดียวแล้วส่งให้ plan/section/3D แต่ **feature coverage ยังไม่เท่ากัน**: advanced-junction objects บางชนิดยังต้องแก้ที่อีกหน้า, Section Strip เป็น road-context ใน 2D และ 3D มีบทบาท review มากกว่า authoring. [ภาพ 15, 17, 20–22] Phase 4 จึงควรใช้ parity test เป็น acceptance criterion: “เมื่อแก้ state X แล้ว plan/profile/3D/export ต้องอ่าน semantic state เดียวกัน” ไม่ใช่ทำ renderer แต่ละตัวแยก logic

## แผนที่ ภาพถ่าย และสิทธิ์ในการวาดตาม

### ประสบการณ์ที่แนะนำ

โค้ดปัจจุบันกำหนด map reference เริ่มปิด, center เริ่มที่กรุงเทพฯ, opacity 0.55 และ OpenFreeMap Positron เป็น basemap; panel มี place search, street/imagery switch, provider, opacity, move และ lock.

**[ข้อเสนอ]** ไม่ควรเปลี่ยนเป็น “เปิดแผนที่เสมอ” เพราะ:

1. งาน concept จำนวนหนึ่งเริ่มจาก site plan/survey/reference ที่มีสิทธิ์อยู่แล้ว;
2. external tile service อาจล่ม เปลี่ยน terms หรือไม่มีความละเอียดเหมาะกับพื้นที่;
3. reference map ไม่ใช่ engineering truth ตาม product principle ของ TSD เอง.
4. ระบบปัจจุบันยังเป็น local workspace metres + map offset มากกว่าจะเป็น full project CRS/georeferencing model

แต่เมื่อผู้ใช้เลือก **“เริ่มจากแผนที่”** ควรเปิด map ทันทีพร้อม focus search เพราะ InfraWorks แสดงให้เห็นว่า location-first เป็น interaction ที่เป็นธรรมชาติสำหรับ conceptual infrastructure model.

ปัจจุบัน `MapReference` มี lat/lng, zoom, opacity, `offsetX/Y` และ lock แต่ไม่มี project rotation/CRS semantic. ดังนั้นคำว่า “วางตรงตำแหน่งจริง” ใน TSD ตอนนี้ควรถือว่าเป็น **visual alignment** มากกว่า georeferenced engineering coordinate system

**[ข้อเสนอสำหรับ Phase 4 foundation]** เพิ่ม lightweight project georeference แยกจาก map renderer:

```text
ProjectGeoReference
  anchorLocal: { x, y }
  anchorGeographic: { lat, lng }
  rotationToNorth
  coordinateStatus: local | georeferenced
  source / note
```

ไม่จำเป็นต้องสร้าง GIS subsystem เต็มรูปแบบ แต่ข้อมูลนี้จะทำให้ north, map alignment, export orientation และอนาคต OSM/GeoJSON มี meaning เดียวกัน ขณะที่ reference image ยังคงใช้ transform ของตัวเองสำหรับ scale/rotation/translation ได้

### ตารางผู้ให้บริการ

คำว่า **“วาดตามได้ไหม”** ในตารางหมายถึงการใช้ imagery/map เป็นฐานแล้วสร้าง geometry ใหม่ใน TSD โดยเฉพาะในงานวิศวกรรมที่อาจเป็น commercial work ไม่ใช่เพียงการ “แสดงภาพบนจอ”

| แหล่ง | Key | สถานะใน TSD | คุณภาพ/ความเหมาะสมในไทย | เงื่อนไขสำคัญ | วาดตามใน TSD | เหมาะ default |
|---|---|---|---|---|---|---|
| **OpenFreeMap** | ไม่ใช้ | Positron/Bright/Liberty/Dark; Positron เป็น default provider | street/vector context; รายละเอียดขึ้นกับ OSM ไม่ใช่ aerial survey | บริการ public เป็น as-is และอาจเปลี่ยน/หยุดได้; ต้องรักษา attribution/licensing | **Reference ได้**; หาก digitize ข้อมูลจาก OSM โดยตรงต้องจัดการ ODbL/licensing ให้ถูกต้อง — ไม่ควรติดป้าย “free to trace” แบบไม่มีเงื่อนไข | **ใช่ สำหรับ street background** |
| **VersaTiles** | ไม่ใช้ | Colorful เป็น backup | OSM map เหมาะ context; satellite ของ VersaTiles **ยังไม่อยู่ใน TSD** และ global imagery นอกพื้นที่ high-res ไปได้ประมาณ z12 | demo server ฟรีแต่ไม่มี uptime guarantee และ rate-limit per IP | street reference: เงื่อนไข OSM; satellite: license ราย source ต้องดู attribution | Backup ดี ไม่ใช่ primary SLA |
| **OpenStreetMap Standard** | ไม่ใช้ | raster | street context; ไม่ใช่ aerial | OSMF ระบุ best-effort/no SLA, ต้อง attribution/cache และห้าม bulk/offline prefetch | ไม่ควรเรียกว่า unrestricted tracing; ถ้า derive OSM data ต้องจัดการ ODbL | ไม่แนะนำเป็น default production tile endpoint |
| **OpenTopoMap** | ไม่ใช้ | raster topo | มีประโยชน์ด้าน terrain/topographic context มากกว่ารายละเอียด carriageway | open map/attribution ตาม provider; ไม่ใช่ source สำรวจ | Reference เท่านั้นสำหรับ TSD UX | ไม่ |
| **OpenAerialMap** | ไม่ใช้ | imagery | อาจละเอียดสูงมากในบางพื้นที่ แต่ coverage เป็น community/local ไม่สม่ำเสมอ | imagery ใน OAM เป็น CC BY 4.0 พร้อม attribution; OAM ระบุชัดว่าใช้ trace สำหรับ OSM ได้ | **มีศักยภาพมากที่สุดในกลุ่ม open imagery**; สำหรับ derivative ใน TSD ให้ปฏิบัติตาม CC BY 4.0 และแสดง attribution; coverage ต้องตรวจรายโครงการ | ไม่—coverage ไม่แน่นอน |
| **EOX Sentinel-2 Cloudless 2016** | ไม่ใช้ | imagery | source resolution ระดับ Sentinel-2; ไม่เหมาะแยกขอบทาง/ช่องจราจร | EOX เปิด background service แบบ as-is; tracing permission ที่ระบุชัดเป็นกรณี OSM/non-commercial OSM editor | สำหรับ TSD commercial workflow: **TO_VERIFY**; ในทางปฏิบัติละเอียดไม่พออยู่แล้ว | ไม่ |
| **CARTO Positron/Voyager** | ใช้ key ของผู้ใช้ | street raster | street/context ไม่ใช่ high-res imagery | current basemap terms ห้ามสร้าง derivative works จาก Basemap Services ยกเว้น open-source components | **ไม่ควรใช้เพื่อ trace/copy map content** ตาม default terms | ไม่; OpenFreeMap ไม่มี key |
| **Mapbox Satellite** | access token | imagery | global satellite; resolution/recency ณ พื้นที่โครงการในไทย **TO_VERIFY** | Mapbox ระบุว่า trace imagery สำหรับ OSM ได้; commercial derivative vector จาก imagery ต้อง Commercial Satellite license | **ไม่ สำหรับ commercial TSD โดย default license**; ใช้ได้เมื่อผู้ใช้มีสิทธิ์เฉพาะ | ไม่ |
| **Esri Streets / World Imagery** | ArcGIS/Esri key | ทั้งสอง | World Imagery มี global/third-party sources แต่ resolution และ source ที่จุดจริงในไทย **TO_VERIFY** | Esri ระบุว่า third-party data/imagery อาจอยู่ภายใต้ license/restriction เพิ่มเติม | **TO_VERIFY ต่อ source/license**; ไม่ควรให้ UI รับรอง blanket permission | ไม่ |
| **MapTiler Satellite** | MapTiler key | imagery | high-resolution product แต่ความละเอียด/วันที่ของพื้นที่ไทยต้องตรวจจาก account จริง | Cloud terms อนุญาต derivative vector แบบ non-commercial/OSM; commercial tracing/derivation ถูกห้ามเว้นแต่มีสิทธิ์อื่น | **ไม่ สำหรับ commercial work ภายใต้ standard Cloud terms** | ไม่ |

แหล่งอ้างอิงหลักของตาราง: OpenFreeMap terms; OSM Tile Usage Policy; VersaTiles public-server/coverage docs; OpenAerialMap license; EOX service terms; CARTO Basemap terms; Mapbox imagery licensing; MapTiler Cloud terms; Esri third-party content terms.

### ข้อสรุปเรื่องภาพละเอียดฟรี

**[ข้อเท็จจริงจากแหล่งที่ตรวจได้]**

OpenAerialMap เป็น open imagery catalog ที่ licensed CC BY 4.0 แต่ความพร้อมขึ้นกับ imagery ที่มีผู้ upload ในพื้นที่นั้น ไม่ใช่ national orthophoto service ที่รับประกันประเทศไทย.

VersaTiles มี satellite raster แบบ open-data aggregation แต่เอกสารระบุว่า global coverage ไปถึงประมาณ zoom 12 และ high-resolution deep zoom ปัจจุบันอยู่ในกลุ่มประเทศยุโรปที่มี orthophoto เปิดเผยเป็นหลัก จึงไม่ใช่คำตอบสำหรับ lane-level tracing ในไทย.

EOX เปิด Sentinel-2 Cloudless layers เป็น background service แต่ resolution ระดับ Sentinel-2 เหมาะกับ geographic context มากกว่าการตีแนว curb/lane.

ดังนั้น **ไม่พบ source ที่ควรตั้งเป็น “ภาพถ่ายละเอียดฟรีของประเทศไทย” โดยปริยายใน TSD** ภายใต้เงื่อนไขที่ต้องการทั้ง no-key, dependable coverage และสิทธิ์ trace ที่เหมาะกับงานวิศวกรรม

**[ข้อเสนอผลิตภัณฑ์]** UX ที่เหมาะกว่าคือ:

> **แผนที่ถนนฟรีสำหรับ orientation + ภาพ/ผังที่ผู้ใช้มีสิทธิ์สำหรับ precision + imagery commercial แบบ BYO key/license**

ใน imagery selector ควรแสดง badge ที่เป็นข้อเท็จจริง เช่น `OPEN / COVERAGE VARIES`, `USER KEY`, `TRACE RIGHTS: TO_VERIFY` แทนการใช้คำว่า “ภาพความละเอียดสูง” โดยไม่มี legal/coverage context

และหากผู้ใช้ใส่ Mapbox/MapTiler/Esri key ควรเก็บใน browser ตามที่ระบบทำอยู่แล้ว ไม่บันทึกลง project file.

## ผลตรวจ Golden Workflows

จำนวน action ด้านล่างใช้เฉพาะตัวเลขที่มีหลักฐานจาก UX baseline ของ repository หรือ interaction ที่ชัดเจนจาก screenshot; **ไม่รวมตัวเลขคาดเดาเพื่อให้ดูแม่นยำ** กติกาของ baseline คือหนึ่ง click, drag, keyboard command หรือ committed field edit เป็นหนึ่ง action และ automatic system work ไม่นับ.

### GW-01 — Project access improvement

**สถานะรวม: ทำได้บางส่วน** เพราะขั้น driveway และ median opening ยังไม่อยู่ใน workflow หลักตาม semantic ที่ Golden Workflow ต้องการ

| ขั้น | สถานะ | หลักฐาน / action / จุดสะดุด | สิ่งที่หน้าจอสื่อ | ข้อเสนอ |
|---|---|---|---|---|
| เริ่ม blank หรือ calibrated site plan | **ครบ** สำหรับสองกรณีใน GW | [ภาพ 01, 23] calibration มีอยู่; blank เริ่มได้ทันที | เข้าใจ scale/reference ได้ แต่ first-open ยังไม่ช่วยเลือกวิธีเริ่ม | Start chooser 3 ทาง |
| วาด main road | **ครบ** | [ภาพ 02–04]; baseline: road ปกติประมาณ **3 actions** = tool/start/finish; exact-length continuation วัดไว้ **5 actions** เพราะ Enter สำหรับวาง point และ Enter เพื่อ finish | readout ความยาว/มุม/snap ดี [ภาพ 03] | คง interaction; พิจารณา Enter behavior ให้ predictable ขึ้น |
| Apply divided-road preset | **ครบ** | [ภาพ 02,04] | หน้าตัดเห็นทั้ง inspector/section strip | คงไว้ |
| Add driveway/access | **บางส่วน** | [ภาพ 05] ต้องวาด road อีกเส้นและได้ T-junction; README ของชุดภาพระบุว่าไม่มี driveway tool | ภาพดูคล้าย access แต่ semantic เป็น junction/road ทั่วไป | เพิ่ม `Project access / driveway` เป็น connection object/road role ขั้นต่ำ |
| Right-turn pocket | **ครบ** | [ภาพ 06–07]; scripted benchmark เพิ่ม pocket + typed storage = **4 actions** จาก approach selection | storage/handle เห็นทันที | คง direct+numeric model; เพิ่ม taper/width inline ให้ครบจุดสำคัญ |
| Median opening | **บางส่วน** | ไม่มีใน `/design`; [ภาพ 15–17] ต้องเข้า Advanced | ผู้ใช้สูญบริบท workspace และไม่เห็น feature discovery จาก road workflow | ย้าย command/control เข้า `/design` ก่อน 4A |
| Review markings | **ครบสำหรับ generated marking ที่มีอยู่** | [ภาพ 08] | ผลเกิดทันที เหมาะ concept review | advanced detach/manual markings คงเป็น Phase 5 |
| Same design in 3D | **ครบเชิง viewing; จำกัดเชิง engineering** | [ภาพ 09]; 1 toggle จาก 2D | เห็น massing/surface แต่ปัจจุบัน flat | 4A เพิ่ม elevation/structure/profile parity |
| Duplicate Alternative | **ครบ** | [ภาพ 10]; baseline ระบุสร้าง Alternative และ comparison เปิดอัตโนมัติ | active scenario ชัด | คง |
| Compare | **ครบ** | [ภาพ 10] highlight + difference list | สื่อ changed objects ได้ดี | เพิ่ม footprint/station deltas ใน 4C |
| Export plan | **ครบ** | [ภาพ 11]; baseline = **2 actions** | PNG/SVG/report discoverable | map/reference attribution ต้องตรวจเมื่อถูก export |

**เทียบโปรแกรมจริง:** InfraWorks Model Builder ให้ search location ก่อนสร้าง model และ InfraWorks component roads ใช้ in-canvas manipulators + numeric vertical/profile editing; pattern ที่ควรรับมาคือ context-first และ direct+exact ไม่ใช่ความซับซ้อนของ CAD. Streetmix แสดงว่าผู้ใช้เข้าใจ section composition ได้เร็วเมื่อมี object ให้ manipulate ทันที แต่ไม่ควรนำ throughput score หรือ assumptions ของ Streetmix มาใช้กับ TSD.

**คำตัดสิน UX:** GW-01 เป็น workflow ที่ควรปิด gap ก่อน 4A เพราะเป็น benchmark หลักของผลิตภัณฑ์เอง ไม่ควรให้ phase “engineering depth” ใหม่เริ่มบน workflow หลักที่ยังต้องปลอม driveway และออกไปอีก route เพื่อเปิด median

### GW-02 — Intersection improvement

**สถานะรวม: ทำได้บางส่วน**

| ขั้น | สถานะ | หลักฐาน / actions | จุดสะดุดและข้อเสนอ |
|---|---|---|---|
| วาดสองถนนตัดกัน / auto junction | **ครบ** | [ภาพ 12]; baseline ปัจจุบัน **6 actions รวมสอง road** | feedback “Undo / ทำเป็นทางต่างระดับ” ดีมากและควรต่อยอดตรง 4A |
| Per-corner radius | **ครบ** | [ภาพ 13] radius รายมุม + plan handles | direct manipulation เหมาะแล้ว |
| Turn pocket | **ครบ** | [ภาพ 06–07] | อยู่ใน `/design` ถูกทิศทาง |
| Slip lane | **ครบ** | [ภาพ 14] | อยู่ใน context ของ approach |
| Islands | **บางส่วน** | [ภาพ 15] อยู่ Advanced | รวมเป็น Junction focus state |
| Stop lines / crossings | **บางส่วน** | [ภาพ 15] Advanced | รวมใน-place; progressive disclosure |
| Signals | มี capability แต่ไม่ใช่ core ของ GW นี้ | [ภาพ 15] | อย่าให้ clutter basic inspector |
| Compare Alternative | **ครบ** หลังกลับ `/design` | [ภาพ 10,17] | route switch ยังเป็น friction |

InfraWorks component roads เมื่อ intersect สามารถสร้าง intersection context และให้แก้ geometry ผ่าน in-canvas/road editing แทน workflow แบบ object editor แยกโลกกัน; นี่สนับสนุนทิศทาง one-shell ที่ TSD กำหนดไว้แล้ว.

**ข้อเสนอรูปธรรม:** เมื่อเลือก junction ให้ inspector มี summary ก่อน แล้วมี action “รายละเอียดทางแยก” ที่เปลี่ยน **focus state ภายใน `/design`**: plan ยังอยู่ตำแหน่งเดิม, scenario เดิม, undo stack เดิม, keyboard mode เดิม; toolbar เฉพาะ junction จึงค่อยเผย islands/crossings/stop lines/median opening/lane connections

### GW-03 — Road widening

**สถานะรวม: ทำไม่ได้ครบตามนิยาม GW**

[ภาพ 18–19] แสดงว่าเปลี่ยนหน้าตัดทั้ง road จาก 4 เป็น 6 lanes ได้ แต่ [ภาพ 20] station-based section ปัจจุบันเป็นการดูเป็นหลัก และ roadmap เองเลื่อน station-based lane transitions ไป Phase 4C.

ดังนั้น:

| ความสามารถ | สถานะ |
|---|---|
| เลือก road / inspect section | ครบ |
| เปลี่ยนทั้งเส้น 4 → 6 lanes | ครบ |
| กำหนดจุดเริ่ม/จบ widening ตาม station | **ยังไม่ได้** |
| shoulder/sidewalk transition ตาม station | **ยังไม่ได้** |
| แสดง footprint change ของ transition จริง | **ยังไม่ได้ เพราะ geometry ต้นเหตุยังสร้างไม่ได้** |

ไม่ควรถือการเปลี่ยนทั้งเส้น 4→6 เป็น “ผ่าน GW-03” เพราะโจทย์ Golden Workflow ระบุ transition along station โดยตรง.

ในเครื่องมือ Autodesk, widening region ของ alignment มี start/end station และ transition, และ InfraWorks component-road workflow สนับสนุนการแก้ geometry/components ตามตำแหน่งบน road; แนว pattern ที่ควรนำมาใช้คือ “เลือก road → เลือกช่วง → parameterize transition” ไม่ใช่สร้าง road ซ้อนอีกเส้น.

**ข้อเสนอ 4C:** บน selected road เพิ่ม contextual action `เพิ่ม/ลดช่องจราจร` → คลิก/กรอก station start/end → ghost footprint → commit → Section Strip แสดง station tracker และ transition band; lane run ที่ได้ต้องเป็น ordinary editable run ไม่ใช่ opaque template ตามหลัก Phase 4.

### GW-04 — Median opening / U-turn

**สถานะรวม: ทำได้บางส่วน**

Median opening มีอยู่จริงใน Advanced editor [ภาพ 16] และ round trip กลับ `/design` ถูกเก็บเป็นหนึ่ง undoable step [ภาพ 17] ซึ่งดีกว่าสถานะใน independent review ก่อนหน้า แต่ entry point ยังไม่สอดคล้อง one-workspace. Roadmap ปัจจุบันยังวาง Project access/U-turn engineering depth ไว้ 4F.

สิ่งที่ **ยังไม่ควรสรุปว่าครบ** คือ U-turn treatment ในความหมาย semantic workflow ที่ผู้ใช้สร้างจาก divided road + opening + pocket แล้วเห็น/แก้เป็นหน่วยเดียวใน `/design`; หลักฐานที่มีแสดง median opening ไม่ใช่ end-to-end U-turn authoring

**ข้อเสนอ:** ก่อน 4A ย้าย **entry-level median opening/U-turn command** เข้า `/design`; แต่ detailed options/catalog และ standards-referenced checks ยังอยู่ Phase 4F/4E ได้ ไม่มีเหตุผลต้องแต่งค่ารัศมี, storage, taper หรือ clearance ใดขึ้นมาเอง—ค่าที่จะใช้เป็น criterion ต้องอ้างหน่วยงานไทย/AASHTO ตาม standards policy ของโครงการ.

สำหรับ equivalent professional workflow ที่เฉพาะเจาะจงถึง “Thai-style median U-turn treatment” ในเครื่องมือเปรียบเทียบที่ตรวจครั้งนี้: **ยังไม่ยืนยัน** จึงไม่อ้างว่ามีคำสั่งตรงกัน

### GW-05 — Urban street

**สถานะรวม: ทำได้บางส่วน**

[ภาพ 21] แสดงการเพิ่ม bicycle band และ section composition; [ภาพ 22] แสดง 3D ของ state หลังเพิ่ม band แต่ชุดภาพระบุชัดว่า parking, trees และ lighting ยังไม่มีใน `/design`

| องค์ประกอบ GW-05 | สถานะปัจจุบัน |
|---|---|
| Traffic lanes | ครบ |
| Bike facility | มีบางรูปแบบ |
| Sidewalk/verge | มีองค์ประกอบพื้นฐาน |
| Parking | ยังไม่ครบใน `/design` |
| Trees | ยังไม่ครบใน `/design` |
| Lighting | ยังไม่ครบใน `/design` |
| plan/section/3D sync | ทำได้สำหรับ subset ที่ model/render รองรับ |

Streetmix เป็น comparator ที่ตรวจสอบได้สำหรับ **interaction pattern ของ cross-section composition** เพราะหน้าเริ่มต้นมี sidewalk, tree, lamp, drive lane, turn lane, parking และ bike lane เป็น segments ที่ manipulate ได้โดยตรง. Bentley ConceptStation ใช้ road templates และ real-world context สำหรับ concept-stage corridor design.

**ข้อเสนอ:** อย่ารีบขยาย palette ก่อน 4A เพราะ trees/lighting ไม่ใช่ dependency ของ interchange ให้รักษา GW-05 เป็น “partial but non-blocking”; เมื่อกลับมาทำ ให้ใช้ Section Strip เดิมเป็น composition surface ไม่สร้างหน้า Urban Street แยก

### GW-06 — Presentation

**สถานะรวม: ทำได้บางส่วน**

[ภาพ 23] ยืนยัน reference image + calibration, [ภาพ 24] map panel, [ภาพ 10] compare และ [ภาพ 11] export PNG/SVG/report

สิ่งที่ยังขาดจาก Golden Workflow ตามตัวอักษรคือ **explicit engineering/presentation display mode** และ map runtime ของ external providers ยังไม่ได้รับการยืนยันจากสภาพแวดล้อมที่ตรวจครั้งนี้. Golden Workflow กำหนด “dim the reference, switch engineering/presentation display, export Existing vs Proposed”.

InfraWorks มีแนวคิดการเปิด/ปิด road geometry/annotations และระดับรายละเอียดของ annotation เปลี่ยนตาม zoom; Bentley แยก visualization ของ model ออกจาก core geometry.

**ข้อเสนอ:** ไม่จำเป็นต้องสร้างสอง renderer ให้เพิ่ม display profiles ที่ใช้ geometry เดียวกัน:

- **Engineering:** handles, stations, warning, dimensions, selected object, profile indicators
- **Presentation:** ซ่อน handles/guides/warnings ที่ไม่จำเป็น, เพิ่ม labels/legend ที่เลือกไว้, reference opacity ตาม saved view
- Export ต้องเลือก profile โดย explicit option ไม่เปลี่ยน state วิศวกรรมของ project

## ทิศทาง Phase 4 และการรวม Workflow ใหม่

### ควรย้าย driveway และ median opening/U-turn มาก่อน 4A หรือไม่

**ข้อเสนอ: ควรย้าย “ขั้นต่ำที่ทำให้ workflow ครบ” ขึ้นมา แต่ไม่ย้าย Phase 4F ทั้งก้อน**

เหตุผลมีสามชั้น

**ชั้น UX:** GW-01 คือ primary workflow และ first-usability benchmark ของโครงการ แต่ปัจจุบันผู้ใช้ต้องสร้าง driveway ด้วย road+T-junction และออกไปอีก route เพื่อ median opening.

**ชั้นสถาปัตยกรรม:** หากเริ่มสร้าง vertical profile, grade-separated crossing, ramp และ merge/diverge บน shell ที่ junction detail ยัง split เป็นสอง route จะยิ่งมี state/context มากขึ้น และทำให้การ merge ภายหลังแพงกว่าเดิม

**ชั้น scope:** 4A ไม่ได้ต้องการ full driveway engineering model เพื่อคำนวณ elevation ดังนั้นไม่ควรทำ detailed driveway/U-turn catalogue หรือ standards checks ขึ้นมาก่อนโดยไม่จำเป็น

ขอบเขตก่อน 4A ที่เสนอจึงมีเพียง:

```text
Project access / driveway
  - สร้างจาก side of selected road
  - ชนิด semantic ชัด ไม่ปลอมเป็น generic junction
  - direct width/alignment edit ขั้นพื้นฐาน
  - undo / scenario / export parity

Median opening
  - สร้าง/เลือก/ย้ายใน /design
  - contextual U-turn treatment entry
  - pocket ที่มีอยู่เชื่อม workflow ได้
  - advanced parameters เปิดแบบ progressive disclosure
```

ค่ามาตรฐานทั้งหมดที่ไม่ได้มี source register ยืนยันให้แสดงเป็น **TO_VERIFY** หรือ design value ที่ผู้ใช้ป้อน ไม่ติดสถานะ “ผ่านมาตรฐาน”

### ทิศทางการรวม Advanced Junction

**ข้อเสนอ: ควรรวม และควรถือเป็นงานก่อน/ขนานกับต้น 4A ไม่ใช่ housekeeping ภายหลัง**

Roadmap ยอมรับแล้วว่า `/junction` → `/design` consolidation เป็น carried-forward track และ UX Architecture ระบุชัดว่า junction detail “never separate pages with their own headers”.

รูปแบบที่แนะนำไม่ใช่ยัด control ทั้งหมดลง right inspector 320 px แต่เป็น **focus state**:

```text
Top bar          เหมือนเดิม: Project / Scenario / Undo / View / Export

Tool rail         เหมือนเดิม
                  Select · Pan · Road · Mark ...

Plan             ยังคงตำแหน่ง/zoom/scenario เดิม
  └ selected junction ถูก focus
     ├ corner handles
     ├ approach controls
     ├ island / crossing / stop-line targets
     └ lane connection overlays เมื่อเปิด Advanced เท่านั้น

Inspector
  ทางแยก
  - key properties
  - approaches
  - quick actions
  - รายละเอียดขั้นสูง ▾

Context strip
  [เรขาคณิต] [ทางข้าม/เส้นหยุด] [เกาะ] [ช่องเปิดเกาะกลาง] [Lane connections]

Esc → ออกจาก subtool
Back/focus close → กลับ selection ปกติ
```

ข้อสำคัญคือ **advanced lane connector ใน 4C ต้องเข้ามาอยู่ focus state นี้ตั้งแต่แรก** ไม่ควรสร้าง third editor ใหม่

### Phase 4A — elevation และ grade separation

Roadmap กำหนด `z` by station, structure runs, crossing relation at-grade/A-over-B/B-over-A/unresolved และ parity 2D/3D/section/export อยู่แล้ว ซึ่งเป็น foundation ที่ถูกต้อง.

**UX flow ที่เสนอ**

```text
Draw roads ตามเดิม
   ↓
ถนนตัดกัน
   ↓
ระบบสร้าง at-grade junction ตามเดิม
 + Toast: Undo | ทำเป็นทางต่างระดับ
   ↓
"ทำเป็นทางต่างระดับ"
   ↓
Inline choice:
 [ถนน A อยู่บน] [ถนน B อยู่บน]
   ↓
Preview plan + profile + 3D relation ทันที
   ↓
Crossing inspector:
 - relation
 - structure run
 - design elevations/profile
 - checks: geometry / TO_VERIFY / referenced
```

นี่รักษา muscle memory ของ Phase 3: ผู้ใช้ไม่ต้องเลือก “Draw Bridge” ก่อนรู้ว่าต้องการ bridge แต่เปลี่ยน semantic ของ crossing ที่เกิดขึ้นแล้ว

ใน 2D ต้องมี explicit occlusion convention: upper road continuous; lower roadถูก mask ณ crossing พร้อม bridge/structure cue และ selection hit-test ต้องรู้ว่าผู้ใช้กำลังชี้ upper หรือลower road ไม่ใช่แค่ z-order ทางกราฟิก

ใน Profile Strip ให้แก้ station/elevation จาก object เดียวกับที่ 3D อ่าน Autodesk InfraWorks แสดง pattern ที่ตรวจสอบได้ว่า vertical geometry สามารถแก้ด้วย drag manipulators หรือค่าตัวเลข และ Profile View แสดง station/elevation/ground relation ได้.

### Phase 4B — ramp / merge / diverge

อย่าสร้าง ramp เป็น “symbol ของ interchange” ให้เป็น road-like authored entity ตาม roadmap.

Flow ที่ควรต่อจาก Phase 3:

```text
เลือก side ของ mainline
 → + ทางเชื่อม
 → เลือก ออก / เข้า
 → hover ปลายทางหรือ road side
 → ghost ramp
 → valid = normal preview
   invalid = red + เหตุผล
 → commit
 → ramp เป็น ordinary selectable/editable object
```

หลัง commit ให้ merge/diverge anchor แสดงเมื่อเลือกเท่านั้น ไม่ควรมี node symbols เต็มจอใน normal view

Diamond template ใน 4B ควรเป็น **accelerator**:

```text
สร้างทางต่างระดับ → Diamond
→ preview ทั้ง interchange
→ mirror / side options
→ commit ครั้งเดียว
→ แตกเป็น roads + ramps + anchors + profiles
→ แก้แต่ละชิ้นต่อได้
```

ไม่ควรสร้าง “Diamond Interchange object” ที่ต้องกลับเข้า template dialog เพื่อแก้ทุกอย่าง เพราะจะขัดกับ road-first interaction vocabulary

### Phase 4C — lane runs ตามระยะทาง

GW-03 และ ramp workflow ต้องใช้ความสามารถเดียวกัน ไม่ควรมี “turn-lane transition system” กับ “ramp acceleration lane system” คนละชุด

**ข้อเสนอ data/UX concept เดียว:**

```text
LaneRun
  parentRoad
  stationStart
  stationEnd
  lateralRole
  transitionIn
  transitionOut
  connection anchors
```

UI:

```text
เลือก road
 → + เพิ่ม/ลดช่องจราจร
 → กำหนดช่วงด้วย handles หรือ station
 → preview footprint
 → fields และ handles แก้ค่าเดียวกัน
 → section tracker แสดงหน้าตัด ณ station
```

นี่สอดคล้องกับหลัก UX Architecture “direct manipulation and numeric entry edit the same property” และช่วย GW-03, turn pockets และ Phase 4B acceleration/deceleration lanes พร้อมกัน.

### Contract ระหว่าง 2D, section, 3D และ export

แนะนำให้ Phase 4 เพิ่ม acceptance matrix แบบบังคับสำหรับทุก semantic object:

| Object/edit | Plan | Profile/Section | 3D | Export | Undo |
|---|---|---|---|---|---|
| road elevation | ✓ | ✓ | ✓ | ✓ | 1 transaction |
| A-over-B crossing | ✓ | ✓ | ✓ | ✓ | 1 |
| bridge run | ✓ | ✓ | ✓ | ✓ | 1 |
| ramp | ✓ | ✓ | ✓ | ✓ | 1 |
| merge/diverge | ✓ | relevant lane/station | ✓ | ✓ | 1 |
| lane add/drop | footprint | section change by station | ✓ | ✓ | 1 |
| median opening | ✓ | section where relevant | ✓ | ✓ | 1 |
| driveway | ✓ | road section where relevant | ✓ | ✓ | 1 |

“✓” ในตารางนี้เป็น **ข้อเสนอ acceptance target** ไม่ได้หมายความว่าปัจจุบัน implement แล้ว

## ช่องว่างที่ควรจัดลำดับก่อนพัฒนาต่อ

### ตาราง Gap และลำดับความสำคัญ

| ลำดับ | Gap | เหตุผล | ขอบเขตที่แนะนำ | สิ่งที่ไม่ทำในระยะนี้ |
|---|---|---|---|---|
| **ก่อน 4A** | First-open ไม่มี start-path choice | ผู้ใช้ใหม่ยังต้องอนุมานเองว่าจะเริ่ม map/image/blank | Start chooser 3 ทางใน shell เดิม | ไม่สร้าง project wizard หลายหน้า |
| **ก่อน 4A** | Driveway ไม่มี semantic workflow | GW-01 primary path ยังต้องปลอมเป็น T-junction | Minimal project access connection | ไม่ทำ access standards catalogue เต็ม |
| **ก่อน 4A** | Median opening/U-turn อยู่ Advanced route | GW-01/GW-04 ไม่ one-workspace | contextual command ใน `/design` | ไม่ hard-code criteria |
| **ก่อน 4A** | Advanced Junction ยังเป็น route แยก | ขัด UX Architecture และจะซับซ้อนขึ้นเมื่อเพิ่ม grade separation | Merge เป็น junction focus state อย่างน้อย crossings/islands/stop/median | ไม่เปิด advanced controls ตลอดเวลา |
| **ก่อน 4A** | Map เป็น visual offset มากกว่า project georef | 4A/exports จะเริ่มต้องรู้ orientation/context | lightweight anchor + north rotation + georef status | ไม่ทำ GIS/CRS suite เต็ม |
| **ก่อน 4A** | Provider permission ไม่ชัดใน UI | เสี่ยงให้ผู้ใช้คิดว่า “เลือก imagery แล้ว trace ได้” | license-status copy + TO_VERIFY state | ไม่ตีความ legal rights แทนผู้ใช้ |
| **ก่อน 4A** | Phone authoring หนาแน่นเกินไป | 390 px inspector ครอบ canvas | review-first mobile behavior | ไม่ทำ full mobile editor |
| **ระหว่าง 4A** | ไม่มี shared vertical profile | core dependency ของ grade separation | z(s), structure, relation, profile strip | ไม่ใส่ค่ามาตรฐานเดาเอง |
| **ระหว่าง 4A** | 3D ยังไม่ใช่ engineering review of levels | flat 3D ให้คุณค่าเชิงตัดสินใจจำกัด | over/under/bridge/profile parity | ไม่เน้น photorealism |
| **ระหว่าง 4A** | ไม่มี explicit over/under plan language | crossing อาจอ่านผิดใน 2D/export | masks/bridge cues/selection order | ไม่ใช้สีอย่างเดียว |
| **ระหว่าง 4B** | ไม่มี end-to-side ramp + merge/diverge | diamond dependency | ramp gesture + ghost preview + anchors | ไม่ทำ interchange simulator |
| **ระหว่าง 4C** | ไม่มี station lane runs | GW-03 และ ramp auxiliary lanes ติดค้าง | shared lane-run editing | ไม่แยกระบบ taper หลายชุด |
| **ระหว่าง Phase 4** | view parity ยังไม่เป็น test contract | feature ใหม่เสี่ยงแสดงไม่ตรงกัน | plan/profile/3D/export parity tests | — |
| **ภายหลัง** | Split 2D/3D | useful หลัง profile model เสถียร | optional desktop split | ไม่เป็น default |
| **ภายหลัง** | Full urban furniture | ไม่เป็น dependency ของ interchange | parking/tree/light palette | ไม่เบียด 4A–4C |
| **ภายหลัง** | Longdo/GISTDA หรือ imagery source เพิ่ม | terms/technical reuse ยังไม่ยืนยัน | เพิ่มเมื่อมี written terms | สถานะ `TO_VERIFY` จนกว่าจะยืนยัน |
| **ภายหลัง** | Full phone authoring | ต้นทุนสูงและ precision ต่ำ | ทำเมื่อ core workflows mature | — |

### Roadmap ที่แนะนำแบบสั้น

**UX Closure ก่อน 4A** ควรเป็น slice เล็ก ไม่ใช่ phase ใหญ่: start chooser, semantic driveway ขั้นต่ำ, in-design median opening, merge Advanced Junction shell, map/legal/georef state และ mobile review fallback

**4A** ดำเนินตาม roadmap เดิม: profile + structure + crossing relation โดยเพิ่ม Profile Strip และ unified display contract.

**4B** diamond/ramp แต่ใช้ interaction vocabulary เดิมของ road editor: snap, ghost preview, direct manipulation, numeric fields, single undo

**4C** lane runs ทำเป็น shared primitive สำหรับ widening, auxiliary lane, ramp merge/diverge และ turn-pocket lifecycle

**4D/4E** template เพิ่มและ standards-referenced checks หลัง primitives เสถียร; status ทุก criterion ที่ไม่มีแหล่งต้องเป็น `TO_VERIFY` ตาม roadmap ไม่ใช่ “ผ่านมาตรฐาน”.

### KPI UX ที่ควรใช้ต่อ

TSD มีระบบนับ actions อยู่แล้วและ Phase 3 มี baseline จริง: auto-junction สอง road = 6 actions, exact-length continuation = 5, pocket+typed storage = 4, export figure = 2 ภายใต้ counting rule ของโครงการ.

ไม่ควรตั้งตัวเลข Phase 4 ใหม่เป็น “มาตรฐานอุตสาหกรรม” เพราะไม่มีฐานรองรับ แต่ควรวัดก่อน/หลัง implementation เช่น:

| Task ที่ควร benchmark | สิ่งที่วัด |
|---|---|
| First project → road แรกบน map | actions, backtracks, “ไม่รู้จะกดอะไร” |
| Existing crossing → grade separation | actions ถึงเห็น over/under ใน 2D+3D |
| Create diamond | actions ตั้งแต่ crossing ถึง editable ramps |
| Add acceleration/deceleration lane | actions + page switches |
| 4→6 lane widening over station interval | actions + numeric/direct consistency |
| Median opening + U-turn treatment | page switches ต้องเป็น **0** |
| Advanced junction edit | route changes ต้องเป็น **0** |
| Compare + export | ต้องไม่ regress จาก current short path |

เกณฑ์สำคัญกว่าจำนวน click ล้วนคือ **ไม่มี unexpected page change, ไม่มี duplicated state, ไม่มี view mismatch และทุก generated result แก้ต่อได้**

## ข้อสรุปและข้อจำกัดที่ยังต้องตรวจ

**คำตัดสินโดยรวม: `PASS WITH CONDITIONS` สำหรับการเดินหน้า Phase 4A**

TSD ไม่ได้มีปัญหาพื้นฐานที่ต้องกลับไป redesign ทั้งผลิตภัณฑ์ Road-first workspace, automatic junction, contextual approach editing, alternatives, undo, section strip และ current 2D-first choice เป็นฐานที่เหมาะกับ concept design แล้ว.

เงื่อนไขสำคัญคือ **อย่าปล่อย UX debt จาก Phase 3 ให้กลายเป็น interaction model ของ Phase 4** โดยเฉพาะ Advanced Junction route, fake driveway และ median-opening detour หากเพิ่ม elevation/ramp/lane-run บนโครงนี้ก่อน ผู้ใช้จะต้องเข้าใจทั้ง object model ใหม่และ navigation model เก่าในคราวเดียว

หน้าจอเริ่มต้นที่แนะนำจึงเป็น:

> **2D workspace เดิม + start chooser “แผนที่ / ภาพผัง / แบบว่าง” → เมื่อเลือกแผนที่ให้ search location ก่อน → reference จางและ lock ได้ → 3D เป็น review toggle → selected road เปิด Section/Profile strip ตาม context**

นี่ต่างจากการทำ “dashboard” หรือ “game home screen”; ยังคงตรงกับ character ที่ UX Architecture กำหนดว่าเป็น calm, precise, compact engineering editor.

สำหรับ 3D เป้าหมายระยะใกล้ไม่ควรเป็นความสวย แต่เป็น **ตอบคำถามที่ 2D อย่างเดียวตอบยาก**: ถนนใดอยู่บน, ระดับต่างกันเท่าใดตามค่าที่ผู้ใช้สร้าง, structure เริ่ม/จบตรงไหน, ramp ขึ้นลงอย่างไร และ state ใด “ยังต้องตรวจมาตรฐาน” Bentley และ Autodesk แสดงให้เห็นว่า concept-stage infrastructure tools ได้ประโยชน์จาก real-world context, editable vertical geometry และ profile/3D visualization โดยไม่จำเป็นต้องเปลี่ยน plan authoring ให้เป็น 3D-first.

เรื่อง map ควรตัดสินเชิงผลิตภัณฑ์อย่างระมัดระวังที่สุด: **OpenFreeMap เหมาะเป็น free street background default เมื่อผู้ใช้เปิด map แต่ไม่ควรเปิด map ให้ทุกงานโดยอัตโนมัติ**; OpenStreetMap public tiles ไม่ควรถูกถือเป็น guaranteed production infrastructure เพราะ OSMF ระบุชัดว่า best-effort/no SLA; VersaTiles public server ก็ระบุว่าเป็น demo ไม่มี guarantee.

สำหรับ precision imagery ให้ TSD สนับสนุนสองเส้นทางอย่างตรงไปตรงมา: **ผู้ใช้นำ survey/site-plan/aerial image ที่ตนมีสิทธิ์มาเอง** หรือ **ผู้ใช้ใส่ key/license ของ provider ของตนเอง**; อย่าสัญญาว่ามี free nationwide high-resolution Thailand imagery เมื่อหลักฐานที่ตรวจยังไม่สนับสนุนข้อสรุปนั้น

รายการที่ยังเป็น **TO_VERIFY** หลังการวิจัยครั้งนี้มีสี่เรื่อง: การ render จริงของ provider แต่ละรายบน Vercel deployment ณ วันที่ตรวจ, exact imagery resolution/age ที่ตำแหน่งเฉพาะในประเทศไทยของ Mapbox/Esri/MapTiler, สิทธิ์ tracing ของ Esri World Imagery ที่ต้องไล่ตาม source attribution ณ ตำแหน่งจริง, และเงื่อนไข Longdo/GISTDA ซึ่งยังไม่มีหลักฐานเพียงพอในการตรวจครั้งนี้ ไม่ควรเปลี่ยน `TO_VERIFY` เหล่านี้เป็น product claim จนกว่าจะตรวจจากบริการ/สัญญาต้นทางโดยตรง.

**ข้อเสนอสุดท้าย:** ปิด UX Closure ขนาดเล็กก่อน 4A แล้วเดินหน้าตาม Phase 4 เดิม ไม่ต้องรื้อ roadmap—แต่ให้ทุก feature ใหม่ผ่านกฎเดียว: **สร้างใน canvas เดิม, preview ก่อน commit, direct + exact แก้ค่าเดียวกัน, one undoable transaction, ไม่บังคับเปลี่ยนหน้า, และ state เดียวกันต้องอ่านตรงกันใน 2D / section-profile / 3D / export**. หลักนี้ต่อยอดสิ่งที่ TSD ทำดีอยู่แล้วและป้องกัน Phase 4 จากการกลายเป็นชุด editor ย่อยหลายโลก.

---

## Verification by the maintainer agent (2026-10-21)

- Confirmed against provider pages: Mapbox allows tracing for OpenStreetMap only, commercial derivative vector data needs a
  Commercial Satellite license ([Mapbox imagery](https://docs.mapbox.com/data/tilesets/guides/imagery/)); MapTiler Cloud
  allows derivative vector data for non-commercial or OpenStreetMap use only ([terms](https://www.maptiler.com/terms/cloud/));
  CARTO prohibits derivative works ([terms](https://carto.com/legal/basemap-terms/)). Esri stays `TO_VERIFY`.
- Confirmed in code: map reference starts disabled, Bangkok centre, opacity 0.55, Positron.
- Not seen by the review: a median opening at a junction approach is already a road-first leg treatment (UI missing);
  a mid-block median opening and a project access do not exist in the engine. Station lane / width components already
  exist on road links (no `/design` editor), a base for Phase 4C.
- Not adopted before 4A: project georeference (anchor + north rotation). Elevation does not depend on it; planned with a
  north arrow in export or with OSM import.

Adopted order before 4A (owner, 2026-10-21): start chooser + map trace-rights labels → phone review-first →
median opening at junction in `/design` → project access road role → junction focus mode in `/design`
(crossings, islands, stop lines, mid-block median opening).
