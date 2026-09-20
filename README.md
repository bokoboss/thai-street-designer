# Thai Street Designer

เว็บออกแบบแนวคิดทางแยกและวงเวียน สำหรับการจราจรชิดซ้าย

รายละเอียดการปรับปรุงล่าสุดและข้อจำกัด: [Remediation report](REMEDIATION.md)

## เริ่มใช้งาน

เลือกทางแยกหรือวงเวียน เปิด/ปิดขาถนนให้เหลือ 3 หรือ 4 ขา จากนั้นคลิกขาถนนบนแบบเพื่อแก้ไข

- **ถนน**: เปลี่ยนชื่อ มุม ความยาว เลน ทางเท้า Slip lane และแถบหน้าตัด
- **เส้นจราจร**: เกาะกลาง ทางม้าลาย สัญญาณไฟ เส้นหยุด และลูกศร
- **ริมทาง**: ต้นไม้และเสาไฟ ระยะห่าง ระยะเยื้อง และการสลับฝั่ง
- ลากจุดสีเขียวปลายขาที่เลือกเพื่อเปลี่ยนมุมและความยาว ใช้การจับมุม 1/5/15 องศา หรือล็อกความยาว
- ตัวเลขยืนยันเมื่อกด Enter หรือออกจากช่อง ลากพื้นที่ว่างเพื่อเลื่อนภาพ
- Undo ย้อนการลากทั้งครั้ง บันทึกอัตโนมัติบนเบราว์เซอร์เครื่องเดิม และบันทึก/เปิด JSON เพื่อย้ายเครื่อง
- 3D: ลากปุ่มซ้ายเพื่อเลื่อน ลากปุ่มกลางเพื่อหมุน เลื่อนล้อเพื่อซูม มีระดับทางเท้า เกาะกลาง ต้นไม้ และเสาไฟ
- การแสดงผล / ส่งออก: เปิดปิดชื่อถนน สเกล ลูกศร PNG โปร่งใส JPEG พื้นขาวไม่มีกริด SVG คงพื้นหลังแบบเดิม SVG เป็นผัง 2D; PNG/JPEG ส่งออกตามมุมมอง 2D หรือ 3D ที่เลือก

## ขอบเขตรุ่นนี้

ขาถนนเป็นเส้นตรงแยกมุมได้ มีระยะห่างมุมขั้นต่ำ 40 องศาเพื่อกันแบบซ้อนกัน กรณีที่พื้นที่ไม่พอสำหรับโค้ง Slip lane หรือเส้นทึบ 30 เมตรจะคงแบบเดิมและแสดงเหตุผล

หน้าตัดใช้กติกาคงที่ **ซ้าย = ขาเข้าแยก / กลาง = เกาะกลาง / ขวา = ขาออกแยก** ไม่กลับด้านตามทิศภูมิศาสตร์ ผู้ใช้เลือกองค์ประกอบจากผังหรือหน้าตัดและแก้ความกว้างจากหน้าตัดได้โดยตรง เลนหลักของแต่ละทิศทางใช้ความกว้างร่วมกัน ส่วนเลนเสริม/เลนรับสามารถกำหนดความกว้างแยกได้ แถบเพิ่มเติม ได้แก่ ไหล่ทาง เลนจักรยาน เลนมอเตอร์ไซค์ และพื้นที่คั่น

3D เป็นแบบฉายขนานจากพิกัดสามมิติ ใช้ Canvas และผัง SVG ชุดเดียวกัน ถนนอยู่ระดับเดียว ยังไม่มีภูมิประเทศ ความลาดชัน สะพาน การจำลองรถ การคำนวณแสง หรือการส่งออกโมเดล 3D ต้นไม้/เสาไฟเป็นชุดอัตโนมัติ ยังไม่มีการย้ายวัตถุทีละชิ้น

แบบนี้สำหรับสื่อสารแนวคิด ยังไม่ใช่แบบรับรองมาตรฐานวิศวกรรม

## Source

- `app/junction/model.ts`: ข้อมูลแบบ การตรวจและแปลง JSON รุ่นเก่า
- `app/junction/geometry.ts`: ขอบถนน ทางเท้า โค้ง Slip lane เส้นหยุด
- `app/junction/drawing.tsx`: ผัง SVG และลูกศร
- `app/junction/objects.ts`: ตำแหน่งต้นไม้/เสาไฟร่วม 2D/3D
- `app/junction/scene3d.tsx`: รูปทรงยกสูงและกล้อง 3D
- `app/junction/page.tsx`: เครื่องมือ ประวัติการแก้ไข autosave และส่งออก
- `app/roads/page.tsx`: พื้นที่ทำงานวาดถนนอิสระ (Free Draw / Network)

## Development

