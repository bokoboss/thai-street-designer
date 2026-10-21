> Deep research by ChatGPT (owner-requested), 2026-10-21: game-style ease of use and the interchange path for TSD.
> Kept as received except that ChatGPT's internal citation markers were removed: they carried no links, so the
> product facts about each game and tool below **are not traceable yet** and must be checked against the original
> source before they are quoted elsewhere. The design proposals stand on their own reasoning. How the proposals
> map onto the roadmap is in `docs/CONSOLIDATION_ROADMAP.md`, Phase 4.

# Deep Research: นำ “ความง่ายแบบเกม” มาใช้กับ Thai Street Designer โดยไม่ลดความน่าเชื่อถือทางวิศวกรรม

> **วิธีอ่านรายงาน:** “ข้อเท็จจริง” หมายถึงสิ่งที่ตรวจสอบได้จากเอกสาร/ผลิตภัณฑ์ต้นทาง ส่วน “ข้อเสนอ” คือข้อสังเคราะห์และคำแนะนำสำหรับ Thai Street Designer (TSD) จากงานวิจัยนี้  
> ข้อมูลสถานะผลิตภัณฑ์ตรวจสอบ ณ **21 ตุลาคม 2026** โดยเฉพาะ Traffic Architect และ Trafficity ซึ่งยังไม่ออกเวอร์ชันเต็มในวันนี้: Traffic Architect กำหนดออก 3 พฤศจิกายน 2026 และ Trafficity 16 พฤศจิกายน 2026 ดังนั้นรายละเอียดของสองรายการนี้อาศัยหน้าผลิตภัณฑ์และ demo/update notes ไม่ใช่ประสบการณ์จากตัวเต็มหลังวางจำหน่าย

## สรุปสำหรับผู้บริหาร

1. **TSD มีฐาน UX ที่มาถูกทางแล้ว:** road-first, snapping, angle lock, typed length, intersection อัตโนมัติ, direct manipulation, alternatives และ transaction-level undo สอดคล้องกับ pattern ที่เครื่องมือสร้างโครงข่ายที่ดีใช้กัน และ repository ปัจจุบันตั้งใจให้เป็น concept-design workspace ไม่ใช่ detailed engineering design.  
2. ความ “เหมือนเกม” ที่ควรนำมาใช้ **ไม่ใช่ gamification** แต่คือวงจร *gesture → preview → feedback → commit → edit → undo* ที่สั้นมาก; Transport Fever 2, NIMBY Rails และ Cities: Skylines II แสดง pattern นี้ชัดเจน.  
3. จุดที่เกมทำได้ดีกว่า CAD/traffic-model editor หลายตัวคือ **ผู้ใช้เห็นผลก่อน commit**: ghost geometry, snapping, warning สี, slope/radius/length ระหว่างวาด และยกเลิกได้ทันที แทนที่จะกรอก dialog จำนวนมาก.  
4. แต่ TSD ไม่ควรเลียนแบบ “ความง่าย” ด้วยการซ่อนข้อจำกัดทางวิศวกรรมหรือสร้าง interchange เป็น black box; แนวที่เหมาะกว่าคือ **template เพื่อเริ่มต้น แล้วแตกออกเป็น ramp/road/merge/diverge ที่แก้ได้จริง** คล้ายแนวคิดของ premade intersections ใน Cities: Skylines II ผสมกับ concept-stage editing ของ OpenRoads ConceptStation.  
5. การพัฒนา interchange ควรเริ่มจาก **elevation/profile + crossing relation + structure ก่อน ramp** เพราะหากไม่มี `z(s)` และ over/under semantics ระบบไม่สามารถแยก “ถนนตัดกัน” ออกจาก “ถนนผ่านข้ามกัน” ได้อย่างถูกต้อง. **[ข้อเสนอ]**  
6. MVP interchange ที่เหมาะที่สุดคือ **diamond interchange**: มี topology ชัด, reusable, ทดสอบง่าย และบังคับให้สร้างองค์ประกอบพื้นฐานที่ TSD ต้องมีต่อไปอยู่แล้ว ได้แก่ ramp, end-to-side attachment, merge/diverge, lane transition และ vertical profile. **[ข้อเสนอ]**  
7. Lane connection ควร **สร้างให้อัตโนมัติก่อนและเปิด advanced editor เมื่อจำเป็น**; Traffic Architect demo ใช้ drag lane-to-lane และ TM:PE/Vissim แสดงว่า explicit lane connectivity มีประโยชน์มากแต่ไม่ควรบังคับให้ผู้ใช้จัดทุก movement ตั้งแต่แรก.  
8. ด้านเว็บ **ทำได้จริงโดยไม่ต้องเปลี่ยน stack ทั้งหมด**: เก็บ geometry model แยกจาก renderer, ใช้ SVG ต่อสำหรับ plan/editor ระดับเล็ก–กลาง, three.js สำหรับ 3D และค่อยเพิ่ม WebGL/deck.gl เมื่อ network scale ต้องการ GPU batching. three.js และ deck.gl ใช้ MIT license.  
9. ระบบ validation ต้องแยกชัดระหว่าง **“เรขาคณิต/ตรรกะใช้ได้” กับ “เป็นไปตามมาตรฐาน”**; ค่า grade, radius, vertical curve, clearance, taper และ lane-transition threshold ไม่ควร hard-code จากการคาดเดา แต่ต้องผูกกับเอกสารกรมทางหลวง/หน่วยงานเจ้าของทางและ AASHTO ฉบับที่โครงการกำหนด. กรมทางหลวงเผยแพร่ “คู่มือการออกแบบทาง เบื้องต้น” และ AASHTO มี Green Book ฉบับที่ 7 เป็นแหล่งอ้างอิงทางเรขาคณิต แต่รายงานนี้ **ไม่กำหนดค่าตัวเลขแทนคู่มือดังกล่าว**.  
10. ข้อเสนอเชิงผลิตภัณฑ์คือทำให้ TSD เป็น **“sketch as fast as a game, inspect as clearly as an engineering tool”**: สร้าง concept ได้ในไม่กี่ action แต่ทุก object มีชนิด, topology, parameter, warning, source-of-rule และ undo ที่ตรวจสอบย้อนกลับได้. **[ข้อเสนอ]**

## หลักฐานจากเกมและเครื่องมือออกแบบ

### Pattern หลักที่ทำให้ “วาดแล้วได้ผลทันที” รู้สึกลื่น

สิ่งที่โดดเด่นที่สุดไม่ได้อยู่ที่กราฟิกหรือ simulation แต่คือ **การเลื่อนจุดตัดสินใจของผู้ใช้ไปไว้บน canvas** แทน dialog box ตัวอย่างชัดคือ Transport Fever 2: ผู้ใช้ลากจากต้นทางไปปลายทาง เห็น proposed segment ก่อนสร้างจริง สามารถจับปลายสีเทาย้ายตำแหน่ง ปรับ slope กด Shift เพื่อลด snapping และยืนยันหรือยกเลิก proposal ภายหลัง; เมื่อ profile สูง/ต่ำพอ ระบบเสนอ bridge/tunnel และแสดง warning หากมีผลกระทบ เช่น demolition.

