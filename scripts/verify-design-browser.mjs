// Browser acceptance for the road-first workspace (/design): draw two roads (junction created automatically),
// edit the road section by number, undo/redo with readable labels, drag a road point, reload.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
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
  await b.screenshot('artifacts/design-browser.png');
  assert.deepEqual(b.errors,[],'no runtime errors');
  console.log(`PASS design workspace browser acceptance (${actions.length} actions: draw two roads with automatic junction, section by number in 5 actions, labelled undo/redo, point drag, reload, continue road + typed length in ${aidActions} actions)`);
}finally{b.close();}
