import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startSession} from './test-support/cdp-browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
require('./test-support/build.cjs')();
const {detectCandidates}=require('../.test-build/tree/core/road-first/derive.cjs');
const section={forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:4,walk:2};
const fixture={kind:'road-first',schemaVersion:3,title:'ตรวจโค้งดิ่ง',roads:[{id:'A',name:'ถนนหลัก',alignment:'arc',points:[{x:-500,y:0},{x:500,y:0}],section,profile:[{station:0,z:0},{station:500,z:8,curveLength:200},{station:1000,z:0}]},{id:'B',name:'ถนนตัด',alignment:'arc',points:[{x:0,y:-500},{x:0,y:500}],section}],decisions:[],options:{}};
const cid=detectCandidates(fixture.roads)[0].id;fixture.decisions=[{candidateId:cid,decision:'grade-separated',over:'A'}];
const b=await startSession({root,path:'/design',profile:'.test-build/chrome-vertical'});
const current=()=>b.evalValue(`JSON.parse(localStorage.getItem('thai-street-road-first-v1')).scenarios[0].project`);
async function selectA(){const point=await b.evalValue(`(()=>{const p=new DOMPoint(-300,0).matrixTransform(document.querySelector('[data-design-plan]').getScreenCTM());return{x:p.x,y:p.y};})()`);await b.clickAt(point);await b.waitFor(()=>b.count('[data-design-inspector="road"]'),'road inspector');}
async function seed(project){await b.evalValue(`localStorage.setItem('thai-street-road-first-v1',${JSON.stringify(JSON.stringify(project))})`);await b.send('Page.reload');await b.waitFor(()=>b.count('[data-design-ready="true"]'),'ready');}
try{
 await b.waitFor(()=>b.count('[data-design-ready="true"]'),'loaded');await seed(fixture);assert.deepEqual(await current(),fixture,'opening never smooths or changes authored data');
 await selectA();await b.click('[data-design-section-mode="profile"]');await b.waitFor(()=>b.count('[data-design-profile="A"]'),'long section');
 // The structure at the crossing appears in the long section with the measured clearance, as in the road panel.
 await b.waitFor(()=>b.count('[data-design-profile-structure]'),'structure band in the long section');
 {const shown=await b.evalValue(`document.querySelector('[data-design-profile-structure]').dataset.designProfileClearance`);assert.match(shown,/^\d+\.\d\d ม\.$/);
  assert.ok((await b.text('[data-design-road-crossings]')).includes(`ช่องลอด ${shown}`),'same measured clearance in the road panel');}
 await b.click('[data-design-fold-toggle="profile"]');await b.waitFor(()=>b.count('[data-design-field="profile-1-curve"]'),'curve length input');
 assert.equal(await b.evalValue(`document.querySelector('[data-design-field="profile-1-curve"]').value`),'200');
 const surface=await b.evalValue(`document.querySelector('[data-design-profile-surface]').getAttribute('points')`);assert.ok(surface.split(' ').length>10,'curved surface sampled separately from tangent controls');
 await b.evalValue(`document.querySelector('[data-design-field="profile-1-curve"]').scrollIntoView({block:'center'})`);await b.screenshot('artifacts/vertical-curve-profile.png');
 await b.click('[data-design-field="profile-1-curve"]');await b.evalValue(`document.querySelector('[data-design-field="profile-1-curve"]').select()`);await b.type('300');await b.key('Enter');
 await b.waitFor(async()=>(await current()).roads[0].profile[1].curveLength===300,'numeric curve edit');
 await b.click('[data-design-undo]');await b.waitFor(async()=>(await current()).roads[0].profile[1].curveLength===200,'one undo');
 await b.click('[data-design-redo]');await b.waitFor(async()=>(await current()).roads[0].profile[1].curveLength===300,'redo');
 await b.send('Page.reload');await b.waitFor(()=>b.count('[data-design-ready="true"]'),'reopen');assert.equal((await current()).roads[0].profile[1].curveLength,300);
 await b.click('[data-design-view="3d"]');await b.waitFor(()=>b.count('.network-scene3d'),'shared 3D');await b.screenshot('artifacts/vertical-curve-3d.png');
 // Authored PVI conflicts are refused; proposal/cancel/confirm is exercised on a separate flat fixture.
 const flat=structuredClone(fixture);delete flat.roads[0].profile;await seed(flat);
 await selectA();await b.click('[data-design-road-over]');await b.waitFor(()=>b.count('[data-profile-review]'),'preview');
 assert.deepEqual(await current(),flat,'preview does not edit');await b.screenshot('artifacts/vertical-rise-preview.png');
 // Parameters re-plan live with a ghost on the plan; an impossible value turns the ghost red and disables placing.
 assert.equal(await b.count('[data-design-ghost="ok"]'),1,'footprint ghost on the plan');
 assert.match(await b.text('[data-grade-clearance]'),/ช่องลอดที่จะได้ 5\.00 ม\./);
 const setField=async(f,v)=>{await b.evalValue(`(()=>{const i=document.querySelector('[data-design-field="${f}"]'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
 await setField('grade-curve','400');await b.waitFor(async()=>await b.count('[data-grade-state="error"]')&&await b.count('[data-design-ghost="error"]'),'red ghost with the reason');
 assert.equal(await b.evalValue(`document.querySelector('[data-profile-review-confirm]').disabled`),true);await b.screenshot('artifacts/grade-composer-refused.png');
 await setField('grade-curve','0');await setField('grade-height','8');
 await b.waitFor(async()=>/ช่องลอดที่จะได้ 6\.50 ม\./.test(await b.text('[data-grade-clearance]')),'re-measured for the new height');
 assert.deepEqual(await current(),flat,'adjusting does not edit');
 await b.click('[data-profile-review-cancel]');await b.waitFor(async()=>await b.count('[data-design-ghost]')===0,'cancel clears the ghost');
 await b.click('[data-design-road-over]');await b.waitFor(()=>b.count('[data-profile-review]'),'preview again');
 await b.click('[data-profile-review-cancel]');assert.deepEqual(await current(),flat,'cancel does not edit');
 await b.click('[data-design-road-over]');await b.waitFor(()=>b.count('[data-profile-review-confirm]'),'preview');await b.click('[data-profile-review-confirm]');await b.waitFor(async()=>(await current()).roads[0].profile?.length===4,'confirmed owned rise');
 assert.ok((await current()).roads[0].profile.every(p=>p.generatedBy===cid));
 await b.click('[data-design-undo]');await b.waitFor(async()=>!(await current()).roads[0].profile,'one undo restores all');
 const authored=structuredClone(flat);authored.roads[0].profile=[{station:500,z:0}];await seed(authored);
 await selectA();await b.click('[data-design-road-over]');await b.waitFor(()=>b.count('[data-design-notice="error"]'),'authored point conflict');assert.deepEqual(await current(),authored);
 const short=structuredClone(flat);short.roads[0].points=[{x:-30,y:0},{x:30,y:0}];await seed(short);
 await b.click(`[data-design-candidate="${cid}"]`);await b.click('[data-design-over="A"]');await b.waitFor(async()=>/ช่วงถนนไม่พอ/.test(await b.text('[data-design-notice]')),'short approach refused');assert.deepEqual(await current(),short);
 assert.deepEqual(b.errors,[]);console.log('PASS vertical browser: composer parameters with live ghost / clearance and red refusal, structure + measured clearance in the long section and road panel, curve numeric/undo/redo/reopen, shared 3D; profile preview/cancel/confirm in 2 clicks; authored PVI conflict refused without mutation');
}catch(error){await b.screenshot('artifacts/vertical-browser-failure.png');throw error;}finally{b.close();}