NIMBY Rails ใช้อีกแนวที่เหมาะกับงานวิศวกรรมมาก คือ **blueprint-first**: track ใหม่ยังเป็นสีน้ำเงิน มี control points, midpoint, length และ speed/radius feedback; control points ลากแก้ภายหลังได้ และ geometry ที่ radius ต่ำกว่าที่ track type รองรับจะถูกประกาศ invalid และสร้างไม่ได้ นอกจากนี้ level เป็น property ที่ control point และ track ต่าง level จะผ่านเหนือ/ใต้กันแทนการสร้าง junction.

Cities: Skylines II ทำให้ road construction เร็วด้วย snapping หลายชนิด, numerical slope guide, enhanced curve tools, parallel mode, grid แบบสามคลิก, right-click เพื่อย้อน/cancel ขั้นปัจจุบัน และ auto-intersection เมื่อถนนตัดกัน ขณะเดียวกัน elevated/cut/tunnel และ highway ramp ถูกสร้างผ่าน geometry เดียวกับ network ปกติ ไม่ต้องเข้า “interchange editor” แยกสำหรับทุกกรณี.

Traffic Architect demo ไปอีกขั้นด้วย curve แบบ **“ends first”**—วางปลายสองด้านก่อนแล้วค่อย bend—และ lane connector แบบคลิก junction แล้วลากจาก lane ไป lane; preview ของ interchange ที่วางไม่ได้เปลี่ยนเป็นสีแดงและแสดง footprint ทั้งชิ้น เพื่อให้ผู้ใช้รู้ว่าต้องเคลียร์พื้นที่เท่าไร.

### ตารางเปรียบเทียบ interaction pattern

| เกม/เครื่องมือ | วาดและแก้แนว | Intersection / interchange / elevation | Lane / connection | Feedback และบทเรียนต่อ TSD |
|---|---|---|---|---|
| **Trafficity — Onramp Games** | ผู้พัฒนาระบุว่าเป็น gridless road tools; สร้าง grid ได้ทุกมุมด้วยสามคลิก และเพิ่ม lane รายเส้นข้างถนนเดิมได้ | รองรับ overpass, roundabout และ highway interchange ตามข้อมูลก่อนวางจำหน่าย | ระบุว่าสามารถปรับ protected turns, signal phase และ lane connections | น่าสนใจมากในฐานะ “network grammar ที่ง่าย” แต่ ณ 21 ต.ค. 2026 ยังไม่ออกตัวเต็ม จึงควรมองเป็น design reference มากกว่าหลักฐาน production UX. |
| **Traffic Architect** | Demo มี snapping, partial road upgrade, parallel road tool และ curve “วางปลายก่อนแล้วดัดทีหลัง” | full product ระบุ one-click 3-way compact/trumpet และ compact/wide cloverleaf; bridge/tunnel ใน gesture เดียว; challenge mode สร้าง ramp ทีละเส้นได้ | Demo 1.0.4–1.0.5 มี lane connector แบบลาก lane-to-lane | เป็น reference ที่ใกล้โจทย์ TSD มากที่สุด: “template เพื่อเร็ว + manual ramp เพื่อควบคุม”; red full-shape preview เมื่อวางไม่ลงควรนำแนวคิดมาใช้. |
| **Cities: Skylines II** | curve/grid/parallel/replace, snapping หลายแบบ, slope number, right-click cancel | crossing สร้าง intersection อัตโนมัติ; elevated/cut/tunnel; premade intersection วางทับ road ได้; roundabout ปรับตาม lanes ที่ต่อเข้า | highway ramp ทำผ่านถนนที่มี extra lane + single-lane connector จึงเกิด acceleration/deceleration geometry | จุดแข็งคือ common editing vocabulary: road, ramp และ interchange ไม่ได้เป็น object ที่แยกโลกกัน. |
| **Cities: Skylines I + Move It / Node Controller** | Move It ให้เลือก/ย้าย/align network nodes หลังวาด; Node Controller ปรับ offset, shift, rotate, twist, slope, stretch ที่ปลาย segment และ align ถนน | Node Controller ทำ junction sloped ได้ | โดยตัว mods เหล่านี้เน้น geometry/node มากกว่าการพิสูจน์มาตรฐาน | บทเรียนคือ post-draw direct manipulation มีคุณค่าสูง แต่ Move It เตือนเองว่าแทบไม่มีข้อจำกัด—TSD จึงควรใช้ constrained handles ไม่ใช่ “move anything anywhere”. |
| **TM:PE** | เป็น network-control layer หลัง geometry ถูกสร้างแล้ว | ใช้กำหนด junction behavior | Lane Connector: เลือก incoming lane แล้วเลือก outgoing lanes; เป็น explicit hard-wired routing และ reset ได้ | รูปแบบ interaction เข้าใจง่าย แต่ควรเป็น Advanced mode เพราะ lane-level editing ทุก movement มี cognitive load สูงและการต่อผิดอาจทำให้ lane เข้าไม่ถึง. |
| **Mini Motorways** | core loop คือ draw road ทีละเส้นและ redesign network ต่อเนื่อง | interchange geometry ไม่ได้พยายามเป็น engineering CAD; roundabout เป็น upgrade/object | abstract lane behavior | คุณค่าคือ “แก้แล้วเห็นทันที” และต้นทุนในการลองทางเลือกต่ำ ไม่ใช่ geometry model ที่ควรเลียนแบบโดยตรง. |
| **Workers & Resources: Soviet Republic** | road เป็น segment ระหว่าง nodes; การต่อเข้ากลาง segment ทำให้ segment เดิม split; กด H เพื่อเห็น nodes/connectable points | มี roads, bridges, tunnels | topology ถูกแสดงผ่าน nodes ชัดเจน | เหมาะเป็น reference สำหรับ “end-to-side attachment” ของ TSD: ปลาย ramp แตะ mainline แล้ว split topology โดยอัตโนมัติ แทนสร้าง pseudo-intersection. |
| **Transport Fever 2** | straight/curve; drag start→end; ย้าย endpoint ก่อน commit; Shift ลด snap; ปรับ slope/height ก่อนยืนยัน | bridge/tunnel ถูก propose ตาม vertical geometry; template street constructions สามารถแก้ต่อได้ | ไม่ใช่ lane-connection editor ระดับ Vissim | เป็น pattern ที่เหมาะกับ TSD มาก: proposal geometry + explicit commit + warning + post-drag numeric adjustment. |
| **NIMBY Rails** | click control points, blueprint mode, drag edit, midpoint control, multi-select | ground/viaduct/tunnel levels; ต่าง level ผ่านกัน, level เดียวกัน intersect | rail topology/switch มากกว่า road lanes | “blueprint state” และ live radius/length/invalid feedback เป็นแบบอย่างที่ engineering-friendly มากกว่า instant-build. |
| **Freeways** | mouse/touch sketch ของ freeway interchange; update ปี 2025 เพิ่ม Undo | จุดประสงค์หลักคือ “draw freeway interchanges” | abstract traffic behavior | แสดงคุณค่าของการให้ผู้ใช้คิดผ่าน sketch โดยตรง แต่ความอิสระแบบ sketch ไม่ควรกลายเป็น final parametric geometry ของ TSD. |
| **SimCity 4 / NAM RealHighway** | ใช้ระบบ network/FLEX และ transition pieces บนข้อจำกัดของ engine เก่า | NAM มี FLEXRamp/Draggable Ramp Interfaces, height transitions, width transitions และ fly crossings หลายระดับ แต่ compatibility แตกต่างตาม network/angle | ramp interfaces ผูกกับ network grammar | บทเรียนสำคัญคือ catalog/template สามารถเติบโตเป็น matrix ของ compatibility ได้รวดเร็ว; TSD ควรให้ template generate generic ramp objects แทนสร้าง object type ใหม่ทุก variant. |
| **InfraWorks** | component road มี in-canvas manipulators; intersection เกิดเองเมื่อ component roads ตัดกัน | ปรับ intersection/turning zone/roundabout, widening transition และดู superelevated intersection ได้ | widening zone มี sliders และ transition types | นี่เป็นหลักฐานว่า “auto-create + direct edit” ไม่ใช่แนวเกมอย่างเดียว แต่ใช้ใน professional infrastructure software เช่นกัน. |
| **OpenRoads ConceptStation** | เน้น sketch concept จาก real-world data | sketch road/bridge/ramp/intersection; concept 3D; เชื่อมต่อไป detailed design | product ระบุ automatic auxiliary lanes สำหรับ ramp และ editable engineering geometry ใน workflow concept | เป็น benchmark ด้าน credibility: ความเร็วที่ concept stage อยู่ร่วมกับ standards-aware workflow และ downstream engineering handoff ได้. |
| **Streetmix** | เน้นออกแบบ **cross-section** และชุด street elements มากกว่าการวาด network alignment | ไม่ใช่ interchange/network geometry tool | lane/sidewalk/bike/median เป็นองค์ประกอบที่สื่อสารเข้าใจง่าย | สิ่งที่ควรยืมคือ progressive disclosure และ vocabulary เชิงพื้นที่ ไม่ใช่ geometry engine; documentation เองจัดองค์ประกอบถนนเป็นประเภทและ design considerations ชัดเจน. |
| **PTV Vissim** | link/connector editor; drag connector พร้อม intermediate points และปรับ geometry หลังสร้างได้ | connector เชื่อม link ต่าง `z` ได้และ Vissim interpolation vertical course ให้ | connector กำหนด lane group และ inside merge/lane disappearance ได้ละเอียด | เหมาะเป็น reference ของ “Advanced topology editor” แต่ workflow ละเอียดเกินไปสำหรับ default TSD concept mode. |
| **Aimsun Next** | network ประกอบด้วย road sections ตามแนวจริง แล้ว node เชื่อม sections | junction node เก็บ turns, stop lines, priority/signal logic | section มี lane properties; node เป็นเจ้าของ turning connectivity | ชี้ว่าการแยก **geometry of road** ออกจาก **topological movements at node** เป็น data architecture ที่ผ่านการใช้งานใน professional traffic modelling. |