Node >= 22.13 และ pnpm ตาม `packageManager` ใน package.json

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm exec tsc --noEmit
pnpm test
pnpm test:builds
```

การทดสอบ geometry สร้างภาพตรวจในโฟลเดอร์ชั่วคราวที่ไม่บันทึกลง Git

## Validation

- TypeScript ผ่าน
- Geometry/render: ตั้งฉาก, 3 ขาทั้ง 4 แบบ, มุมเฉียงร่วมกับ Slip lane และถนนกว้างต่างกัน, Slip lane ทุกมุม, วงเวียนมุมเฉียง, แถบหน้าตัดและวัตถุริมทาง
- เส้นแบ่งเลนขาเข้าอ้างจากแนวควบคุม/เส้นหยุด ส่วนขาออกอ้างจาก datum ด้านออกของปากแยกหรือแนวสัมผัสทางออกวงเวียน และรองรับช่วงเส้นทึบแยกกันตามทิศทาง
- การย้ายข้อมูล JSON เดิม การปฏิเสธข้อมูลผิดและมุมแคบเกินไป
- Regression: median-first Auto allocation, explicit retained-median override, independent auxiliary widths, receiving-lane departure datum, lane-level selection/markings, fixed cross-section orientation, Free Draw shared allocation and schema migration
- Browser PNG/JPEG: ส่งออก 2400×2400 พิกเซล PNG มุมภาพ alpha 0; JPEG มุมภาพ RGB 255,255,255

ยังไม่ได้ทดสอบทุกขนาดหน้าจอหรือทุกชุดค่าทางเรขาคณิต

## Audit fixes

- SVG masks now follow each arm's length and full width, including long roads and wide sections.
- Validation rejects intersecting road/sidewalk outlines and splitter-island polygons before accepting an edit or imported file. This is a geometric validity check, not engineering certification.
- Slip crossing controls and file validation use a shared supported limit; existing 125 m designs can be reopened.
- Rejected imports retain the existing design and display the actual reason.
- Failed autosave recovery pauses automatic writes and offers the original raw data for download, preserving it for recovery.
- Unchanged number fields and no-op edits do not consume undo history.
- Sidewalk widths remain constant along straight approaches, transitioning through the joining curve.
- The SVG median, crossing mask and raised 3D median now share one sampled quadratic polygon.
- Regression tests cover long-road raster markings, narrow roundabouts, 125 m JSON round trips, sidewalk dimensions and median geometry. Browser checks confirm import rejection, successful 125 m import and unchanged-field undo.

## Touch, reset and image export

- **รีเซ็ตเป็นสี่แยก** restores the four-arm default design and camera. Undo restores the previous design.
- **2D:** drag one finger to pan, drag the enlarged endpoint handle to edit the road, use two fingers to pan and pinch zoom. Adding a second finger while editing an endpoint cancels that unfinished edit and switches to camera gestures.
- **3D:** choose Rotate or Pan for one-finger dragging; two fingers pan and pinch zoom. Zoom buttons and Fit View work without a mouse wheel.
- **PNG / JPEG:** preview before download; choose 1200, 2400 or 3600 pixels wide. 2D can export the whole design or the zoomed region. 3D exports the current camera framing and aspect ratio, without controls. PNG is transparent; JPEG is white without grid. SVG stays 2D vector output. Export size and 2D region preferences are remembered on the same browser.
- **Copy:** under Markings, choose section, markings, arrows or slip-lane properties and a destination arm or all active arms. Names, angles and lengths stay with their destination roads.
- **Opposite-arm alignment:** enabling the switch aligns the opposite indexed arm; later numeric angle edits and endpoint drags move the paired arm together.
- **Keyboard:** Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo, Ctrl/Cmd+S save JSON, except while typing in an input.

Browser verification covers reset/undo, 3D zoom buttons, opposite-arm alignment, copying markings and image preview/download. Pure pointer tests cover pinch ratio, anchoring, continuing with one finger and clearing cancelled pointers. Physical multi-touch devices have not yet been tested.

## Per-side roadside and 3D furniture

- New page sessions open a four-way junction. **เปิดแบบล่าสุด** restores the previous autosaved design; starting a new edit resumes autosave. Invalid previous data is still protected.
- Roadside settings belong to each arm and its incoming/outgoing sidewalk. Choose one side or both, or apply the displayed values to the same sides of all enabled arms. Existing global-setting JSON files retain their old appearance until edited.
- Tree height/crown diameter, pole height/diameter/arm reach, spacing, start setback and curb-to-center offset are editable. New curb offsets default to 0.5 m. Object centers are clamped 0.35 m inside sidewalk edges; sidewalks narrower than 0.75 m omit objects.
- Streetlights have arms pointing toward the road and downward-facing luminaires. Traffic signals are raised cantilever models with horizontal red-yellow-green lenses facing incoming traffic; the flat 2D symbol is removed from the 3D texture. The model does not simulate illumination or signal cycles.
- Each arm can use dashed lane dividers or a configurable solid segment (default 30 m), followed by dashes. Incoming dividers begin from the incoming control datum; outgoing dividers begin from the departure-side road-mouth/tangency datum. Increase road length when needed to fit the selected segment and its dashed continuation.
- Verified model migration, independent side settings, 0.5 m curb positioning, inward arms on four road directions, signal meshes, configurable divider lengths and all previous geometry regressions. Browser checks cover independent offsets, solid/dashed changes, 3D furniture and PNG export preview/download.

Lane divider controls now select incoming, outgoing or both directions within the selected arm. Each direction retains its own mode and solid length; changing incoming values does not change outgoing values. Legacy files without outgoing overrides inherit their former shared settings. Markings-copy includes both directions, and road-length checks consider directions that actually contain lane dividers. Regression coverage includes independent modes, lengths, other-arm isolation, legacy imports and rendered SVG paths.

## 3D occlusion correction

Replaced average-depth face sorting with a cached BSP visibility tree. Surfaces crossing another surface's plane are split, then traversed back-to-front for the current orthographic camera. Long sidewalk faces therefore cannot incorrectly cover nearer trees, lamps or traffic signals. Canvas previews and PNG/JPEG exports share this ordering. No design-file changes are required.

Regression: `node scripts/verify-junction.cjs` then `node scripts/verify-visibility.cjs`. The latter compares painted visibility with independently calculated nearest-surface depths at 8,505 overlap probes across 36 yaw/pitch combinations, using four-arm sidewalks and furniture. Browser checks cover rotation and PNG preview.

## Skew-junction approach datums

Each approach now measures setbacks from the farther of its own two curb tangencies instead of the largest junction-wide node extent. An acute corner only changes its two incident approaches. Median noses, crossings, stop/divider lines, arrows, section bands, selection extents, roadside placement and 3D furniture use that local datum consistently. The markings panel displays the selected approach datum; zero setback means its own mouth, not the intersection center. Roundabout datums are unchanged.

Tests cover the reported 315°/90°/180°/270° layout, unaffected west/south approaches, zero offsets, rotated designs, SVG placement, existing geometry cases and shared 3D visibility. Browser checks cover the skew layout, zero median/crosswalk offsets and disabling the crossing then setting the stop offset to zero.

## 3D mouse controls and image menu

- Left drag pans regardless of the touch-mode toggle. Middle drag orbits around the ground point under the initial click; dragging left increases yaw (scene turns right), and vertical drag tilts within 10–78 degrees. Right drag never moves the camera.
- Wheel zoom is anchored to the cursor and suppresses page scrolling. Mouse actions suppress middle-button auto-scroll. Pointer capture and cancellation clear unfinished gestures.
- Right-click opens the accessible image menu: transparent PNG, white JPEG, copy transparent PNG (2400 px wide), and reset view. Save opens the existing export preview. Copy starts the clipboard write during the user gesture and reports unsupported browsers or denied permission without claiming success.
- Touch retains one-finger pan/orbit selection (pan by default), with two-finger pan/pinch. Mouse button mapping is independent of the touch selector.
- Verified pure camera mapping, reversed yaw, fixed orbit pivot and cursor zoom anchor; browser checks cover left-drag pan, wheel zoom, context menu and export preview. The HTTP preview does not expose image clipboard APIs, so its unsupported-browser message was verified; successful clipboard image writing requires a supporting browser on HTTPS. Middle-button drag is covered by the camera tests; the browser automation supports only left-button dragging.

## Directional sections and pocket lanes

Select an arm, open **ถนน**, then select **ทิศทางหน้าตัด**. Incoming and outgoing directions independently retain lane width, sidewalk width and ordered shoulder/bicycle/motorcycle/separator bands. Existing designs inherit their original shared dimensions until edited.

Each direction supports 0–3 additional lanes on either side: left is curb-side and right is median-side, relative to travel. Incoming additions are turning pockets; outgoing additions are receiving lanes. Incoming full-width/storage length is referenced from the incoming control datum. Outgoing receiving length is referenced from the actual departure-side road-mouth/tangency datum, followed by its merge taper.

**Auto space allocation is feature-driven.** A median-side auxiliary lane uses available median width first and widens outward only by the actual deficit. A curb-side auxiliary lane widens outward by default. Shoulder/buffer reallocation and retained-median constraints are explicit choices rather than hidden Auto rules. A narrow residual median produces feedback; it does not silently force widening. Schema-4 imports preserve their former visual result through explicit migrated allocation settings.

Main and auxiliary lanes have lane identity and editable arrow markings. Outgoing receiving lanes default to a semantic **merge-to-main** arrow that is mirrored from local lane geometry rather than geographic screen direction. These remain conceptual geometric lanes without vehicle routing, capacity simulation or standards certification.

Verification: `node scripts/verify-junction.cjs` followed by `node scripts/verify-pockets.cjs`. Tests cover independent dimensions, legacy defaults, JSON validation, insufficient length, both pocket sides, outgoing receiving lanes, skew approaches, slip lanes and roundabouts. Browser checks cover independent directional controls, six added lanes, and 2D/3D rendering.

## Current verification commands

```sh
node scripts/verify-junction.cjs
node scripts/verify-pockets.cjs
node scripts/verify-constraints-roundabout.cjs
node scripts/verify-network.cjs
node scripts/verify-visibility.cjs
```

## Vercel (separate Next.js build)

See [VERCEL.md](./VERCEL.md). Use `pnpm build:vercel` for Vercel and `pnpm test:builds` to verify both targets. The existing `pnpm build` remains the ChatGPT Sites/vinext path.
