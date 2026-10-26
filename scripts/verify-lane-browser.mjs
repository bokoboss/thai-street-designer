// Lane runs in /design: add a lane along a stretch from the road panel, drag its end on the plan (one undo), and see it in
// the plan, the section by station and 3D.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {startSession} from './test-support/cdp-browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const section={forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:4,walk:2};
const fixture={kind:'road-first',schemaVersion:3,title:'ตรวจช่องเพิ่ม',decisions:[],options:{},roads:[{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-200,y:0},{x:200,y:0}],section}]};
const b=await startSession({root,path:'/design',profile:'.test-build/chrome-lanes'});
const current=()=>b.evalValue(`JSON.parse(localStorage.getItem('thai-street-road-first-v1')).scenarios[0].project`);
// Open a fold and let the panel settle before clicking inside it (the panel scrolls as it grows).
const openFold=async id=>{if(!await b.evalValue(`document.querySelector('[data-design-fold="${id}"]')?.open`))await b.click(`[data-design-fold-toggle="${id}"]`);await new Promise(r=>setTimeout(r,300));};
const screen=(x,y)=>b.evalValue(`(()=>{const p=new DOMPoint(${x},${y}).matrixTransform(document.querySelector('[data-design-plan]').getScreenCTM());return{x:p.x,y:p.y};})()`);
try{
  await b.waitFor(()=>b.count('[data-design-ready="true"]'),'loaded');
  await b.evalValue(`localStorage.setItem('thai-street-road-first-v1',${JSON.stringify(JSON.stringify(fixture))})`);await b.send('Page.reload');
  await b.waitFor(()=>b.count('[data-design-ready="true"]'),'ready');
  await b.clickAt(await screen(-150,0));await b.waitFor(()=>b.count('[data-design-inspector="road"]'),'road panel');
  await openFold('lane-runs');await b.click('[data-design-action="add-lane-run-forward"]');
  await b.waitFor(async()=>(await current()).roads[0].laneRuns?.length===1,'lane run added');
  const added=(await current()).roads[0].laneRuns[0];assert.deepEqual([added.direction,added.side,added.start,added.end,added.taperIn],['forward','curb',125,275,30]);
  await b.waitFor(async()=>await b.count('[data-design-lane-run-handle]')===2,'start / end handles on the plan');
  await b.screenshot('artifacts/lane-run-plan.png');
  // Drag the end handle 40 m further along the road: one undo step.
  const h=await b.rect('[data-design-lane-run-handle="L1:end"]'),to=await screen(115,0);
  await b.drag({x:h.x,y:h.y},{x:to.x,y:h.y},8);
  await b.waitFor(async()=>Math.abs((await current()).roads[0].laneRuns[0].end-315)<.6,'end dragged along the road');
  await b.click('[data-design-undo]');await b.waitFor(async()=>(await current()).roads[0].laneRuns[0].end===275,'one undo for the drag');
  // Typed value edits the same run.
  await b.evalValue(`(()=>{const i=document.querySelector('[data-design-field="lane-run-0-taper-in"]');i.focus();const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'45');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await b.key('Enter');await b.waitFor(async()=>(await current()).roads[0].laneRuns[0].taperIn===45,'typed taper');
  await b.click('[data-design-view="3d"]');await b.waitFor(()=>b.count('.network-scene3d'),'3D');await new Promise(r=>setTimeout(r,500));
  await b.screenshot('artifacts/lane-run-3d.png');await b.click('[data-design-view="2d"]');
  // Section of a stretch: one click adds the road's section plus a lane each way; drag its start, type a footway width.
  await openFold('section-stretches');await b.click('[data-design-action="add-stretch"]');
  await b.waitFor(async()=>(await current()).roads[0].sectionStretches?.length===1,'stretch added');
  const st=(await current()).roads[0].sectionStretches[0];assert.deepEqual([st.start,st.end,st.forwardLanes,st.backwardLanes,st.walk],[100,300,3,3,2]);
  await b.waitFor(async()=>await b.count('[data-design-stretch-handle]')===2,'stretch handles on the plan');
  const sh=await b.rect('[data-design-stretch-handle="S1:start"]'),sto=await screen(-130,0);
  await b.drag({x:sh.x,y:sh.y},{x:sto.x,y:sh.y},8);
  await b.waitFor(async()=>Math.abs((await current()).roads[0].sectionStretches[0].start-70)<.6,'start dragged');
  await b.click('[data-design-undo]');await b.waitFor(async()=>(await current()).roads[0].sectionStretches[0].start===100,'one undo for the stretch drag');
  await b.evalValue(`(()=>{const i=document.querySelector('[data-design-field="stretch-0-walk"]');i.focus();const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'0.75');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await b.key('Enter');await b.waitFor(async()=>(await current()).roads[0].sectionStretches[0].walk===.75,'typed footway');
  await b.screenshot('artifacts/section-stretch-plan.png');
  // Remove the additive stretch. The lane run from the earlier test overlaps the intended curb reduction.
  await b.click('[data-design-action="remove-stretch-0"]');
  await b.waitFor(async()=>!(await current()).roads[0].sectionStretches?.length,'old stretch removed');
  await openFold('section-stretches');await b.click('[data-design-action="add-lane-reduction-forward"]');
  await new Promise(r=>setTimeout(r,250));
  assert.equal((await current()).roads[0].sectionStretches?.length??0,0,'overlapping added lane and curb drop refused');
  await openFold('lane-runs');await b.click('[data-design-action="remove-lane-run-0"]');
  await b.waitFor(async()=>!(await current()).roads[0].laneRuns?.length,'overlapping lane run removed');
  await openFold('section-stretches');await b.click('[data-design-action="add-lane-reduction-forward"]');
  await b.waitFor(async()=>{const q=(await current()).roads[0].sectionStretches;return q?.length===1&&q[0].forwardLanes===1&&q[0].backwardLanes===2;},'2 to 1 to 2 lane reduction added');
  await b.waitFor(async()=>await b.count('[data-design-stretch-handle]')===2,'reduction handles');
  await b.screenshot('artifacts/lane-reduction-plan.png');
  await b.click('[data-design-view="3d"]');await b.waitFor(()=>b.count('.network-scene3d'),'reduced lane visible in 3D');await new Promise(r=>setTimeout(r,500));
  await b.screenshot('artifacts/lane-reduction-3d.png');await b.click('[data-design-view="2d"]');
  // Deceleration lane at a ramp's diverge: one tick on the ramp panel; the ramp then continues the added lane.
  const withRamp={...fixture,roads:[fixture.roads[0],{id:'X',name:'ทางออก',role:'ramp',alignment:'arc',points:[{x:-100,y:-9},{x:20,y:-35},{x:120,y:-55}],section:{forwardLanes:1,backwardLanes:0,laneWidth:3.5,median:0,walk:0},anchors:{start:{roadId:'A',station:100,side:1}}}]};
  await b.evalValue(`localStorage.setItem('thai-street-road-first-v1',${JSON.stringify(JSON.stringify(withRamp))})`);await b.send('Page.reload');
  await b.waitFor(()=>b.count('[data-design-ready="true"]'),'ready');
  // The view fits the reloaded project just after it is ready: click again until the ramp is picked.
  for(let k=0;k<5&&!await b.count('[data-design-ramp-lane="start"]');k++){await b.clickAt(await screen(70,-45));await new Promise(r=>setTimeout(r,300));}
  await b.waitFor(()=>b.count('[data-design-ramp-lane="start"]'),'ramp panel with its diverge');
  await b.click('[data-design-ramp-lane-toggle="start"]');
  await b.waitFor(async()=>{const r=(await current()).roads.find(x=>x.id==='X');return r.terminals?.start?.length===100&&Math.abs(r.points[0].y+(2+7+1.75))<.01;},'lane added; ramp starts on its centre');
  await b.screenshot('artifacts/ramp-decel-lane.png');
  await b.click('[data-design-undo]');await b.waitFor(async()=>!(await current()).roads.find(x=>x.id==='X').terminals,'one undo');
  assert.deepEqual(b.errors,[]);
  console.log('PASS lane browser: mid-block curb reduction in 2 actions and shared 2D/3D; deceleration lane at a ramp diverge in 1 click, add a lane along a stretch (2 clicks), plan handles, drag end = one undo, typed taper, 3D; section of a stretch in 1 click, drag start = one undo, typed footway');
}catch(error){await b.screenshot('artifacts/lane-browser-failure.png');throw error;}finally{b.close();}