### สิ่งที่เหมือนกันในเครื่องมือที่ “รู้สึกลื่น”

จากหลักฐานข้างต้น มี pattern ซ้ำอยู่หกประการ: **preview ก่อนสร้างจริง, snapping ที่ override ได้, geometry handles หลังวาด, immediate numeric feedback, topology automation ในกรณีธรรมดา และ advanced controls เมื่อกรณีพิเศษเกิดขึ้น**. Transport Fever 2 รวม preview/commit/snap/slope ไว้ใน gesture เดียว; NIMBY Rails เพิ่ม blueprint และ live validity; Cities: Skylines II เพิ่ม automatic intersection/premade interchange; ส่วน InfraWorks แสดงว่าหลักการ auto-create-then-refine ใช้ใน professional design tool ได้เช่นกัน.

**ข้อเสนอสำหรับ TSD:** นิยาม “game-like” ใหม่เป็น **low interaction latency + reversible direct manipulation** ไม่ใช่ “ลดจำนวนข้อมูลทางวิศวกรรม” กล่าวคือผู้ใช้ควรทำงานเร็วขึ้นเพราะระบบ infer สิ่งที่สมเหตุสมผลและแสดงผลทันที ไม่ใช่เพราะระบบละทิ้ง semantics ที่วิศวกรต้องใช้ตรวจงาน.

## สิ่งที่ควรนำมาใช้ ปรับก่อนใช้ และไม่ควรใช้

