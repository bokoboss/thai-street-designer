// Browser acceptance for the road-first workspace (/design): draw two roads, confirm the junction,
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
  assert.equal(await b.count('[data-design-candidate-state="open"]'),1,'crossing waits for confirmation');
  assert.equal(await b.count('[data-network-junction-hit]'),0,'no junction before confirmation');

  // Confirm the crossing as a junction.
  await act('open crossing',()=>b.click('[data-design-open-crossings]'));
  await act('confirm junction',()=>b.click('[data-design-action="confirm-junction"]'));
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'junction drawn');
  assert.equal(await b.count('[data-design-candidate]'),0);

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
  await b.screenshot('artifacts/design-browser.png');
  assert.deepEqual(b.errors,[],'no runtime errors');
  console.log(`PASS design workspace browser acceptance (${actions.length} actions: draw two roads, confirm junction, section by number in 5 actions, labelled undo/redo, point drag, reload)`);
}finally{b.close();}
