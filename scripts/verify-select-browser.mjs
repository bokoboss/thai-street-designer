// Select as the editing hub in the browser: box / Shift selection, drag-move as one undo step, right-click menu,
// split, keys, touch equivalents (multi-select button, move by typed distances), no edit from panning or empty drags.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {startSession} from './test-support/cdp-browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const section={forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:4,walk:2};
const fixture={kind:'road-first',schemaVersion:3,title:'ตรวจการเลือก',decisions:[],options:{},roads:[
  {id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-200,y:0},{x:200,y:0}],section},
  {id:'C',name:'ถนนซี',alignment:'arc',points:[{x:-200,y:120},{x:200,y:120}],section}]};
const b=await startSession({root,path:'/design',profile:'.test-build/chrome-select'});
const current=()=>b.evalValue(`JSON.parse(localStorage.getItem('thai-street-road-first-v1')).scenarios[0].project`);
const screen=(x,y)=>b.evalValue(`(()=>{const p=new DOMPoint(${x},${y}).matrixTransform(document.querySelector('[data-design-plan]').getScreenCTM());return{x:p.x,y:p.y};})()`);
const mouse=(type,p,extra={})=>b.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',...extra});
const shiftClick=async p=>{await mouse('mouseMoved',p);await mouse('mousePressed',p,{clickCount:1,modifiers:8});await mouse('mouseReleased',p,{clickCount:1,modifiers:8});};
const rightClick=async p=>{await mouse('mouseMoved',p);await mouse('mousePressed',p,{button:'right',clickCount:1});await mouse('mouseReleased',p,{button:'right',clickCount:1});};
const middleDrag=async(from,to)=>{await mouse('mouseMoved',from);await mouse('mousePressed',from,{button:'middle',clickCount:1});for(let i=1;i<=5;i++)await mouse('mouseMoved',{x:from.x+(to.x-from.x)*i/5,y:from.y+(to.y-from.y)*i/5},{button:'middle',buttons:4});await mouse('mouseReleased',to,{button:'middle',clickCount:1});};
const sel=()=>b.evalValue(`document.querySelector('[data-design-inspector]')?.dataset.designInspector`);
try{
  await b.waitFor(()=>b.count('[data-design-ready="true"]'),'loaded');
  await b.evalValue(`localStorage.setItem('thai-street-road-first-v1',${JSON.stringify(JSON.stringify(fixture))})`);await b.send('Page.reload');
  await b.waitFor(()=>b.count('[data-design-ready="true"]'),'ready');
  // Panning (middle button) and dragging on the empty plan never edit.
  await middleDrag(await screen(-100,60),await screen(-60,80));await b.drag(await screen(-150,200),await screen(-140,210));
  assert.deepEqual((await current()).roads,fixture.roads,'pan and empty drag leave the design unchanged');
  // Box selection on the empty plan, then Shift+click adds a road.
  await b.drag(await screen(-30,100),await screen(30,140));
  await b.waitFor(async()=>await sel()==='road'&&await b.count('[data-design-road-selected]')===1,'box selects the road it touches');
  await shiftClick(await screen(-100,0));await b.waitFor(async()=>await sel()==='roads'&&await b.count('[data-design-multi-count="2"]'),'Shift+click adds');
  await b.screenshot('artifacts/select-multi.png');
  // Drag one of the selected roads: both move together; one undo puts both back.
  const before=await current();
  await b.drag(await screen(100,0),await screen(100,30),8);
  await b.waitFor(async()=>{const p=await current();return Math.abs(p.roads[0].points[0].y-30)<.11&&Math.abs(p.roads[1].points[0].y-150)<.11;},'selection moved together');
  assert.equal(await sel(),'roads','still both selected after the drag');
  await b.click('[data-design-undo]');await b.waitFor(async()=>JSON.stringify((await current()).roads)===JSON.stringify(before.roads),'one undo for the drag');
  // Touch / keyboard equivalent: move by typed distances.
  await b.evalValue(`(()=>{const i=document.querySelector('[data-design-field="multi-dx"]'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'10');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await b.click('[data-design-action="multi-move"]');
  await b.waitFor(async()=>{const p=await current();return Math.abs(p.roads[0].points[0].x+190)<1e-6&&Math.abs(p.roads[1].points[0].x+190)<1e-6;},'moved 10 m by number');
  await b.click('[data-design-undo]');
  // Right-click menu on a single road: split here.
  await b.clickAt(await screen(-100,0));await b.waitFor(async()=>await sel()==='road','single road');
  await rightClick(await screen(50,0));await b.waitFor(()=>b.count('[data-design-context-menu]'),'context menu');
  assert.ok(await b.count('[data-design-menu="split"]')&&await b.count('[data-design-menu="zoom"]')&&await b.count('[data-design-menu="delete"]'));
  await b.screenshot('artifacts/select-menu.png');
  await b.click('[data-design-menu="split"]');
  await b.waitFor(async()=>(await current()).roads.length===3&&await b.count('[data-design-multi-count="2"]'),'split into two pieces, both selected');
  // The two pieces can be joined back from the menu.
  await rightClick(await screen(-100,0));await b.waitFor(()=>b.count('[data-design-menu="join"]'),'join offered for the two pieces');
  await b.click('[data-design-menu="join"]');await b.waitFor(async()=>(await current()).roads.length===2,'joined back');
  // Keys: Ctrl+A selects all roads; Escape clears; Delete removes the selection (one undo brings both back).
  await b.clickAt(await screen(-150,200));await b.key('a','KeyA',2);await b.waitFor(()=>b.count('[data-design-multi-count="2"]'),'Ctrl+A');
  await b.key('Delete','Delete');await b.waitFor(async()=>(await current()).roads.length===0,'Delete removes both');
  await b.click('[data-design-undo]');await b.waitFor(async()=>(await current()).roads.length===2,'one undo restores both');
  // Touch: the multi-select button makes taps add / remove.
  await b.clickAt(await screen(-150,200));await b.click('[data-design-multi-select]');
  await b.clickAt(await screen(-100,0));await b.clickAt(await screen(-100,120));await b.waitFor(()=>b.count('[data-design-multi-count="2"]'),'taps add with multi-select on');
  await b.clickAt(await screen(-100,0));await b.waitFor(async()=>await sel()==='road','tap again removes');
  // Reverse from the menu; straighten from the road panel.
  await b.click('[data-design-multi-select]');
  await b.clickAt(await screen(-100,0));await rightClick(await screen(-100,0));await b.click('[data-design-menu="reverse"]');
  await b.waitFor(async()=>(await current()).roads[0].points[0].x===200,'reversed');
  await b.click('[data-design-undo]');
  // Tangent curve between two roads whose straights meet: Ctrl+A, then the menu.
  const corner={...fixture,roads:[{...fixture.roads[0],points:[{x:-200,y:0},{x:-50,y:0}]},{...fixture.roads[1],points:[{x:0,y:50},{x:0,y:200}]}]};
  await b.evalValue(`localStorage.setItem('thai-street-road-first-v1',${JSON.stringify(JSON.stringify(corner))})`);await b.send('Page.reload');
  await b.waitFor(()=>b.count('[data-design-ready="true"]'),'ready');
  await b.clickAt(await screen(-150,150));await b.key('a','KeyA',2);await b.waitFor(()=>b.count('[data-design-tangent]'),'tangent offered with its radius');
  await rightClick(await screen(-100,0));await b.waitFor(()=>b.count('[data-design-menu="tangent"]'),'tangent in the menu');
  await b.click('[data-design-menu="tangent"]');
  await b.waitFor(async()=>{const p=await current();return p.roads.length===1&&p.roads[0].points.length===3&&p.roads[0].points[1].radius===90;},'joined with a tangent curve');
  await b.screenshot('artifacts/select-tangent.png');
  await b.click('[data-design-undo]');await b.waitFor(async()=>(await current()).roads.length===2,'one undo');
  // One-shot guides while drawing: the extension of a road end, then parallel to the road last hovered, with its distance.
  {await b.evalValue(`localStorage.setItem('thai-street-road-first-v1',${JSON.stringify(JSON.stringify(fixture))})`);await b.send('Page.reload');
   await b.waitFor(()=>b.count('[data-design-ready="true"]'),'ready');await b.click('[data-design-tool-button="road"]');
   await mouse('mouseMoved',await screen(260,1));await b.waitFor(async()=>/แนวต่อของ ถนนเอ/.test(await b.text('.design-snap-badge')??''),'extension guide');
   assert.equal(await b.count('[data-design-guide="extension"]'),1);await b.screenshot('artifacts/guide-extension.png');
   await mouse('mouseMoved',await screen(-100,121));await b.waitFor(()=>b.count('[data-design-reference-road="C"]'),'hovered road becomes the reference');
   await b.clickAt(await screen(-120,60));await mouse('mouseMoved',await screen(0,63));
   await b.waitFor(async()=>/ขนานกับ ถนนซี/.test(await b.text('.design-snap-badge')??''),'parallel guide');
   assert.match(await b.text('[data-design-readout]'),/ห่าง ถนนซี 60\.0 ม\./);await b.screenshot('artifacts/guide-parallel.png');
   await b.key('Escape','Escape');}
  assert.deepEqual(b.errors,[]);
  console.log('PASS select browser: one-shot guides (extension, parallel with distance), reverse from the menu, tangent curve between two roads, pan / empty drag never edit, box select, Shift+click, drag-move as one undo, move by number, right-click split and join, Ctrl+A / Delete / undo, multi-select button for touch');
}catch(error){await b.screenshot('artifacts/select-browser-failure.png');throw error;}finally{b.close();}