| ระดับ | Pattern | เหตุผลสำหรับ TSD |
|---|---|---|
| **นำมาใช้ได้ตรง ๆ** | **Ghost/proposal geometry ก่อน commit** | Transport Fever 2 แสดง proposal และให้ confirm/dismiss; Traffic Architect ใช้ full-shape red preview เมื่อ interchange วางไม่ได้. ทำให้การทดลองเร็วแต่ยัง reversible. |
| **นำมาใช้ได้ตรง ๆ** | **ลาก handle หลังสร้าง + numeric input คู่กัน** | NIMBY Rails, InfraWorks และ Node Controller แสดงว่า direct manipulation และ precise attribute editing อยู่ร่วมกันได้. |
| **นำมาใช้ได้ตรง ๆ** | **Snap หลายชนิด พร้อม modifier เพื่อผ่อน/ปิด snap ชั่วคราว** | Transport Fever 2 ใช้ Shift ลด snap; Cities: Skylines II มีหลาย snapping options. |
| **นำมาใช้ได้ตรง ๆ** | **Right-click/Esc cancel ขั้นปัจจุบัน; Undo เป็น transaction** | Cities: Skylines II cancel road-building step ด้วย right mouse; Traffic Architect demo มี Ctrl+Z สำหรับ action ก่อนหน้า. |
| **นำมาใช้ได้ตรง ๆ** | **HUD ใกล้เคอร์เซอร์: length, radius, grade, Δz** | NIMBY Rails แสดง length/radius/speed ระหว่างวาด; Cities: Skylines II แสดง numerical slope. |
| **นำมาใช้ได้ตรง ๆ** | **Auto-create กรณีปกติ แล้วค่อย refine** | Cities: Skylines II และ InfraWorks ต่างสร้าง intersection เมื่อ roads ตัดกันโดยอัตโนมัติ. |
| **นำมาใช้ได้ตรง ๆ** | **Lane connector แบบ drag source→target ใน Advanced mode** | Traffic Architect demo ใช้ lane-to-lane drag และ TM:PE ใช้ incoming→outgoing selection; interaction model เข้าใจได้โดยไม่ต้องสร้าง matrix dialog. |
| **ใช้ได้แต่ต้องปรับ** | **One-click interchange template** | Traffic Architect ใช้ one-click interchange และ C:S II ใช้ premade intersections; สำหรับ TSD template ต้องเป็น generator ที่สร้าง editable ramps/structures ไม่ใช่ opaque asset. |
| **ใช้ได้แต่ต้องปรับ** | **Automatic bridge/tunnel** | เกมสามารถ infer จาก elevation ได้ แต่เครื่องมือวิศวกรรมควร **เสนอ** “สร้างสะพาน/อุโมงค์?” พร้อม preview และ profile ไม่ควรเปลี่ยน structure type เงียบ ๆ. Transport Fever 2 ใช้ proposal ก่อน finish ซึ่งเป็น pattern ที่เหมาะกว่า. |
| **ใช้ได้แต่ต้องปรับ** | **สีเขียว/เหลือง/แดง** | ใช้ได้ถ้าความหมายชัด: “geometry valid / ต้องตรวจสอบ / invalid” ไม่ควรใช้เขียวเพื่อสื่อว่า “ผ่านมาตรฐานไทย” หากยังไม่ได้โหลด criterion ที่ตรวจสอบแหล่งแล้ว. **[ข้อเสนอ]** |
| **ใช้ได้แต่ต้องปรับ** | **Move-anything manipulation** | Move It ให้เสรีมากและระบุเองว่าไม่มีข้อจำกัดเพียงพอ; TSD ควร constraint การลาก เช่น preserve tangent, preserve connection, lock station/grade หรือให้ผู้ใช้กด modifier เพื่อปลด constraint. |
| **ใช้ได้แต่ต้องปรับ** | **Curves แบบ freeform/Bezier** | ดีต่อการ sketch แต่ final conceptual alignment ควรมี engineering-readable parameters เช่น tangent/radius/station; Bézier อาจใช้เป็น UI control แล้ว normalize เป็น primitive ที่ตรวจได้. **[ข้อเสนอ]** |
| **ใช้ได้แต่ต้องปรับ** | **เสียงและ animation** | เหมาะเฉพาะ feedback เบา ๆ เช่น snap/commit/error และควรปิดได้; animation ไม่ควรตีความเป็น traffic performance หาก TSD ไม่ได้ simulation. **[ข้อเสนอ]** |
| **ไม่ควรใช้** | **คะแนน ดาว combo confetti หรือ “solution quality score” โดยไม่มี model รองรับ** | ทำให้ “ความสนุก” ปะปนกับ professional judgement และสร้าง false authority. **[ข้อเสนอ]** |
| **ไม่ควรใช้** | **รถวิ่ง/heatmap ที่ดูเหมือน simulation ทั้งที่ไม่ได้คำนวณ capacity/LOS** | Traffic Architect และ Trafficity มี actual vehicle simulation เป็นฐานของ feedback แต่ TSD ตามขอบเขตปัจจุบันไม่มี simulation; การเลียนแบบภาพดังกล่าวจะทำให้ผู้ใช้เข้าใจความสามารถผิด. |
| **ไม่ควรใช้** | **Auto-fix แล้วแก้ geometry เงียบ ๆ** | ผู้ใช้ต้องเห็นว่า parameter ใดเปลี่ยน เหตุผลอะไร และ undo ได้เป็น transaction เดียว. **[ข้อเสนอ]** |
| **ไม่ควรใช้** | **Template interchange ที่แกะไม่ได้** | จะสร้าง technical debt แบบ catalog explosion และทำให้ project-specific adaptation ยาก; NAM แสดงให้เห็นว่าการรองรับ network×height×transition×angle หลายชุดกลายเป็น compatibility matrix ได้มากเพียงใด. |

แก่นสำคัญคือ **automation ต้องทำงานในฐานะ assistant ไม่ใช่ authority**. OpenRoads ConceptStation แสดงตัวอย่างของ concept tooling ที่เร็วแต่ยังผูกกับ engineering workflow; InfraWorks แสดงว่า automatic intersection สามารถตามด้วย in-canvas refinement และ validation ของ parameters ได้.

## โมเดลข้อมูลและ UX สำหรับ interchange ระดับแนวคิด

### สิ่งที่ต้องเปลี่ยนใน mental model

TSD ปัจจุบันถือว่า “ถนนตัดกัน → เกิดทางแยกระดับดิน” ซึ่งเหมาะกับ 2D road-first model และ repository ระบุว่า 3D ปัจจุบันยังวางถนนบนระดับเดียวกัน.

**ข้อเสนอ:** เมื่อเพิ่ม interchange ให้เปลี่ยน rule เป็น:

> **เส้นแนวราบตัดกันไม่ได้แปลว่า topology เชื่อมกันเสมอไป**  
> ต้องตรวจทั้งตำแหน่งตามแนวราบ + elevation/profile + crossing intent ก่อนสร้าง junction

กล่าวคือจุดตัดต้องจำแนกอย่างน้อยเป็น `atGrade`, `AOverB`, `BOverA` หรือ `unresolved` และการสร้าง node/junction ต้องเกิดเฉพาะ `atGrade`.

### โมเดลข้อมูลขั้นต่ำ

