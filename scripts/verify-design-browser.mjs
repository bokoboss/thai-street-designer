// Browser acceptance for the road-first workspace (/design): draw two roads (junction created automatically),
// edit the road section by number, undo/redo with readable labels, drag a road point, reload.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
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

  // Drag the first road's start point: one undo step.
  const point=await b.rect('[data-design-road-point="R-1:0"]');
  await b.drag(point,{x:point.x,y:point.y+40});
  await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-undo]').title`))==='ย้อนกลับ: ย้ายจุดแนวถนน ถนน 1','drag recorded as one step');

  // Work survives a reload.
  await sleep(300);await b.goto('/design');
  await b.waitFor(async()=>await b.count('[data-design-road]')===2&&await b.count('[data-network-junction-hit]')>0,'project restored after reload');
  // Drawing aids (slice 3): continue a road from its end, typed length, Shift turns snapping off.
  const move=(p,modifiers=0)=>b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,modifiers});
  await b.clickAt(at(-250,0));
  const endPt=await b.waitFor(()=>b.rect('[data-design-road-point="R-1:1"]'),'road 1 end handle');
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
  await b.waitFor(()=>b.count('[data-design-road-point="R-1:2"]'),'road 1 continued, not a new road');
  assert.equal(await b.count('[data-design-road]'),2,'continuing does not add a road');
  assert.match(await b.evalValue(`document.querySelector('[data-design-undo]').title`),/^ย้อนกลับ: ต่อถนน ถนน 1/);
  const [p1,p2]=[await b.rect('[data-design-road-point="R-1:1"]'),await b.rect('[data-design-road-point="R-1:2"]')];
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
  await b.waitFor(async()=>await b.count('[data-design-delta="changed"]')===1,'back on the alternative with its change');
  // Report figure (PNG) of the comparison.
  // Capture the download (headless has no download folder) and keep the figure as evidence.
  await b.evalValue(`(()=>{const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.png'))window.__figure=fetch(this.href).then(r=>r.blob()).then(b=>new Promise(res=>{const f=new FileReader();f.onload=()=>res(f.result);f.readAsDataURL(b);}));else click.call(this);};})()`);
  await b.click('[data-design-export]');
  await b.click('[data-design-export-format="png"]');
  await b.waitFor(async()=>/ส่งออกรูป .*\.png แล้ว/.test(await b.text('[data-design-notice]')??''),'figure exported');
  const figure=await b.evalValue('window.__figure');
  assert.match(figure,/^data:image\/png;base64,/,'figure is a PNG');
  writeFileSync('artifacts/design-figure-comparison.png',Buffer.from(figure.split(',')[1],'base64'));
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
  assert.deepEqual(b.errors,[],'no runtime errors');
  console.log(`PASS design workspace browser acceptance (${actions.length} actions: draw two roads with automatic junction, section by number in 5 actions, labelled undo/redo, point drag, reload, continue road + typed length in ${aidActions} actions, right-turn pocket with typed storage in ${pocketActions} actions, storage/corner handles, Slip lane, alternative in 1 action with highlighted difference, figure export, scenarios after reload, advanced junction round trip, home page)`);
}finally{b.close();}
