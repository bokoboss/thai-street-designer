// Browser acceptance for the road-first workspace (/design): draw two roads (junction created automatically),
// edit the road section by number, undo/redo with readable labels, drag a road point, reload.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {startSession} from './test-support/cdp-browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);mkdirSync('artifacts',{recursive:true});
const b=await startSession({root,path:'/design',profile:'.test-build/chrome-design-acceptance'});
const actions=[];const act=(label,fn)=>{actions.push(label);return fn();};
try{
  await b.waitFor(()=>b.count('[data-design-notice]'),'workspace loaded');
  assert.match(await b.text('.design-inspector'),/วาดถนน/,'empty project explains how to start');
  const canvas=await b.rect('.design-canvas'),at=(dx,dy)=>({x:canvas.x+dx,y:canvas.y+dy});

  // Draw two crossing roads.
  await act('tool: Draw Road',()=>b.click('[data-design-tool-button="road"]'));
  await act('click road start',()=>b.clickAt(at(-330,0)));
  await act('double-click road end',()=>b.clickAt(at(330,0),2));
  await b.waitFor(async()=>await b.count('[data-design-road]')===1,'first road');
  await act('tool: Draw Road',()=>b.click('[data-design-tool-button="road"]'));
  await act('click road start',()=>b.clickAt(at(0,-250)));
  await act('double-click road end',()=>b.clickAt(at(0,250),2));
  await b.waitFor(async()=>await b.count('[data-design-road]')===2,'second road');
  // The crossing becomes a junction automatically and says so, with Undo and grade separation at hand.
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'junction created automatically');
  assert.equal(await b.count('[data-design-candidate]'),0,'no pending crossing');
  assert.equal(actions.length,6,'two roads and a junction in 6 actions');
  assert.match(await b.text('[data-design-auto-junction]'),/สร้างทางแยกให้แล้ว 1 แห่ง/);
  await b.click('[data-design-toast-action="grade-separated"]');
  await b.waitFor(async()=>await b.count('[data-network-junction-hit]')===0,'turned into a grade separation');
  await b.click('[data-design-undo]');
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'undo brings the junction back');

  // Edit the first road's section by number (T3).
  const before=actions.length;
  await act('select road',()=>b.clickAt(at(-250,0)));
  await b.waitFor(()=>b.count('[data-design-section]'),'section strip');
  for(const [field,value] of [['lane-width','3.5'],['walk','2.5']]){
    await act('click field',()=>b.click(`[data-design-field="${field}"]`));
    await b.evalValue(`document.querySelector('[data-design-field="${field}"]').select()`);
    await act('type value + Enter',async()=>{await b.type(value);await b.key('Enter');});
  }
  const section=await b.waitFor(async()=>{const t=await b.text('[data-design-section]');return t?.includes('3.50')&&t.includes('2.50')?t:null;},'section updated');
  assert.equal(actions.length-before,5,'section edit takes 5 actions');
  assert.match(section,/21\.00/,'total width 2×2.5 + 4×3.5 + 2');

  // Undo/redo carry readable labels.
  assert.equal(await b.evalValue(`document.querySelector('[data-design-undo]').title`),'ย้อนกลับ: ปรับหน้าตัด ถนน 1: ทางเท้า 2.5');
  await b.click('[data-design-undo]');
  await b.waitFor(async()=>(await b.text('[data-design-section]'))?.includes('2.00'),'undo restores sidewalk');
  await b.click('[data-design-redo]');
  await b.waitFor(async()=>(await b.text('[data-design-section]'))?.includes('2.50'),'redo re-applies');

  // Road ids are opaque and never reused; find them in drawing order.
  const roadId=i=>b.evalValue(`document.querySelectorAll('[data-design-road]')[${i}].dataset.designRoad`),R1=await roadId(0),R2=await roadId(1);
  // Drag the first road's start point: one undo step.
  const point=await b.rect(`[data-design-road-point="${R1}:0"]`);
  await b.drag(point,{x:point.x,y:point.y+40});
  await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-undo]').title`))==='ย้อนกลับ: ย้ายจุดแนวถนน ถนน 1','drag recorded as one step');

  // Work survives a reload.
  await sleep(300);await b.goto('/design');
  await b.waitFor(async()=>await b.count('[data-design-road]')===2&&await b.count('[data-network-junction-hit]')>0,'project restored after reload');
  // Drawing aids (slice 3): continue a road from its end, typed length, Shift turns snapping off.
  const move=(p,modifiers=0)=>b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,modifiers});
  // Let the plan finish fitting after the reload before picking a road by position.
  await sleep(500);
  await b.clickAt(at(-250,0));
  const endPt=await b.waitFor(()=>b.rect(`[data-design-road-point="${R1}:1"]`),'road 1 end handle');
  const near={x:endPt.x+4,y:endPt.y+4},up={x:endPt.x+1,y:endPt.y-160};
  const aidStart=actions.length;
  await act('tool: Draw Road',()=>b.click('[data-design-tool-button="road"]'));
  await move(near,8);
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-snap]')?.dataset.designSnap`)==='none','Shift turns snapping off');
  await move(near);
  await b.waitFor(async()=>(await b.text('[data-design-readout]'))?.includes('ต่อจากปลายถนน'),'snaps to the road end');
  await act('click road end',()=>b.clickAt(near));
  await move(up);
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-snap]')?.dataset.designSnap`)==='angle','angle lock while drawing');
  await act('type 50',async()=>{await b.key('5','Digit5');await b.key('0','Digit0');});
  await b.waitFor(async()=>(await b.text('[data-design-readout]'))?.includes('50 ม.'),'typed length shown');
  await act('Enter (place point)',()=>b.key('Enter'));
  await act('Enter (finish)',()=>b.key('Enter'));
  await b.waitFor(()=>b.count(`[data-design-road-point="${R1}:2"]`),'road 1 continued, not a new road');
  assert.equal(await b.count('[data-design-road]'),2,'continuing does not add a road');
  assert.match(await b.evalValue(`document.querySelector('[data-design-undo]').title`),/^ย้อนกลับ: ต่อถนน ถนน 1/);
  const [p1,p2]=[await b.rect(`[data-design-road-point="${R1}:1"]`),await b.rect(`[data-design-road-point="${R1}:2"]`)];
  assert.ok(Math.abs(p1.x-p2.x)<1.5&&p2.y<p1.y,'typed segment follows the locked angle');
  const aidActions=actions.length-aidStart;
  assert.equal(aidActions,5,'continue a road by an exact length in 5 actions');
  // Junction detail in place (slice 4): click an approach on the plan, add a right-turn pocket and type its storage,
  // drag the storage and corner handles, add a Slip lane.
  await b.key('Escape');
  // Each arm has a hit line from the junction centre; click beside the road centreline so the approach, not the road, is picked.
  const jc=await b.rect('[data-network-junction-hit]');
  const detailStart=actions.length;
  await act('click approach on plan',()=>b.clickAt({x:jc.x+14,y:jc.y}));
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-inspector]')?.dataset.designInspector`)==='approach','approach selected from the plan');
  await act('+ right-turn pocket',()=>b.click('[data-design-action="add-right-pocket"]'));
  await b.waitFor(()=>b.count('[data-design-pocket="right"]'),'pocket fields');
  await act('click storage field',()=>b.click('[data-design-field="right-length"]'));
  await b.evalValue(`document.querySelector('[data-design-field="right-length"]').select()`);
  await act('type 40 + Enter',async()=>{await b.type('40');await b.key('Enter');});
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-field="right-length"]').value`)==='40','storage typed in place');
  const pocketActions=actions.length-detailStart;
  assert.ok(pocketActions<=5,`right-turn pocket with typed storage in ${pocketActions} actions`);
  const ph=await b.waitFor(()=>b.rect('[data-design-pocket-handle="right"]'),'storage handle on the plan');
  // Drag away from the junction centre (start of the arm hit line) to lengthen the storage.
  const centre=await b.evalValue(`(()=>{const l=document.querySelector('[data-network-junction-hit]'),m=l.getScreenCTM(),p=new DOMPoint(l.x1.baseVal.value,l.y1.baseVal.value).matrixTransform(m);return{x:p.x,y:p.y};})()`);
  const away=Math.hypot(ph.x-centre.x,ph.y-centre.y);
  await b.drag(ph,{x:ph.x+(ph.x-centre.x)/away*25,y:ph.y+(ph.y-centre.y)/away*25});
  const dragged=await b.waitFor(async()=>{const v=Number(await b.evalValue(`document.querySelector('[data-design-field="right-length"]').value`));return v>=45?v:null;},'dragging the handle changes the same storage value');
  assert.ok(Number.isInteger(dragged),'handle snaps storage to whole metres');
  assert.match(await b.evalValue(`document.querySelector('[data-design-undo]').title`),/^ย้อนกลับ: แก้ขา /);
  const ch=await b.rect('[data-design-corner-handle="0"]');
  await b.drag(ch,{x:ch.x+12,y:ch.y+12});
  await b.waitFor(async()=>/^ย้อนกลับ: ปรับรัศมีมุม /.test(await b.evalValue(`document.querySelector('[data-design-undo]').title`)),'corner handle edits the corner radius');
  await b.click('[data-design-action="add-slip"]');
  await b.waitFor(()=>b.count('[data-design-slip]'),'Slip lane added in place');
  assert.match(await b.evalValue(`document.querySelector('[data-design-undo]').title`),/^ย้อนกลับ: ตั้ง Slip lane/);
  // Scenarios (slice 5): copy as an alternative, change it, see the difference highlighted, switch back, export a figure.
  await act('+ ทางเลือก',()=>b.click('[data-design-scenario-add]'));
  await b.waitFor(async()=>(await b.text('[data-design-scenario][aria-selected="true"]'))==='ทางเลือก A','alternative created and active');
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-compare]')?.dataset.designCompare`)==='0','comparison on, nothing differs yet');
  await b.clickAt({x:jc.x+14,y:jc.y});
  // A Slip lane already serves the left turn here, so a left-turn pocket is not offered; change the right-turn pocket instead.
  assert.equal(await b.count('[data-design-blocked="left-pocket"]'),1,'left-turn pocket blocked beside the Slip lane');
  await b.click('[data-design-field="right-lanes"]');
  await b.evalValue(`document.querySelector('[data-design-field="right-lanes"]').select()`);
  await b.type('2');await b.key('Enter');
  await b.waitFor(async()=>await b.count('[data-design-delta="changed"]')===1,'changed junction highlighted on the plan');
  await b.clickAt({x:canvas.x-canvas.w/2+40,y:canvas.y+canvas.h/2-60});
  await b.waitFor(async()=>(await b.text('[data-design-comparison]'))?.includes('เลนเลี้ยว'),'comparison list names what changed');
  assert.match(await b.text("[data-design-comparison]"),/เลนเลี้ยว\s*1 → 2/,"turn-lane count 1 → 2");
  // Existing is untouched and has nothing to compare with.
  await b.click('[data-design-scenario="existing"]');
  await b.waitFor(async()=>await b.count('[data-design-compare-toggle]')===0&&await b.count('[data-design-compare]')===0,'Existing shown without comparison');
  await b.click('[data-design-scenario="alt-1"]');
  await b.waitFor(async()=>(await b.text('[data-design-scenario][aria-selected="true"]'))==='ทางเลือก A','switched to the alternative');
  await b.waitFor(async()=>await b.count('[data-design-delta="changed"]')===1,'back on the alternative with its change');
  // Report figure (PNG) of the comparison.
  // Capture the download (headless has no download folder) and keep the figure as evidence.
  await b.evalValue(`(()=>{const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.html'))window.__report=fetch(this.href).then(r=>r.text());else if(this.download.endsWith('.png'))window.__figure=fetch(this.href).then(r=>r.blob()).then(b=>new Promise(res=>{const f=new FileReader();f.onload=()=>res(f.result);f.readAsDataURL(b);}));else click.call(this);};})()`);
  await b.click('[data-design-export]');
  await b.click('[data-design-export-format="png"]');
  await b.waitFor(async()=>/ส่งออกรูป .*\.png แล้ว/.test(await b.text('[data-design-notice]')??''),'figure exported');
  const figure=await b.evalValue('window.__figure');
  assert.match(figure,/^data:image\/png;base64,/,'figure is a PNG');
  writeFileSync('artifacts/design-figure-comparison.png',Buffer.from(figure.split(',')[1],'base64'));
  // Design Summary report of the scenario being edited.
  await b.click('[data-design-export]');await b.click('[data-design-export-format="report"]');
  const report=await b.waitFor(()=>b.evalValue('window.__report'),'report exported');
  assert.match(report,/Junction Register/);assert.match(report,/ทางเลือก A/);
  // 3D view of the same compiled design.
  await b.click('[data-design-view="3d"]');
  await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-network-scene-junction-surfaces]')?.dataset.networkSceneJunctionSurfaces??0`))>0,'3D view shows the junction');
  await sleep(300);await b.screenshot('artifacts/design-browser-3d.png');
  await b.click('[data-design-view="2d"]');
  await b.waitFor(async()=>await b.count('.network-scene3d')===0,'back to the plan');
  await b.screenshot('artifacts/design-browser.png');
  // Scenarios survive a reload.
  await sleep(300);await b.goto('/design');
  await b.waitFor(async()=>await b.count('[data-design-scenario]')===2,'both scenarios restored after reload');

  // Advanced junction editing (slice 6, staged): hand the junction to the junction editor, add a median opening there,
  // come back — the edit arrives as one undoable step in the same scenario.
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'junction after reload');
  const jc2=await b.rect('[data-network-junction-hit]');
  await b.clickAt({x:jc2.x+14,y:jc2.y});
  await b.click('[data-design-action="back-to-junction"]');
  await b.click('[data-design-action="advanced-junction"]');
  await b.waitFor(async()=>(await b.evalValue('location.pathname'))==='/junction'&&await b.count('[data-junction-back-to-design]')===1,'junction editor opened from /design');
  await b.evalValue(`document.querySelector('[title^="ค้นหาคำสั่ง"]').click()`);
  await b.waitFor(()=>b.count('input[aria-label="ค้นหาคำสั่ง"]'),'command search');
  await b.click('input[aria-label="ค้นหาคำสั่ง"]');await b.type('เพิ่มช่องเปิดเกาะกลาง');await b.key('Enter');
  await b.waitFor(async()=>await b.evalValue(`(()=>{const h=JSON.parse(localStorage.getItem('thai-street-design-junction-handoff-v1'));const p=h.network.scenarios[0].project;return p.junctions[0].design.arms.some(a=>(a.medianOpenings??[]).length>0);})()`),'edit saved into the hand-off');
  await b.click('[data-junction-back-to-design]');
  await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-undo]')?.title??''`)).startsWith('ย้อนกลับ: แก้ทางแยกขั้นสูง'),'advanced edit back as one undo step');
  assert.equal(await b.evalValue(`document.querySelector('[data-design-inspector]').dataset.designInspector`),'junction','returned junction selected');
  assert.equal(await b.text('[data-design-scenario][aria-selected="true"]'),'ทางเลือก A','same scenario');
  assert.equal(await b.evalValue(`localStorage.getItem('thai-street-design-junction-handoff-v1')`),null,'hand-off consumed');
  assert.equal(await b.evalValue(`localStorage.getItem('thai-street-network-project-v1')`),null,'earlier Network data untouched');
  // The home page is the road-first workspace.
  await b.goto('/');await b.waitFor(()=>b.count('[data-design-workspace]'),'home page is /design');

  // Reference image (slice 6b-2): add, scale from a known distance, move, remove.
  const png=(w,h)=>{const crc=buf=>{let c,crcTable=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}let x=0xffffffff;for(const v of buf)x=crcTable[(x^v)&255]^(x>>>8);return(x^0xffffffff)>>>0;};
    const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
    const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
    const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;raw[o]=200;raw[o+1]=x%20<2?60:220;raw[o+2]=180;}
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);};
  writeFileSync('.test-build/reference.png',png(400,200));
  await b.clickAt({x:canvas.x-canvas.w/2+40,y:canvas.y+canvas.h/2-60});
  await b.waitFor(()=>b.count('[data-design-reference="none"]'),'reference panel');
  // Choose the file through the real input (retried once in case the panel re-rendered between lookup and upload).
  for(let attempt=0;attempt<3&&!await b.count('[data-design-reference-image]');attempt++){
    const doc=await b.send('DOM.getDocument',{depth:-1}),node=await b.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-design-reference-input]'});
    if(node.nodeId)await b.send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[root+'.test-build/reference.png']});
    await b.waitFor(()=>b.count('[data-design-reference-image]'),'reference image',5000).catch(()=>null);
  }
  await b.waitFor(()=>b.count('[data-design-reference-image]'),'reference image under the plan').catch(async e=>{console.log('DBG',await b.text('[data-design-notice]'));throw e;});
  await b.click('[data-design-action="calibrate-reference"]');
  const ca={x:canvas.x-canvas.w/2+120,y:canvas.y+canvas.h/2-120},cb={x:ca.x+200,y:ca.y};
  await b.clickAt(ca);await b.clickAt(cb);
  await b.waitFor(()=>b.count('[data-design-field="reference-distance"]'),'distance field after A and B');
  await b.click('[data-design-field="reference-distance"]');await b.evalValue(`document.querySelector('[data-design-field="reference-distance"]').select()`);
  await b.type('50');await b.key('Enter');
  await b.waitFor(()=>b.count('[data-design-reference="calibrated"]'),'image scaled from a known distance');
  const stored=()=>b.evalValue(`JSON.parse(localStorage.getItem('thai-street-local-image-reference-v1'))`);
  const scaled=await stored();assert.equal(scaled.calibrationDistance,50);
  await b.screenshot('artifacts/design-browser-reference.png');
  await b.click('[data-design-action="move-reference"]');
  await b.drag({x:ca.x,y:ca.y+40},{x:ca.x+60,y:ca.y+40});
  await b.waitFor(async()=>(await stored()).x>scaled.x,'image moved by dragging');
  await b.click('[data-design-action="move-reference"]');
  await b.click('[data-design-action="remove-reference"]');await b.click('[data-design-action="remove-reference"]');
  await b.waitFor(()=>b.count('[data-design-reference="none"]'),'image removed');

  // Section by station (slice 6b-3): the selected road's segment through the same resolver as the earlier page.
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'plan');
  const r1=await b.rect(`[data-design-road="${R2}"] path`);
  await b.clickAt({x:r1.x,y:r1.y-r1.h*.35});
  await b.click('[data-design-section-mode="station"]');
  await b.waitFor(async()=>await b.count('[data-design-section-station]')===1&&await b.count('.network-section-components')===1,'section at a station');
  await b.click('[data-design-section-mode="road"]');
  // Online map under the plan (no network here, so only placement is checked): show, drag to line up, hide.
  await b.clickAt({x:canvas.x-canvas.w/2+40,y:canvas.y-canvas.h/2+150});
  await b.waitFor(()=>b.count('[data-design-map-visible]'),'map panel');
  await b.evalValue(`document.querySelector('[data-design-map-visible]').click()`);
  await b.waitFor(async()=>await b.count('.design-canvas>.map-reference-layer')===1,'map layer under the plan');
  await b.click('[data-design-action="move-map"]');
  const mapRef=()=>b.evalValue(`JSON.parse(localStorage.getItem('thai-street-map-reference-v1'))`),mapBefore=await mapRef();
  await b.drag({x:canvas.x-canvas.w/2+200,y:canvas.y},{x:canvas.x-canvas.w/2+260,y:canvas.y+30});
  await b.waitFor(async()=>{const m=await mapRef();return m.offsetX>mapBefore.offsetX&&m.offsetY>mapBefore.offsetY;},'map moved by dragging');
  await b.click('[data-design-action="move-map"]');
  await b.evalValue(`document.querySelector('[data-design-map-visible]').click()`);
  await b.waitFor(async()=>await b.count('.map-reference-layer')===0,'map hidden');

  // The earlier Network page is retired: its URL opens /design, and work it saved in this browser can be added as alternatives.
  await b.goto('/network');await b.waitFor(async()=>(await b.evalValue('location.pathname'))==='/design'&&await b.count('[data-design-workspace]'),'/network opens /design');
  await b.evalValue(`localStorage.setItem('thai-street-network-project-v1',JSON.stringify({workspaceVersion:1,activeScenarioId:'existing',scenarios:[{id:'existing',name:'Existing',kind:'existing',project:{schemaVersion:5,title:'งานเดิม',junctions:[],links:[],parallelCorridors:[],roadEnds:[]}}]}))`);
  await b.goto('/design');await b.waitFor(()=>b.count('[data-design-action="import-earlier"]'),'import offered when earlier work exists');
  const scenariosBefore=await b.count('[data-design-scenario]');
  await b.click('[data-design-action="import-earlier"]');
  await b.waitFor(async()=>await b.count('[data-design-scenario]')===scenariosBefore+1,'earlier work added as an alternative');
  assert.equal(await b.text('[data-design-scenario][aria-selected="true"]'),'สภาพเดิม (หน้าเดิม)');

  // Data safety (P0, independent review): save state visible; a removed alternative can be restored.
  assert.equal(await b.count('[data-design-save-state="saved"]'),1,'autosave state shown');
  const before2=await b.count('[data-design-scenario]');
  await b.click('[data-design-action="remove-scenario"]');await b.click('[data-design-action="remove-scenario"]');
  await b.waitFor(async()=>await b.count('[data-design-scenario]')===before2-1&&await b.count('[data-design-removed-toast]')===1,'alternative removed, restore offered');
  await b.click('[data-design-toast-action="restore-scenario"]');
  await b.waitFor(async()=>await b.count('[data-design-scenario]')===before2&&(await b.text('[data-design-scenario][aria-selected="true"]'))==='สภาพเดิม (หน้าเดิม)','alternative restored');
  // Two typed values in the same field are two undo steps.
  await b.click('[data-design-scenario="alt-1"]');
  await b.waitFor(()=>b.count(`[data-design-road="${R2}"]`),'alternative plan');await sleep(300);
  const rr=await b.rect(`[data-design-road="${R2}"] path`);await b.clickAt({x:rr.x,y:rr.y-rr.h*.35});
  await b.waitFor(()=>b.count('[data-design-field="walk"]'),'road selected');
  for(const v of ['3','3.5']){await b.click('[data-design-field="walk"]');await b.evalValue(`document.querySelector('[data-design-field="walk"]').select()`);await b.type(v);await b.key('Enter');
    await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-field="walk"]').value`)===v,'walk '+v);}
  await b.click('[data-design-undo]');
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-field="walk"]').value`)==='3','one undo goes back one typed value');
  // Leaving the advanced editor waits for a successful save.
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'junction');const jc3=await b.rect('[data-network-junction-hit]');
  await b.clickAt({x:jc3.x+14,y:jc3.y});await b.click('[data-design-action="back-to-junction"]');await b.click('[data-design-action="advanced-junction"]');
  await b.waitFor(()=>b.count('[data-junction-back-to-design]'),'advanced editor');
  await b.evalValue(`localStorage.setItem('thai-street-design-junction-handoff-v1','{broken')`);
  await b.click('[data-junction-back-to-design]');await sleep(400);
  assert.equal(await b.evalValue('location.pathname'),'/junction','stays when the edits cannot be saved back');
  assert.match(await b.evalValue('document.body.innerText'),/อ่านข้อมูลที่ส่งมาจากหน้าออกแบบไม่ได้/);
  // Stored work that cannot be read is copied aside, never silently replaced.
  await b.evalValue(`localStorage.setItem('thai-street-road-first-v1','{broken')`);
  await b.goto('/design');await b.waitFor(()=>b.count('[data-design-unreadable]'),'unreadable work reported');
  assert.equal(await b.evalValue(`localStorage.getItem('thai-street-road-first-v1-unreadable')`),'{broken','copy kept');
  assert.equal(await b.count('[data-design-notice="error"]'),1);
  assert.deepEqual(b.errors,[],'no runtime errors');
  console.log(`PASS design workspace browser acceptance (${actions.length} actions: draw two roads with automatic junction, section by number in 5 actions, labelled undo/redo, point drag, reload, continue road + typed length in ${aidActions} actions, right-turn pocket with typed storage in ${pocketActions} actions, storage/corner handles, Slip lane, alternative in 1 action with highlighted difference, figure export, scenarios after reload, advanced junction round trip, home page, Design Summary, 3D view, reference image scale/move/remove, section by station, online map placement, /network redirect + import of earlier work, save state, restore removed alternative, one undo per typed value, advanced editor waits for save, unreadable storage kept)`);
}finally{b.close();}