| Entity | Field ขั้นต่ำ | เหตุผล |
|---|---|---|
| `Road` | `id`, horizontal alignment, direction, cross-section/template runs | เป็นเจ้าของ centerline และหน้าตัดเหมือนแนว road-first เดิม **[ข้อเสนอ]** |
| `HorizontalAlignment` | sequence ของ `Line` + `CircularArc`; `Spiral/Clothoid` optional ในระยะหลัง | line+arc ทำให้ radius/tangent/station อธิบายแก่ผู้ใช้ได้ตรงกว่า arbitrary spline. **[ข้อเสนอ]** |
| `VerticalProfile` | station–elevation definition หรือ PVI representation, พร้อมฟังก์ชัน `z(s)` และ `grade(s)` | ต้องทราบความสูงที่ทุก crossing/ramp attachment ไม่ใช่เก็บเพียง `level = 0/1`. **[ข้อเสนอ]** |
| `StructureRun` | `roadId`, `stationFrom`, `stationTo`, `type: atGrade | embankment | elevated | bridge | tunnel` | แยก “ตำแหน่งถนน” ออกจาก “วิธีรองรับโครงสร้าง” และรองรับ structure เปลี่ยนตาม station. **[ข้อเสนอ]** |
| `Crossing` | road A/B, station A/B, relation, computed elevation A/B, vertical separation, validation status | เป็นเจ้าของ semantics ว่า intersection หรือ grade separation. **[ข้อเสนอ]** |
| `Ramp` | `id`, from/to anchors, horizontal alignment, vertical profile, direction, lane count/template | **ไม่ควรเป็นแค่เส้นตกแต่ง** แต่เป็น directional road-class object ที่มี attachment semantics. **[ข้อเสนอ]** |
| `RoadAnchor` | `roadId`, `station`, side/direction, lane reference | รองรับ “ปลาย ramp ต่อเข้าข้าง mainline” ซึ่งโมเดลเดิมยังไม่มี. **[ข้อเสนอ]** |
| `MergeDiverge` | `type`, mainline side/direction, ramp, station range, lane relationship | ทำให้ merge/diverge แตกต่างจาก ordinary T-junction และเป็นเจ้าของ lane transition. **[ข้อเสนอ]** |
| `CrossSectionRun` / `LaneRun` | lane set ที่ station interval + transition between runs | จำเป็นสำหรับช่วงเพิ่ม/ลด lane ตามระยะทาง; InfraWorks ใช้ widening zone ที่มี start/end และ transition length ซึ่งสนับสนุนแนวคิดว่า transition ควรเป็น interval ไม่ใช่ property ของ node. |
| `LaneConnection` | `fromLaneId`, `toLaneId`, movement/type, auto/manual flag | รองรับ default auto-connect และ advanced override; professional editors อย่าง Vissim/Aimsun แยก section/link geometry ออกจาก junction/connector connectivity. |
| `ValidationIssue` | rule ID, severity, objects, measured value, threshold/source status | เพื่อแยก “invalid geometry” กับ “ต้องตรวจสอบตามมาตรฐาน”. **[ข้อเสนอ]** |

ไม่แนะนำให้เก็บเพียง integer `level: 0/1/-1` เป็น canonical model แม้ NIMBY Rails จะใช้ level ได้อย่างมีประสิทธิภาพในเกม เพราะ TSD ต้องแสดง grade, clearance และ profile ต่อเนื่องตาม station; NIMBY Rails เองก็แสดงว่าความสัมพันธ์ level เป็นตัวตัดสินว่าจะ intersect หรือ pass over/under ซึ่งเป็น mental model ที่นำมาใช้ได้ แต่ representation ควรละเอียดกว่าสำหรับงานวิศวกรรม.

### UX flow ที่แนะนำสำหรับ interchange

**ข้อเสนอของผู้วิจัย — “crossing first, template second, editable forever”**

**วาดถนนตามเดิม → พบ crossing → เลือกความสัมพันธ์ระดับ → preview profile → เลือก template → ปรับ handles → ตรวจ → commit**

เมื่อถนนสองสายตัดกัน TSD ควรแสดง inline chip เล็ก ๆ เช่น:

`ระดับเดียวกัน` · `สาย A ข้าม` · `สาย B ข้าม`

ค่าเริ่มต้นยังคงเป็น **ระดับเดียวกัน** เพื่อรักษา workflow ปัจจุบัน แต่ถ้าเลือก “A ข้าม B” intersection object เดิมจะเปลี่ยนเป็น `Crossing` และระบบเปิด profile preview แทนการสร้าง junction.

หลังจากนั้นคำสั่ง **“สร้างทางแยกต่างระดับ”** เปิด template picker โดย MVP มี `Diamond` เพียงชนิดเดียว ผู้ใช้เลือก:

`ถนนหลัก` → `ถนนรอง` → `ใครอยู่บน/ล่าง` → `ทิศ ramp ที่ต้องการ` → `Preview`

เมื่อ preview แสดงขึ้นควรเห็น ramp ทั้งชุดแบบ ghost, ramp-anchor handles, merge/diverge stations และพื้นที่ที่ geometry ชนกัน หาก template ไม่พอดี ควรแสดง footprint ที่ต้องการในลักษณะเดียวกับ red interchange preview ของ Traffic Architect ไม่ใช่เพียง toast “วางไม่ได้”.

เมื่อกด commit ให้สร้าง `Ramp[]`, `MergeDiverge[]`, `StructureRun[]`, `Crossing` และ lane transitions เป็น **หนึ่ง undo transaction** แต่หลัง commit แต่ละ ramp ต้องแก้ได้เหมือน road object ปกติ นี่รักษาความเร็วแบบ template โดยไม่เกิด opaque asset. **[ข้อเสนอ]**

### การแก้ ramp หลังสร้าง

TSD ควรมี editing tier สามระดับ:

**Default:** ลาก end/shape handles และแสดง `Length · R · Grade · ΔZ`; snapping รักษา attachment และ tangent เท่าที่ model กำหนด. NIMBY Rails แสดงคุณค่าของ live length/radius และ editable control points ขณะที่ Cities: Skylines II แสดง numerical slope feedback ระหว่างวาด.

**Precision:** คลิก label เพื่อพิมพ์ station, radius, elevation หรือ grade โดยตรง คล้าย pattern ปัจจุบันของ TSD ที่มี typed dimensions. **[ข้อเสนอ]**

**Advanced connectivity:** เลือก merge/junction แล้วเปิด lane connector overlay; lane connections ที่ระบบ infer จะแสดงเส้นบาง ผู้ใช้ลาก incoming→outgoing เพื่อ override. Traffic Architect ใช้ drag lane-to-lane โดยตรง และ TM:PE/Vissim แสดง explicit connection semantics.

### การแสดงผลสองมิติและสามมิติ

สำหรับ 2D **ข้อเสนอ** คืออย่าใช้สีเพียงอย่างเดียวแสดงระดับ:

- ถนน/bridge ที่อยู่บนสุด render หลังสุดใน z-order
- ใส่ deck/edge lines หรือ halo/mask บริเวณที่ข้าม
- road ด้านล่างขาด/จางเฉพาะช่วงใต้ structure
- มีลูกศรหรือ badge “บน/ล่าง” ขณะ select
- มี optional `Elevation mode` ที่แสดง `z`/grade ด้วยสี แต่ plan ปกติยังอ่านได้ขาวดำ
- ใน PDF/SVG export ให้ bridge semantics ยังคงอ่านออกเมื่อพิมพ์ grayscale

**รูปแบบสัญลักษณ์ทางสะพานในแบบราชการไทยต้องตรวจสอบ** ก่อนนำมาใช้เป็น drafting convention; ข้อเสนอข้างต้นเป็น UI visualization สำหรับ concept workspace ไม่ใช่ข้อกำหนดแบบก่อสร้าง.

สำหรับ 3D ให้เปลี่ยนจาก `z = constant` เป็น geometry ที่ sample `z(s)` จาก vertical profile แล้ว sweep cross-section ไปตาม alignment; `StructureRun` กำหนดว่าจะมีพื้นดินรองรับ, deck/viaduct, หรือ tunnel representation. MVP ไม่จำเป็นต้องสร้าง pier, abutment, retaining wall หรือ terrain earthwork อย่างวิศวกรรมโครงสร้าง. **[ข้อเสนอ]**

### การตรวจระดับ concept ที่ควรมี

ควรแบ่ง validation เป็นสามสถานะแทนคำว่า “ผ่านมาตรฐาน” อย่างเดียว:

| สถานะ | ความหมาย |
|---|---|
| **ผิดเชิงตรรกะ/เรขาคณิต** | เช่น ramp ไม่เชื่อม network, profile discontinuity, road surface ชนกัน, lane วิ่งย้อนทิศ, radius เป็นศูนย์/invalid, merge ไม่มี downstream lane |
| **ต้องตรวจสอบตามมาตรฐาน** | geometry คำนวณได้ แต่ criterion เช่น radius, grade, vertical curve, clearance หรือ taper ยังไม่มี verified rule profile |
| **ตรวจตาม rule profile แล้ว** | ใช้ได้ต่อเมื่อ application สามารถระบุ **แหล่งอ้างอิง + edition + rule ID + context** ได้จริง |

รายการตรวจที่ควรเตรียมไว้ ได้แก่ horizontal-radius/design-speed relationship, longitudinal grade, vertical curves, vertical clearance, lane/shoulder width, acceleration/deceleration or taper geometry, gore spacing, merge/diverge configuration, structure envelope และระยะ sight-related checks เมื่อข้อมูลที่จำเป็นครบ. **ค่าตัวเลขทั้งหมดในรายการนี้ = “ต้องตรวจสอบ”** กับคู่มือหน่วยงานเจ้าของทางของไทยและ/หรือ AASHTO ที่โครงการกำหนด; งานวิจัยนี้จงใจไม่แต่งตัวเลข. กรมทางหลวงมีหน้าคู่มือ “คู่มือการออกแบบทาง เบื้องต้น” และ AASHTO เผยแพร่ *A Policy on Geometric Design of Highways and Streets, 7th Edition*; ต้องตรวจสอบ edition/ประกาศ/ข้อกำหนดเฉพาะโครงการอีกครั้งก่อนนำ threshold เข้า production.

**Capacity, LOS, weaving performance, queueing, signal optimization และ traffic simulation ไม่ควรกลายเป็น validation ของ TSD ใน roadmap นี้** เพราะนั่นเป็น problem domain คนละระดับกับ geometric concept editor; Vissim และ Aimsun มี network model ที่สร้างขึ้นเพื่อ simulation โดยเฉพาะ ขณะที่ TSD ถูกกำหนดขอบเขตต่างออกไป.

## ความเป็นไปได้ทางเทคนิคบนเว็บ

### Geometry kernel

**ข้อเสนอ:** อย่าเริ่ม interchange ด้วย “polygon drawing”; ให้เริ่มจาก **parametric skeleton**:

`Horizontal alignment → stationing → vertical profile → cross-section/lane runs → offset curves → pavement polygons → 3D mesh`

เหตุผลคือ ramp และ lane transition ต้องตอบคำถามเชิง semantics เช่น “station ที่ merge อยู่ตรงไหน”, “grade ตรง crossing เท่าไร” และ “lane นี้เริ่ม/สิ้นสุดเมื่อไร” ซึ่งตอบยากมากหาก source of truth เป็น pavement polygon.

สำหรับ MVP แนะนำ horizontal primitive เพียง:

`Line + CircularArc`

ก่อน แล้วเพิ่ม transition spiral/clothoid เมื่อ use case และมาตรฐานที่ TSD ตั้งใจตรวจต้องใช้จริง. **[ข้อเสนอ]** การรองรับ clothoid ตั้งแต่รอบแรกจะเพิ่มภาระ tangent continuity, station evaluation, offsets, inverse projection และ editing UI โดยยังไม่จำเป็นต่อการพิสูจน์ interchange data architecture.

Offset algorithm ต้องรับมือ tight curves, self-intersection และการ join ของ offsets; ไม่ควรใช้ “เลื่อนทุก vertex ตาม normal” แบบ naïve. ไลบรารีอย่าง `@flatten-js/core` มี primitives 2D และ operations/intersections พร้อม MIT license และ Turf.js ใช้ทำ geospatial utility ได้ภายใต้ MIT เช่นกัน.

สำหรับ interactive curve control สามารถใช้ Bézier เป็น **UI construction curve** ได้ แต่ควรพิจารณาแปลง/fit ไปยัง representation ที่ผู้ใช้ตรวจ radius และ station ได้ หาก geometry นั้นจะถูกนับเป็น engineering concept object. **[ข้อเสนอ]**

### Rendering stack ที่เหมาะกับ TSD

TSD ปัจจุบันมี SVG สำหรับ plan และ Canvas-based 3D ตาม README ของ repository.

**ข้อเสนอ:** ไม่ควร rewrite renderer ก่อนสร้าง data model:

| เทคโนโลยี | บทบาทที่แนะนำ | เหตุผล / License |
|---|---|---|
| **SVG** | plan editor สำหรับ network ขนาดเล็ก–กลาง, selection handles, labels, print/SVG export | DOM hit-testing และ vector export สะดวกมาก; ควรเก็บไว้ตราบที่ object count ยังควบคุมได้ **[ข้อเสนอ]** |
| **Canvas 2D** | optional rendering layer สำหรับ static/high-volume markings | ลด DOM element count แต่ต้องสร้าง hit-testing/index เอง **[ข้อเสนอ]** |
| **three.js** | 3D interchange, bridge decks, road meshes | เหมาะกับ scene graph/custom geometry และใช้ MIT License. |
| **deck.gl** | network/geospatial visualization ขนาดใหญ่เมื่อ GPU batching สำคัญ | โครงการระบุว่าเป็น WebGL2/WebGPU framework สำหรับ large-scale data visualization และใช้ MIT License. |
| **MapLibre GL JS** | basemap/georeferenced context เมื่อ GIS กลายเป็น core requirement | เหมาะเมื่อ TSD ต้องซิงก์ road design กับ interactive vector map; license repository เป็น BSD-family/MapLibre licensing distribution จึงควรตรวจ notices ของ version ที่ล็อกก่อน release. |
| **Turf.js** | spatial predicates/helpers ใน geographic data layer | MIT; ไม่ควรใช้แทน precision alignment kernel ทุกอย่าง. |
| **@flatten-js/core** | 2D Euclidean geometry, intersection/distance/arc/polygon utilities | MIT; เหมาะกว่า Turf สำหรับ local metric design plane หลาย operation. |
| **Bezier.js** | curve UI/prototyping หากต้องการ Bézier manipulation | ใช้ได้เป็น helper โดยควรล็อก version/license และไม่ให้ Bézier กลายเป็น engineering semantics โดยไม่ตั้งใจ. |
| **polygon-clipping** | polygon Boolean เฉพาะกรณีที่ pavement/marking overlay ต้อง union/difference | MIT ตาม repository; เหมาะเป็น downstream polygon operation ไม่ใช่ alignment model. |

### Performance เมื่อโครงข่ายใหญ่

ปัญหา performance จะไม่เริ่มจาก “มีถนนกี่กิโลเมตร” แต่จากจำนวน **render primitives + editable handles + intersection recomputations + labels + hit-test candidates** ต่อ frame. deck.gl ถูกออกแบบสำหรับ GPU-powered large-scale visualization จึงเป็นทางเลือกเมื่อ geometry จำนวนมากต้อง render พร้อมกัน แต่การย้าย TSD ทั้ง editor ไป WebGL ตั้งแต่ MVP จะเพิ่ม complexity โดยไม่จำเป็น.

**ข้อเสนอ architecture:**

`canonical design model`  
→ `derived geometry cache`  
→ `spatial index`  
→ `2D renderer / 3D renderer / export`

การลาก ramp handle ควร invalidate เฉพาะ road/ramp, adjacent crossing, merge/diverge และ dependent markings ไม่ rebuild network ทั้งโครงการ. งาน expensive เช่น polygon Boolean, mesh sweep และ validation ของ network ใหญ่สามารถย้ายไป Web Worker ภายหลังได้. **[ข้อเสนอ]**

ควรใช้ level-of-detail ใน 2D: เมื่อ zoom ออกให้ซ่อน lane markings/control points/text บางชนิดก่อนเปลี่ยน renderer ส่วน selection/hit-test ควรอาศัย spatial index มากกว่าวนทุก entity. **[ข้อเสนอ]**

### ความเสี่ยงทางเทคนิคที่สำคัญที่สุด

ความเสี่ยงอันดับหนึ่งไม่ใช่ three.js หรือ WebGL แต่คือ **geometry ownership**. หาก road surface, ramp, slip lane, lane transition, junction และ bridge ต่างสร้าง geometry แยกกันโดยไม่มี canonical station/alignment model จะเกิด drift ระหว่าง 2D, 3D, selection, validation และ export. แนวทางใน TSD ปัจจุบันที่แยก source-of-truth ของ base geometry กับ overlay บางชนิดอยู่แล้วเป็นหลักที่ควรรักษาและขยายไปยัง ramp/structure แทนการเพิ่ม ad-hoc polygon logic.

## Roadmap ที่แนะนำ

ตัวเลข action และ UX targets ด้านล่างเป็น **ข้อเสนอของผู้วิจัย ไม่ใช่มาตรฐานอุตสาหกรรม** จุดประสงค์คือทำให้ “ความง่าย” วัดได้ แทนที่จะประเมินด้วยความรู้สึก.

| ขั้น | Scope ที่ทำ | UX target ที่เสนอ | ความเสี่ยงหลัก | ตั้งใจไม่ทำ |
|---|---|---|---|---|
| **Foundation: Elevation & Crossing** | เพิ่ม `VerticalProfile`, `StructureRun`, `Crossing`; over/under selection; 2D stacking; 3D ใช้ `z(s)`; profile HUD | เปลี่ยน crossing เดิมจาก at-grade → A over B **≤ 3 meaningful actions**; Undo กลับทั้งหมดได้ 1 ครั้ง | migration schema; 2D/3D disagreement; profile discontinuity | ramp, lane connector, terrain, bridge structural detail |
| **Interchange MVP: Diamond** | `Ramp`, road anchors, merge/diverge, ramp preview, diamond generator, ghost validation, transaction commit | จาก crossing ปกติ → preview diamond ที่แก้ได้ **≤ 6 meaningful actions**; หลัง commit ย้าย ramp anchor ได้โดยไม่เข้า modal wizard | end-to-side topology; tangent solving; ramp/mainline collision | cloverleaf/trumpet, LOS/capacity, clothoid, detailed pier/abutment |
| **Lane Transition & Connectivity** | lane runs by station, add/drop, acceleration/deceleration representation, automatic lane mapping + advanced lane connector | เพิ่ม lane/drop run **≤ 3 actions**; override movement หนึ่งคู่ **≤ 3 interactions** | lane IDs เปลี่ยนเมื่อ cross-section เปลี่ยน; orphan connections | traffic assignment/simulation, signal optimization |
| **Template Expansion** | trumpet, roundabout interchange; selected cloverleaf variants; mirror/flip/rotate; template parameter presets | template ทุกชนิดต้อง preview ก่อน commit และ generated ramps ต้อง editable 100% | combinatorial template cases; overlapping loops; user expects “certified” geometry | สร้าง catalog ทุก interchange form ที่พบในโลก |
| **Standards-aware Concept Checks** | rule-profile framework, Thai agency/AASHTO references, measured-vs-threshold panel, report traceability | warning ทุกตัวแสดง `ค่าออกแบบ / เกณฑ์ / แหล่ง / status`; ไม่มีข้อความ “ผ่านมาตรฐาน” เมื่อ source unresolved | edition/version governance; context-dependent criteria | auto professional certification หรือการรับรองแบบ |
| **Large Network & Geospatial** | selective WebGL/deck.gl rendering, workers, LOD, MapLibre/georeferenced background ตามความจำเป็น, optional terrain/profile context | pan/zoom/edit ยังตอบสนองได้ตาม performance budget ที่กำหนดจาก benchmark project | renderer complexity, coordinate precision, memory | full GIS/CAD replacement, digital terrain design suite |
| **Full Concept Interchange Workspace** | custom ramp creation, multiple structures, robust lane topology, alternative comparison, interchange report/export | custom ramp จาก mainline ไป crossroad **≤ 8 meaningful actions** ในกรณีทั่วไป; failed geometry บอกตำแหน่งและเหตุผลทันที | feature creep; advanced editor กลบ simplicity ของ road-first workflow | construction drawings, quantities suitable for tender, structural bridge design, microsimulation |

### เกณฑ์ผ่านของ Foundation

**ข้อเสนอ:** อย่าเริ่ม diamond template จนกว่าจะผ่าน test ต่อไปนี้ทั้งหมด:

- ถนนสองสายตัดกันที่ XY เดียวกัน แต่ต่าง elevation แล้ว **ไม่สร้าง junction**
- flip `A over B ↔ B over A` แล้ว 2D, 3D, selection และ export เปลี่ยนพร้อมกัน
- ย้าย road alignment แล้ว crossing station/elevation recompute อย่าง deterministic
- Undo grade-separated conversion คืน object graph เดิมครบ
- project รุ่นเก่ายังเปิดได้โดยถือ profile เดิมเป็น `z = 0`
- report ระบุได้ว่า crossing ใดเป็น at-grade / bridge / unresolved

รายการนี้เป็น **ข้อเสนอการยอมรับเชิงสถาปัตยกรรม** ไม่ใช่ข้อกำหนดมาตรฐานงานทาง.

### เกณฑ์ผ่านของ Diamond MVP

ควรมีอย่างน้อย:

`mainline + crossroad + over/under + 4 ramps + 4 merge/diverge anchors + editable profiles + concept validation`

Template **ไม่ควรเก็บเป็น geometry สำเร็จรูปก้อนเดียว** หลัง commit แต่ควรเก็บ provenance เช่น:

`generatedFrom: { template: "diamond", version: 1, parameters: … }`

พร้อมกับ objects ที่แก้จริง เมื่อผู้ใช้ลาก ramp หลังสร้าง ไม่จำเป็นต้องรักษาความเป็น “perfect template” อีกต่อไป เว้นแต่เลือกโหมด regenerate โดยชัดเจน. **[ข้อเสนอ]**

แนวนี้ต่างจาก one-click template ในเกมตรงที่รักษา traceability แต่ยังได้ความเร็วแบบเดียวกัน; Traffic Architect และ Cities: Skylines II แสดงให้เห็นประโยชน์ของ interchange/premade construction ที่รวดเร็ว ขณะที่ OpenRoads ConceptStation แสดงว่าการ sketch ramp/intersection อย่างรวดเร็วสามารถอยู่ใน professional concept workflow ได้.

### UX metrics ที่ควรเก็บจริง

อย่าวัดเพียง “จำนวนคลิก” เพราะการลดคลิกด้วย wizard ที่สับสนอาจแย่กว่าเดิม **ข้อเสนอ** คือเก็บอย่างน้อย:

| Metric | วิธีวัดที่เสนอ |
|---|---|
| **Time to first valid concept** | เวลาจาก empty/crossing state ถึง interchange ที่ไม่มี geometry error |
| **Meaningful actions** | click/drag/typed-confirm ที่เปลี่ยน design intent; ไม่นับ pan/zoom |
| **Undo recovery** | ผู้ใช้ย้อนจาก action ผิดกลับ state ที่ต้องการได้กี่ action |
| **Correction rate** | จำนวนครั้งที่ต้องกลับมาแก้ ramp/elevation เพราะระบบ infer ผิด |
| **Advanced-mode entry rate** | งานกี่เปอร์เซ็นต์ต้องเปิด lane connector/profile advanced editor |
| **Validation comprehension** | ผู้ใช้แยก “invalid geometry” กับ “ต้องตรวจสอบมาตรฐาน” ได้หรือไม่ |
| **Template escape rate** | ผู้ใช้ generate template แล้วต้องลากแก้กี่ ramps; ช่วยบอกว่า default ดีหรือไม่ |
| **2D/3D consistency defects** | จำนวนเคสที่ user เห็น geometry ต่างกันระหว่าง plan, 3D และ export |

เป้าหมายเชิงผลิตภัณฑ์ที่สำคัญกว่าการ “ทำให้ทุกอย่าง one-click” คือ **งานธรรมดาเร็วมาก งานผิดปกติยังแก้ได้ และไม่มีช่วงใดที่ผู้ใช้ไม่รู้ว่าระบบทำอะไรกับ geometry**. **[ข้อเสนอ]**

## ข้อสรุปเชิงผลิตภัณฑ์และหลักอ้างอิงมาตรฐาน

งานวิจัยนี้ชี้ว่าการยืม interaction design จากเกม **ไม่ขัดกับความเป็นเครื่องมือวิศวกรรม** ตราบใดที่ยืมสิ่งที่ถูกประเภท: preview, snapping, direct manipulation, progressive disclosure, fast undo และ generated defaults มากกว่าการยืม abstraction ที่ตัด engineering semantics ออก. Professional tool อย่าง InfraWorks เองสร้าง intersection อัตโนมัติและให้แก้ผ่าน in-canvas manipulators; OpenRoads ConceptStation ขายจุดเด่นเรื่องการ sketch roads/bridges/ramps/intersections อย่างรวดเร็วพร้อม concept 3D และ standards-aware workflow.

ในอีกด้านหนึ่ง เครื่องมือ simulation เช่น Vissim และ Aimsun แสดงให้เห็นว่าพอเข้าสู่ lane connectors, merge behavior และ traffic routing จริง complexity จะเพิ่มขึ้นอย่างรวดเร็ว: Vissim มี connector geometry, z-coordinates, lane widths และ inside merges โดยเฉพาะ ส่วน Aimsun แยก road sections, junction nodes และ turns อย่างชัดเจน. นี่สนับสนุนการที่ TSD **ไม่พยายามกลายเป็น Vissim/Aimsun ขนาดย่อม** แต่เก็บ lane topology เท่าที่จำเป็นสำหรับความถูกต้องของ concept geometry.

ในแง่ interaction ต้นแบบที่เหมาะที่สุดสำหรับ TSD ไม่ใช่เกมใดเกมหนึ่ง แต่เป็นการประกอบคุณสมบัติจากหลายแหล่ง: **proposal/confirm ของ Transport Fever 2 + blueprint/live geometry feedback ของ NIMBY Rails + road-first automation ของ Cities: Skylines II + template/manual duality ของ Traffic Architect + in-canvas engineering refinement ของ InfraWorks + standards-aware concept positioning ของ OpenRoads ConceptStation + advanced lane connector pattern จาก TM:PE/Vissim.**

สำหรับมาตรฐาน ให้ TSD ใช้หลัก **“rule source before rule number”**: ก่อน hard-code maximum grade, minimum radius, vertical curve, vertical clearance, taper, acceleration/deceleration length หรือ lane/shoulder dimensions ต้องระบุหน่วยงาน, ชื่อคู่มือ, edition/revision, road class/design context และ rule ที่ใช้ให้ตรวจสอบย้อนกลับได้. ณ งานวิจัยนี้ยืนยันได้ว่ากรมทางหลวงมีช่องทางเผยแพร่ “คู่มือการออกแบบทาง เบื้องต้น” และ AASHTO มี *A Policy on Geometric Design of Highways and Streets, 7th Edition*; **ตัวเลขเฉพาะทั้งหมดที่กล่าวถึงข้างต้นยังคงสถานะ “ต้องตรวจสอบ” จนกว่าจะตรวจคู่มือฉบับที่หน่วยงาน/โครงการไทยกำหนดจริง**.

ข้อเสนอสุดท้ายคือให้ตำแหน่งผลิตภัณฑ์ของ TSD ชัดเจนว่าเป็น **“เครื่องมือคิดและสื่อสารแนวคิดที่เร็วเท่าเกม แต่ไม่แสร้งว่าความเร็วเท่ากับการรับรองทางวิศวกรรม”**. เส้นแบ่งนี้ทำให้สามารถสร้าง interchange ได้ง่ายขึ้นอย่างมากโดยไม่ทำลายความน่าเชื่อถือ: ทุก automatic action มี preview, ทุก generated object เปิดแก้ได้, ทุก warning อธิบายเหตุผล, ทุกมาตรฐานมีแหล่งอ้างอิง และทุกการเปลี่ยนแปลงย้อนกลับได้เป็นหน่วยงานออกแบบเดียว. **[ข้อเสนอของผู้วิจัย]**