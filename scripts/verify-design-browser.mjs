// Browser acceptance for the road-first workspace (/design): draw two roads (junction created automatically),
// edit the road section by number, undo/redo with readable labels, drag a road point, reload.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {startSession} from './test-support/cdp-browser.mjs';
import {createRequire} from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);mkdirSync('artifacts',{recursive:true});
const b=await startSession({root,path:'/design',profile:'.test-build/chrome-design-acceptance'});
const actions=[],diag={};const act=(label,fn)=>{actions.push(label);return fn();};
try{
  // Interactive only after the saved work is loaded in the browser (the server-rendered page has no handlers yet).
  const ready=()=>b.waitFor(()=>b.count('[data-design-ready="true"]'),'workspace ready');
  // Folded inspector sections open on demand (their state is remembered per browser).
  const openFold=async name=>{await b.waitFor(()=>b.count(`[data-design-fold="${name}"]`),'section '+name);if(!await b.evalValue(`document.querySelector('[data-design-fold="${name}"]').open`))await b.click(`[data-design-fold-toggle="${name}"]`);await b.waitFor(()=>b.evalValue(`document.querySelector('[data-design-fold="${name}"]').open`),'open '+name);await sleep(250);};
  await ready();
  await b.waitFor(()=>b.count('[data-design-notice]'),'workspace loaded');
  assert.match(await b.text('.design-inspector'),/วาดถนน/,'empty project explains how to start');
  // First open offers three ways to start, on the plan (not a modal).
  await b.waitFor(()=>b.count('[data-design-start-option]'),'start chooser on first open');
  assert.equal(await b.count('[data-design-start-option]'),3);
  await b.click('[data-design-start-option="map"]');
  await b.waitFor(async()=>await b.count('[data-design-start]')===0&&await b.count('[data-design-map="on"]')>0,'map chosen: map shown, chooser gone');
  await b.waitFor(async()=>await b.evalValue(`document.activeElement?.matches('[data-design-map-query]')??false`),'place search focused');
  assert.equal(await b.evalValue(`document.querySelector('[data-design-map-trace]')?.dataset.designMapTrace`),'osm','default map states its trace rights');
  await b.evalValue(`document.querySelector('[data-design-map-visible]').click()`);
  await b.waitFor(()=>b.count('[data-design-start]'),'chooser back when the map is turned off on an empty plan');
  await b.click('[data-design-start-option="blank"]');
  await b.waitFor(async()=>await b.count('[data-design-start]')===0&&(await b.evalValue(`document.querySelector('.design-canvas').dataset.designTool`))==='road','blank: Draw Road ready');
  await b.key('Escape');await b.waitFor(()=>b.count('[data-design-start]'),'Esc returns to the chooser');
  const canvas=await b.rect('.design-canvas'),at=(dx,dy)=>({x:canvas.x+dx,y:canvas.y+dy});

  // Draw two crossing roads.
  await act('tool: Draw Road',()=>b.click('[data-design-tool-button="road"]'));
  await b.waitFor(async()=>!(await b.count('[data-design-start]')),'drawing chooser closed before zoom');
  const drawingView=await b.evalValue(`document.querySelector('[data-design-plan]').getAttribute('viewBox')`);
  // Include the camera gesture needed to draw complete approaches at this viewport.
  await act('zoom out for full bridge approaches',()=>b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:canvas.x,y:canvas.y,deltaY:500,deltaX:0}));await sleep(250);
  await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-plan]').getAttribute('viewBox')`))!==drawingView,'camera zoom applied');
  await act('click road start',()=>b.clickAt(at(-330,0)));
  await act('double-click road end',()=>b.clickAt(at(330,0),2));
  await b.waitFor(async()=>await b.count('[data-design-road]')===1,'first road');
  await act('tool: Draw Road',()=>b.click('[data-design-tool-button="road"]'));
  await act('click road start',()=>b.clickAt(at(0,-250)));
  await act('double-click road end',()=>b.clickAt(at(0,250),2));
  await b.waitFor(async()=>await b.count('[data-design-road]')===2,'second road');
  diag.approaches=await b.evalValue(`JSON.parse(localStorage.getItem('thai-street-road-first-v1')).scenarios[0].project.roads.map(r=>({name:r.name,length:r.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-r.points[i].x,p.y-r.points[i].y),0)}))`);
  // The crossing becomes a junction automatically and says so, with Undo and grade separation at hand.
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'junction created automatically');
  assert.equal(await b.count('[data-design-candidate]'),0,'no pending crossing');
  assert.equal(actions.length,7,'two roads and a junction: 6 drawing actions plus 1 camera gesture');
  assert.match(await b.text('[data-design-auto-junction]'),/สร้างทางแยกให้แล้ว 1 แห่ง/);
  await b.click('[data-design-toast-action="grade-separated"]');
  await b.waitFor(async()=>await b.count('[data-network-junction-hit]')===0,'turned into a grade separation');
  await b.click('[data-design-undo]');
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'undo brings the junction back');
  // Grade separation with a chosen upper road (Phase 4A): the junction becomes a crossing, road 2 rises over road 1.
  {
    const c0=await b.evalValue(`(()=>{const l=document.querySelector('[data-network-junction-hit]'),m=l.getScreenCTM(),p=new DOMPoint(l.x1.baseVal.value,l.y1.baseVal.value).matrixTransform(m);return{x:p.x,y:p.y};})()`);
    await b.clickAt({x:c0.x+45,y:c0.y+12});await b.click('[data-design-action="back-to-junction"]');
    await b.click('[data-design-action="to-grade-separated"]');
    await b.waitFor(()=>b.count('[data-design-crossing-relation="unresolved"]'),'same level: which road is over is asked');
    const r2=await b.evalValue(`document.querySelectorAll('[data-design-over]')[1].dataset.designOver`);
    await b.click(`[data-design-over="${r2}"]`);
    await b.waitFor(()=>b.count('[data-profile-review]'),'profile delta preview');await b.click('[data-profile-review-confirm]');
    await b.waitFor(async()=>await b.count('[data-design-crossing-relation="over"]')&&await b.count('[data-network-crossing-deck]')===1&&await b.count('[data-network-junction-hit]')===0,'upper road over the lower one, deck drawn, no junction');
    assert.match(await b.text('[data-design-crossing-relation]'),/ต่างระดับที่แนวกึ่งกลาง 6\.5 ม\./,'rise = clearance + structure depth (starting values)');
    assert.equal(await b.evalValue(`document.querySelector('[data-design-clearance]').dataset.designClearance`),'5','measured clearance under the deck = the set clearance');
    assert.match(await b.text('[data-design-clearance]'),/ช่องลอดต่ำสุดที่วัดได้ 5\.00 ม\. ใต้สะพาน .* \(TO_VERIFY\)/);
    await b.screenshot('artifacts/design-browser-grade-separation.png');
    await b.click('[data-design-view="3d"]');
    await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-network-scene-raised]')?.dataset.networkSceneRaised??0`))>0,'3D shows the raised road');
    await sleep(400);await b.screenshot('artifacts/design-browser-grade-separation-3d.png');
    await b.click('[data-design-view="2d"]');await b.waitFor(async()=>await b.count('.network-scene3d')===0,'plan');
    assert.ok(await b.count('[data-network-structure-piece="bridge"]')>0,'bridge stretch drawn with its structure finish');
    // Underpass: the other road dips into a trough and a tunnel under the crossing road.
    const r1=await b.evalValue(`[...document.querySelectorAll('[data-design-under]')].map(x=>x.dataset.designUnder).find(id=>id!==${JSON.stringify(r2)})`);
    await b.click(`[data-design-under="${r1}"]`);
    await b.waitFor(()=>b.count('[data-profile-review]'),'profile delta preview');await b.click('[data-profile-review-confirm]');
    await b.waitFor(async()=>await b.count('[data-network-crossing-tunnel]')===1&&await b.count('[data-network-structure-piece="trough"]')>0&&await b.count('[data-network-junction-hit]')===0,'tunnel and trough drawn, still no junction');
    assert.match(await b.text('[data-design-crossing-relation]'),/ต่างระดับที่แนวกึ่งกลาง 6\.5 ม\./);
    assert.equal(await b.evalValue(`document.querySelector('[data-design-clearance]').dataset.designClearanceStructure`),'tunnel','measured under the tunnel roof');
    await b.screenshot('artifacts/design-browser-underpass.png');
    await b.click('[data-design-view="3d"]');
    await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-network-scene-below]')?.dataset.networkSceneBelow??0`))>0,'3D shows trough walls and portals');
    await sleep(400);await b.screenshot('artifacts/design-browser-underpass-3d.png');
    await b.click('[data-design-view="2d"]');await b.waitFor(async()=>await b.count('.network-scene3d')===0,'plan');
    await b.click('[data-design-undo]');await b.click('[data-design-undo]');await b.click('[data-design-undo]');
    await b.waitFor(()=>b.count('[data-network-junction-hit]'),'three undos bring the junction back');
    await b.key('Escape');
  }
  // A junction of two crossing roads becomes a bridge from the junction panel in one step (owner report 2026-10-22).
  {
    const c0=await b.evalValue(`(()=>{const l=document.querySelector('[data-network-junction-hit]'),m=l.getScreenCTM(),p=new DOMPoint(l.x1.baseVal.value,l.y1.baseVal.value).matrixTransform(m);return{x:p.x,y:p.y};})()`);
    await b.clickAt({x:c0.x+45,y:c0.y+12});await b.click('[data-design-action="back-to-junction"]');
    await openFold('junction-grade');
    await b.click('[data-design-junction-over]');
    await b.waitFor(()=>b.count('[data-profile-review]'),'profile delta preview');await b.click('[data-profile-review-confirm]');
    await b.waitFor(async()=>await b.count('[data-network-crossing-deck]')===1&&await b.count('[data-network-junction-hit]')===0,'junction → bridge in one step');
    await b.click('[data-design-undo]');
    await b.waitFor(()=>b.count('[data-network-junction-hit]'),'one undo brings the junction back');
    await b.key('Escape');
    // The same from the road panel: the road lists where it meets other roads.
    await b.click('[data-design-road] path');await b.waitFor(()=>b.count('[data-design-road-crossings]'),'road panel lists its crossings');
    await b.screenshot('artifacts/design-browser-road-crossings.png');
    await b.click('[data-design-road-over]');
    await b.waitFor(()=>b.count('[data-profile-review]'),'profile delta preview');await b.click('[data-profile-review-confirm]');
    await b.waitFor(async()=>await b.count('[data-network-crossing-deck]')===1&&await b.count('[data-network-junction-hit]')===0,'road raised over from its own panel');
    await b.click('[data-design-undo]');await b.waitFor(()=>b.count('[data-network-junction-hit]'),'undo');
    await b.key('Escape');
  }
  // Diamond interchange (4B-3): from the junction panel, ghost preview, place as one step, one undo back.
  {
    await b.key('Escape');await b.key('Escape');
    const roads=await b.count('[data-design-road]');
    const c0=await b.evalValue(`(()=>{const l=document.querySelector('[data-network-junction-hit]'),m=l.getScreenCTM(),p=new DOMPoint(l.x1.baseVal.value,l.y1.baseVal.value).matrixTransform(m);return{x:p.x,y:p.y};})()`);
    await b.clickAt({x:c0.x+45,y:c0.y+12});await b.click('[data-design-action="back-to-junction"]');await sleep(300);
    await openFold('diamond');
    for(const [f,v] of [['diamond-length','140'],['diamond-offset','60']]){await b.click(`[data-design-field="${f}"]`);await b.evalValue(`document.querySelector('[data-design-field="${f}"]').select()`);await b.type(v);}
    await b.waitFor(async()=>await b.count('[data-design-ghost="ok"]')===1&&await b.count('[data-design-diamond-ok]')===1,'ghost preview of the diamond');
    await b.screenshot('artifacts/design-browser-diamond-ghost.png');
    await b.click('[data-design-action="place-diamond"]');
    await b.waitFor(async()=>await b.count('[data-design-road]')===roads+4&&await b.count('[data-network-crossing-deck]')===1&&await b.count('[data-network-ramp-taper]')===4,'diamond placed: 4 ramps, bridge, diverges/merges');
    assert.equal(await b.count('[data-design-ghost]'),0,'ghost gone after placing');
    assert.equal(await b.count('[data-design-auto-junction]'),0,'no "made automatically" notice for a template');
    await sleep(300);await b.screenshot('artifacts/design-browser-diamond.png');
    await b.click('[data-design-undo]');
    await b.waitFor(async()=>await b.count('[data-design-road]')===roads&&await b.count('[data-network-crossing-deck]')===0,'one undo removes the whole diamond');
    await b.key('Escape');
  }
  // Level criteria in the project panel: value + source; derived heights follow; drawing presets use them.
  {
    await b.key('Escape');await b.key('Escape');
    await openFold('level-criteria');
    assert.equal(await b.evalValue(`document.querySelector('[data-design-criterion="clearance"]').dataset.designCriterionStatus`),'to-verify');
    await b.click('[data-design-field="criterion-clearance"]');await b.evalValue(`document.querySelector('[data-design-field="criterion-clearance"]').select()`);await b.type('5.5');await b.key('Enter');
    await b.click('[data-design-field="criterion-source-clearance"]');await b.type('คู่มือโครงการ หน้า 12');await b.key('Enter');
    await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-criterion="clearance"]').dataset.designCriterionStatus`))==='sourced','source recorded');
    assert.match(await b.text('[data-design-level-derived]'),/สะพานชั้นที่ 1 ยก 7 ม\./);
    await b.click('[data-design-tool-button="road"]');
    assert.match(await b.text('[data-design-level-preset="bridge-1"]'),/\+7\.0/,'drawing preset from the criteria');
    await b.key('Escape');await b.key('Escape');
    await b.click('[data-design-undo]');await b.click('[data-design-undo]');
    await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-criterion="clearance"]')?.dataset.designCriterionStatus`))==='to-verify','undo back to starting values');
  }
  // Project access (driveway): draw it as an access from the side of a road; the access junction keeps the road flowing.
  {
    const before=await b.count('[data-design-road]');
    await b.click('[data-design-tool-button="road"]');await b.click('[data-design-new-role="access"]');
    await b.waitFor(()=>b.count('[data-design-new-access]'),'access drawing explained');
    const pts=await b.evalValue(`(()=>{const q=document.querySelector('[data-design-road] path').getAttribute('d').match(/-?[0-9.]+/g).map(Number),svg=document.querySelector('[data-design-plan]'),m=svg.getScreenCTM();
      const a=new DOMPoint(q[0],q[1]).matrixTransform(m),z=new DOMPoint(q[q.length-2],q[q.length-1]).matrixTransform(m);return{a:{x:a.x,y:a.y},z:{x:z.x,y:z.y}};})()`);
    // A point a quarter of the way along the first road, then away from it at right angles.
    const on={x:pts.a.x+(pts.z.x-pts.a.x)*.25,y:pts.a.y+(pts.z.y-pts.a.y)*.25},len=Math.hypot(pts.z.x-pts.a.x,pts.z.y-pts.a.y),off={x:on.x-(pts.z.y-pts.a.y)/len*120,y:on.y+(pts.z.x-pts.a.x)/len*120};
    await b.clickAt(on);await b.clickAt(off,2);
    await b.waitFor(async()=>await b.count('[data-design-road]')===before+1,'access drawn');
    assert.equal(await b.evalValue(`document.querySelector('[data-design-road-role]')?.checked`),true,'new road is marked as a project access');
    assert.match(await b.evalValue(`document.querySelector('[data-design-field="road-name"]').value`),/^ทางเข้า \d/);
    await b.waitFor(()=>b.count('[data-design-auto-junction]'),'access junction created');
    await b.click('[data-design-toast-action="select"]');
    await b.waitFor(()=>b.count('[data-design-access-junction]'),'junction explains the access defaults');
    await b.screenshot('artifacts/design-browser-access.png');
    await b.click('[data-design-undo]');await b.waitFor(async()=>await b.count('[data-design-road]')===before,'undo removes the access');
  }

  // Drawing quick wins (4B-2b): snap badge with Tab between overlapping targets, Space+drag pans in Select,
  // Backspace no longer deletes a selected road (Delete does).
  {
    await b.key('Escape');
    const J=await b.evalValue(`(()=>{const ps=[...document.querySelectorAll('[data-design-road] path')].map(p=>p.getAttribute('d').match(/-?[0-9.]+/g).map(Number));
      const pt=new DOMPoint(ps[2][0],ps[0][1]).matrixTransform(document.querySelector('[data-design-plan]').getScreenCTM());return{x:pt.x,y:pt.y};})()`);
    const move=p=>b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'none'});
    await b.click('[data-design-tool-button="road"]');await move({x:J.x+60,y:J.y+3});await move({x:J.x+2,y:J.y+2});
    await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-design-snap-count]')?.dataset.designSnapCount??0`))>=3,'two alignments under the cursor');
    const first=await b.text('.design-snap-badge');await b.key('Tab');
    await b.waitFor(async()=>(await b.text('.design-snap-badge'))!==first,'Tab takes the next target');
    await b.key('Escape');await b.key('Escape');
    const road0=()=>b.evalValue(`(()=>{const r=document.querySelector('[data-design-road] path').getBoundingClientRect();return r.x;})()`),x0=await road0();
    const c=await b.rect('.design-canvas');
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});
    await b.drag({x:c.x-300,y:c.y+250},{x:c.x-220,y:c.y+250});
    await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});
    assert.ok(Math.abs((await road0())-x0-80)<4,'Space+drag pans the plan');
    const roads=await b.count('[data-design-road]');
    await b.click('[data-design-road] path');
    await b.waitFor(()=>b.count('[data-design-inspector="road"]'),'a road selected');
    await b.key('Backspace');await sleep(200);assert.equal(await b.count('[data-design-road]'),roads,'Backspace does not delete the selected road');
    await b.key('Escape');
  }
  // Ramp drawn by hand (Phase 4B-1): started on the side of a road at a shallow angle it diverges from it (no junction);
  // drawn against the traffic it previews red with the reason; its end can be unhooked; one undo removes it.
  {
    await b.key('Escape');
    const before=await b.count('[data-design-road]'),junctions=await b.count('[data-network-junction-hit]');
    const W=await b.evalValue(`(()=>{const ps=[...document.querySelectorAll('[data-design-road] path')].map(p=>p.getAttribute('d').match(/-?[0-9.]+/g).map(Number));
      const q=ps[0],a={x:q[0],y:q[1]},z={x:q[q.length-2],y:q[q.length-1]},L=Math.hypot(z.x-a.x,z.y-a.y),u={x:(z.x-a.x)/L,y:(z.y-a.y)/L},n={x:u.y,y:-u.x}; /* left of travel on the plan: the forward lanes' side */
      const sj=(ps[2][0]-a.x)/(u.x||1),s0=sj>110?sj-95:sj+50,m=document.querySelector('[data-design-plan]').getScreenCTM();
      const at=(s,o)=>{const p=new DOMPoint(a.x+u.x*s+n.x*o,a.y+u.y*s+n.y*o).matrixTransform(m);return{x:p.x,y:p.y};};
      return{p0:at(s0,0),p1:at(s0+40,12),p2:at(s0+60,30),back:at(s0-40,12)};})()`);
    const move=p=>b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'none'});
    await b.click('[data-design-tool-button="road"]');await b.click('[data-design-new-role="ramp"]');
    await b.waitFor(()=>b.count('[data-design-new-ramp]'),'ramp drawing explained');
    await b.clickAt(W.p0);await move(W.back);
    await b.waitFor(()=>b.count('[data-design-draft-check="error"]'),'against the traffic: red preview');
    assert.match(await b.text('[data-design-draft-check="error"]'),/สวนทิศ/);
    await b.key('Escape');
    await b.clickAt(W.p0);await b.clickAt(W.p1);await b.clickAt(W.p2,2);
    await b.waitFor(async()=>await b.count('[data-design-road]')===before+1,'ramp drawn');
    await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-ramp-end="start"]')?.dataset.designRampAnchor`))!=='none','ramp start attached to the road');
    assert.match(await b.evalValue(`document.querySelector('[data-design-field="road-name"]').value`),/^ทางลาด \d/);
    assert.equal(await b.count('[data-network-ramp-taper]'),1,'taper at the diverge');
    assert.equal(await b.count('[data-design-ramp-flow="start"]'),1,'traffic direction shown at the attachment');
    assert.equal(await b.count('[data-network-junction-hit]'),junctions,'no junction at the diverge');
    await b.screenshot('artifacts/design-browser-ramp.png');
    await b.click('[data-design-ramp-detach="start"]');
    await b.waitFor(async()=>await b.count('[data-network-ramp-taper]')===0,'unhooked');
    await b.click('[data-design-undo]');await b.click('[data-design-undo]');
    await b.waitFor(async()=>await b.count('[data-design-road]')===before,'undo removes the ramp');
  }

  // Road curves: pick a road point, type a radius, drag the radius handle, back to a sharp corner, delete the point.
  {
    await b.key('Escape');
    const before=await b.count('[data-design-road]'),c=await b.rect('.design-canvas'),at=(x,y)=>({x:c.x+x,y:c.y+y});
    await b.click('[data-design-tool-button="road"]');await b.click('[data-design-new-role="road"]');
    await b.clickAt(at(-330,-230));await b.clickAt(at(-150,-230));await b.clickAt(at(-150,-110),2);
    await b.waitFor(async()=>await b.count('[data-design-road]')===before+1,'L-shaped road drawn');
    const id=await b.evalValue(`[...document.querySelectorAll('[data-design-road]')].at(-1).dataset.designRoad`);
    await b.click(`[data-design-road-point="${id}:1"]`);
    await b.waitFor(()=>b.count('[data-design-point-block="1"]'),'point picked');
    await b.click('[data-design-field="point-radius"]');await b.evalValue(`document.querySelector('[data-design-field="point-radius"]').select()`);await b.type('20');await b.key('Enter');
    await b.waitFor(()=>b.count('[data-design-curve="arc"]'),'typed radius draws an arc');
    const h=await b.rect(`[data-design-radius-handle="${id}:1"]`),v=await b.rect(`[data-design-road-point="${id}:1"]`);
    await b.drag({x:h.x,y:h.y},{x:h.x+(h.x-v.x)*.8,y:h.y+(h.y-v.y)*.8});
    await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-design-field="point-radius"]').value`))>20,'dragging the handle enlarges the radius');
    await b.screenshot('artifacts/design-browser-curve.png');
    await b.click('[data-design-action="point-sharp"]');await b.waitFor(()=>b.count('[data-design-curve="corner"]'),'back to a sharp corner');
    await b.click(`[data-design-road-point="${id}:1"]`);await b.key('Delete');
    await b.waitFor(async()=>await b.count(`[data-design-road-point^="${id}:"]`)===2,'Delete removes only the picked point');
    for(let i=0;i<5&&await b.count('[data-design-road]')!==before;i++)await b.click('[data-design-undo]');
    await b.waitFor(async()=>await b.count('[data-design-road]')===before,'undo back to before the road');
  }

  // Drawing at a level (Phase 4B-2): PageUp / PageDown between points; the crossing becomes a grade separation at once;
  // the long section shows the levels and the road crossed, and a dragged level point is one undo step.
  {
    await b.key('Escape');
    const roads=await b.count('[data-design-road]'),decks=await b.count('[data-network-crossing-deck]'),junctions=await b.count('[data-network-junction-hit]');
    const c=await b.rect('.design-canvas'),at=(x,y)=>({x:c.x+x,y:c.y+y});
    await b.click('[data-design-tool-button="road"]');await b.click('[data-design-new-role="road"]');
    await b.clickAt(at(-250,-170));
    for(let i=0;i<7;i++)await b.key('PageUp');
    await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-draw-level]')?.dataset.designDrawLevel`))==='7','level raised while drawing');
    await b.clickAt(at(-250,-70));await b.clickAt(at(-250,70));
    for(let i=0;i<7;i++)await b.key('PageDown');
    await b.clickAt(at(-250,170),2);
    await b.waitFor(async()=>await b.count('[data-design-road]')===roads+1,'raised road drawn');
    await b.waitFor(async()=>await b.count('[data-network-crossing-deck]')===decks+1,'crossing at different levels: deck, no junction');
    assert.equal(await b.count('[data-network-junction-hit]'),junctions);
    await b.click('[data-design-section-mode="profile"]');
    await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-profile]')?.dataset.designProfilePoints`))==='4','long section with the drawn levels');
    assert.ok(await b.count('[data-design-profile-crossing]')>0,'road crossed shown in the long section');await sleep(300);
    const pt=await b.rect('[data-design-profile-point="1"]'),z0=Number(await b.evalValue(`document.querySelector('[data-design-profile-point="1"]').dataset.designProfileZ`));
    await b.drag({x:pt.x,y:pt.y},{x:pt.x,y:pt.y-25});
    await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-design-profile-point="1"]').dataset.designProfileZ`))>z0+1,'dragged level point up');
    await b.screenshot('artifacts/design-browser-profile.png');
    await b.click('[data-design-undo]');
    await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-design-profile-point="1"]').dataset.designProfileZ`))===z0,'one undo per drag');
    await b.click('[data-design-section-mode="road"]');
    await b.click('[data-design-undo]');await b.waitFor(async()=>await b.count('[data-design-road]')===roads,'undo removes the raised road');
  }

  // Mid-block median opening on a road (GW-04), outside the junction approaches: cuts the median, handle moves it.
  {
    await b.key('Escape');
    const medians=()=>b.count('[data-network-link-median]');const m0=await medians();
    const pts=await b.evalValue(`(()=>{const q=document.querySelector('[data-design-road] path').getAttribute('d').match(/-?[0-9.]+/g).map(Number),svg=document.querySelector('[data-design-plan]'),m=svg.getScreenCTM();
      const a=new DOMPoint(q[0],q[1]).matrixTransform(m),z=new DOMPoint(q[q.length-2],q[q.length-1]).matrixTransform(m);return{a:{x:a.x,y:a.y},z:{x:z.x,y:z.y}};})()`);
    await b.clickAt({x:pts.a.x+(pts.z.x-pts.a.x)*.15,y:pts.a.y+(pts.z.y-pts.a.y)*.15});
    await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-inspector]')?.dataset.designInspector`))==='road','road selected');
    // Zoom to the selection: the selected road fills the view.
    const vb0=await b.evalValue(`document.querySelector('[data-design-plan]').getAttribute('viewBox')`);
    await b.click('[data-design-focus]');
    await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-plan]').getAttribute('viewBox')`))!==vb0,'zoomed to the selected road');
    await b.click('[data-design-fit]');
    // Trees and street lights along the road: 2D symbols on the links, 3D furniture, one undo step each.
    await b.click('[data-design-field="roadside-trees"]');await b.click('[data-design-field="roadside-lights"]');
    await b.waitFor(async()=>(await b.count('[data-network-link-objects]'))>0&&(await b.count('[data-road-object="tree"]'))>0&&(await b.count('[data-road-object="light"]'))>0,'trees and lights drawn along the road');
    await b.click('[data-design-view="3d"]');
    await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-network-scene-furniture-faces]')?.dataset.networkSceneFurnitureFaces??0`))>0,'trees and lights in 3D');
    await sleep(400);await b.screenshot('artifacts/design-browser-3d-roadside.png');
    await b.click('[data-design-view="2d"]');await b.waitFor(async()=>await b.count('.network-scene3d')===0,'plan');
    await b.click('[data-design-undo]');await b.click('[data-design-undo]');
    await b.waitFor(async()=>await b.count('[data-network-link-objects]')===0,'undo removes them');
    await openFold('road-openings');
    await b.click('[data-design-action="add-road-uturn"]');
    await b.waitFor(async()=>await b.count('[data-design-road-opening]')===1&&await medians()===m0+1,'U-turn opening cuts the median in two');
    const st=()=>b.evalValue(`Number(document.querySelector('[data-design-field="road-opening-0-station"]').value)`),s0=await st();
    const hh=await b.waitFor(()=>b.rect('[data-design-road-opening-handle]'),'opening handle');
    const dir={x:(pts.z.x-pts.a.x),y:(pts.z.y-pts.a.y)},dl=Math.hypot(dir.x,dir.y);
    await b.drag(hh,{x:hh.x-dir.x/dl*30,y:hh.y-dir.y/dl*30});
    await b.waitFor(async()=>await st()!==s0,'dragging the handle moves the opening');
    await b.screenshot('artifacts/design-browser-midblock-opening.png');
    await b.click('[data-design-undo]');await b.click('[data-design-undo]');
    await b.waitFor(async()=>await b.count('[data-design-road-opening]')===0&&await medians()===m0,'undo removes the opening');
    await b.key('Escape');
  }
  // Before a road is finished, the preview says what would happen (here: it cannot join the 4-leg junction); right-click steps back.
  {
    const move=p=>b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'none'});
    const rightClick=async p=>{for(const type of ['mousePressed','mouseReleased'])await b.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'right',clickCount:1});};
    // Screen point of the crossing of the two roads (first road horizontal, second vertical).
    const J=await b.evalValue(`(()=>{const ps=[...document.querySelectorAll('[data-design-road] path')].map(p=>p.getAttribute('d').match(/-?[0-9.]+/g).map(Number));
      const svg=document.querySelector('[data-design-plan]'),pt=new DOMPoint(ps[2][0],ps[0][1]).matrixTransform(svg.getScreenCTM());return{x:pt.x,y:pt.y};})()`),nearJ=(dx,dy)=>({x:J.x+dx,y:J.y+dy});
    await b.click('[data-design-tool-button="road"]');await b.clickAt(nearJ(-200,-200));
    await move(nearJ(150,150));await move(nearJ(200,200));
    await b.waitFor(()=>b.count('[data-design-draft="warn"]'),'road through the 4-leg junction previews as not joining');
    assert.match(await b.text('[data-design-draft-check="warn"]'),/ไม่เชื่อมเข้าทางแยก · .*เกิน 4 ขา/);
    await b.screenshot('artifacts/design-browser-draft-check.png');
    await move(nearJ(200,-150));
    await b.waitFor(async()=>await b.count('[data-design-draft="true"]')===1,'away from the junction the preview is valid again');
    await rightClick(nearJ(200,-150));
    await b.waitFor(async()=>await b.count('[data-design-draft]')===0,'right-click removes the last point');
    await rightClick(nearJ(200,-150));
    await b.waitFor(async()=>(await b.evalValue(`document.querySelector('.design-canvas').dataset.designTool`))==='select','right-click with nothing drawn leaves Draw Road');
    assert.equal(await b.count('[data-design-road]'),2,'nothing was added');
  }

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
  const roadId=i=>b.evalValue(`document.querySelectorAll('[data-design-road]')[${i}].dataset.designRoad`),R1=await roadId(0),R2=await roadId(1);diag.ids=[R1,R2];
  // Drag the first road's start point: one undo step.
  const point=await b.rect(`[data-design-road-point="${R1}:0"]`);
  await b.drag(point,{x:point.x,y:point.y+40});
  await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-undo]').title`))==='ย้อนกลับ: ย้ายจุดแนวถนน ถนน 1','drag recorded as one step');

  // Work survives a reload.
  await sleep(300);await b.goto('/design');await ready();
  await b.waitFor(async()=>await b.count('[data-design-road]')===2&&await b.count('[data-network-junction-hit]')>0,'project restored after reload');
  // Drawing aids (slice 3): continue a road from its end, typed length, Shift turns snapping off.
  const move=(p,modifiers=0)=>b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,modifiers});
  // Let the plan finish fitting after the reload before picking a road by position.
  await sleep(500);
  const restoredRoad=await b.evalValue(`(()=>{const group=[...document.querySelectorAll('[data-design-road]')].find(g=>g.dataset.designRoad===${JSON.stringify(R1)}),line=group.querySelector('path'),p=line.getPointAtLength(line.getTotalLength()*.25).matrixTransform(line.getScreenCTM());return{x:p.x,y:p.y};})()`);
  await b.clickAt(restoredRoad);
  const endPt=await b.waitFor(()=>b.rect(`[data-design-road-point="${R1}:1"]`),'road 1 end handle');
  const near={x:endPt.x+4,y:endPt.y+4},up={x:endPt.x+1,y:endPt.y-160};
  const aidStart=actions.length;
  await act('tool: Draw Road',()=>b.click('[data-design-tool-button="road"]'));
  await move(near,8);
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-snap]')?.dataset.designSnap`)==='none','Shift turns snapping off');
  await move(near);
  await b.waitFor(async()=>(await b.text('[data-design-readout]'))?.includes('ต่อจากปลาย'),'snaps to the road end');
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
  // Crossing, stop line and signal of the approach, in place.
  await openFold('controls');
  const crossOn=await b.evalValue(`document.querySelector('[data-design-field="crossing"]').checked`);
  await b.click('[data-design-field="crossing"]');
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-field="crossing"]').checked`)!==crossOn,'crossing toggled in place');
  await b.click('[data-design-undo]');
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-field="crossing"]').checked`)===crossOn,'undo restores the crossing');
  // Lane arrow of the first incoming lane, in place.
  await openFold('arrows');
  await b.evalValue(`(()=>{const s=document.querySelector('[data-design-field="arrow-main-0"]');s.value='ru';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-design-undo]').title`)).startsWith('ย้อนกลับ: แก้ขา')&&await b.evalValue(`document.querySelector('[data-design-field="arrow-main-0"]').value`)==='ru','lane arrow changed in place');
  // Median opening on the same approach, in /design: add, type its position, drag its handle (same value).
  await openFold('openings');
  await b.click('[data-design-action="add-opening"]');
  await b.waitFor(()=>b.count('[data-design-opening]'),'median opening added in place');
  await b.click('[data-design-field="opening-0-start"]');await b.evalValue(`document.querySelector('[data-design-field="opening-0-start"]').select()`);
  await b.type('30');await b.key('Enter');
  await b.waitFor(async()=>await b.evalValue(`document.querySelector('[data-design-field="opening-0-start"]').value`)==='30','opening position typed');
  const oh=await b.waitFor(()=>b.rect('[data-design-opening-handle]'),'opening handle on the plan');
  const ohAway=Math.hypot(oh.x-centre.x,oh.y-centre.y);
  await b.drag(oh,{x:oh.x+(oh.x-centre.x)/ohAway*20,y:oh.y+(oh.y-centre.y)/ohAway*20});
  await b.waitFor(async()=>Number(await b.evalValue(`document.querySelector('[data-design-field="opening-0-start"]').value`))>30,'dragging the handle moves the same opening');
  await b.screenshot('artifacts/design-browser-opening.png');
  await b.click('[data-design-action="remove-opening-0"]');
  await b.waitFor(async()=>await b.count('[data-design-opening]')===0,'opening removed');
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
  // Lane lines, arrows, crossings and stop lines from the 2D drawing reach the 3D view (review 2026-10-21, P1-01).
  await b.waitFor(async()=>(await b.evalValue(`document.querySelector('[data-network-scene-detail-texture]')?.dataset.networkSceneDetailTexture`))==='true','3D shows the 2D lane markings');
  await sleep(300);await b.screenshot('artifacts/design-browser-3d.png');
  // Top looks straight down; the camera is kept when leaving and coming back; the workspace fit button fits the 3D view.
  const cam=attr=>b.evalValue(`document.querySelector('[data-network-camera-${attr}]')?.dataset['networkCamera'+'${attr}'.charAt(0).toUpperCase()+'${attr}'.slice(1)]`);
  await b.click('[data-network-camera-control="top"]');
  await b.waitFor(async()=>Number(await cam('pitch'))===0,'Top view looks straight down');
  await b.click('[data-network-camera-control="zoom-in"]');await b.click('[data-network-camera-control="zoom-in"]');
  const zoomed=await cam('zoom');
  await b.click('[data-design-view="2d"]');
  await b.waitFor(async()=>await b.count('.network-scene3d')===0,'back to the plan');
  await b.click('[data-design-view="3d"]');
  await b.waitFor(async()=>await cam('zoom')===zoomed&&Number(await cam('pitch'))===0,'3D camera kept after switching views');
  await b.click('[data-design-fit]');
  await b.waitFor(async()=>await cam('zoom')==='0.9200','fit button fits the 3D view');
  await b.click('[data-design-view="2d"]');
  await b.waitFor(async()=>await b.count('.network-scene3d')===0,'back to the plan');
  // In /design an approach has no arm drag grip (its geometry follows the roads).
  assert.equal(await b.count('[data-network-arm-handle]'),0,'no inert arm grips');
  await b.screenshot('artifacts/design-browser.png');
  // Scenarios survive a reload.
  await sleep(300);await b.goto('/design');await ready();
  await b.waitFor(async()=>await b.count('[data-design-scenario]')===2,'both scenarios restored after reload');

  // Advanced junction editing (slice 6, staged): hand the junction to the junction editor, add a median opening there,
  // come back — the edit arrives as one undoable step in the same scenario.
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'junction after reload');
  const jc2=await b.rect('[data-network-junction-hit]');
  await b.clickAt({x:jc2.x+14,y:jc2.y});
  await b.click('[data-design-action="back-to-junction"]');
  // Folded sections open after mount (remembered per browser); let the panel settle before clicking low in it.
  await sleep(300);
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
  await b.goto('/');await ready();await b.waitFor(()=>b.count('[data-design-workspace]'),'home page is /design');

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
  await b.waitFor(()=>b.count('[data-design-reference-image]'),'reference image under the plan').catch(async e=>{console.log('DBG',await b.evalValue(`document.querySelector('[data-design-reference-input]')?.files?.length??'no-input'`),await b.text('[data-design-notice]'),await b.count('[data-design-scenario]'),await b.evalValue(`(localStorage.getItem('thai-street-road-first-v1-unreadable')??'').slice(0,300)`),await b.evalValue(`document.querySelector('[data-design-inspector]')?.dataset.designInspector`));throw e;});
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
  await b.goto('/network');await ready();await b.waitFor(async()=>(await b.evalValue('location.pathname'))==='/design'&&await b.count('[data-design-workspace]'),'/network opens /design');
  await sleep(300);diag.afterRedirect={notice:await b.text('[data-design-notice]'),tabs:await b.count('[data-design-scenario]'),unreadable:await b.evalValue(`(localStorage.getItem('thai-street-road-first-v1-unreadable')??'').slice(0,80)`)};
  assert.equal(diag.afterRedirect.tabs,2,'saved work reopens after the redirect: '+JSON.stringify(diag.afterRedirect));
  // Earlier work with a parallel road: the relation is not carried over, so the import reports it per object.
  const req=createRequire(import.meta.url);req('./test-support/build.cjs')();
  const net=req(root+'.test-build/tree/core/network/network-project.cjs'),seedPf=req(root+'.test-build/tree/core/network/parallel-frontage-seed.cjs');
  const seeded=seedPf.seedParallelFrontage(net.createNetworkProject(),{mainlineLinkIds:['L-1'],mainlineStartJunctionId:'J-1',side:'left',offset:40}).project;
  const earlier=JSON.stringify({workspaceVersion:1,activeScenarioId:'existing',scenarios:[{id:'existing',name:'Existing',kind:'existing',project:seeded}]});
  await b.evalValue(`localStorage.setItem('thai-street-network-project-v1',${JSON.stringify(earlier)})`);
  await b.goto('/design');await ready();await b.waitFor(()=>b.count('[data-design-action="import-earlier"]'),'import offered when earlier work exists');
  const scenariosBefore=await b.count('[data-design-scenario]');
  await b.click('[data-design-action="import-earlier"]');
  await b.waitFor(async()=>await b.count('[data-design-scenario]')===scenariosBefore+1,'earlier work added as an alternative');
  assert.equal(await b.text('[data-design-scenario][aria-selected="true"]'),'สภาพเดิม (หน้าเดิม)');
  await b.waitFor(()=>b.count('[data-design-migration-item="lost"][data-design-migration-target="road"]'),'import report lists the parallel road relation');
  await b.click('[data-design-migration-item="lost"]');
  await b.waitFor(()=>b.count('[data-design-inspector="road"]'),'report item selects the road it concerns');
  await b.goto('/design');await ready();await b.waitFor(()=>b.count('[data-design-migration-report]'),'report kept after reload until dismissed');
  await b.screenshot('artifacts/design-browser-migration-report.png');

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
  // Bands between lanes and sidewalk (P1): add a bike lane; the section strip shows it and its width counts.
  // (Roads at the junction above carry a Slip lane whose island would not fit a wider road, so use a free road.)
  await b.click('[data-design-scenario="alt-2"]');await b.waitFor(async()=>(await b.text('[data-design-scenario][aria-selected="true"]'))==='สภาพเดิม (หน้าเดิม)','imported scenario');
  await b.click('[data-design-tool-button="road"]');await b.clickAt(at(-200,-200));await b.clickAt(at(150,-200),2);
  await b.waitFor(()=>b.count('[data-design-action="add-band-bike"]'),'new road selected');
  await b.click('[data-design-action="add-band-bike"]');
  await b.waitFor(async()=>(await b.text('[data-design-section]'))?.includes('จักรยาน'),'bike band in the section strip');
  // Roads drawn end to end (P2): marked on the plan and joined into one road from the inspector.
  await b.click('[data-design-tool-button="road"]');await b.clickAt(at(380,-200));await b.clickAt(at(152,-201),2);
  await b.waitFor(()=>b.count('[data-design-end-join]'),'touching ends marked');
  const roadsBeforeJoin=await b.count('[data-design-road]');
  await b.click('[data-design-end-join]');await b.click('[data-design-action="join-road"]');
  await b.waitFor(async()=>await b.count('[data-design-road]')===roadsBeforeJoin-1&&await b.count('[data-design-end-join]')===0,'joined into one road');
  assert.match(await b.evalValue(`document.querySelector('[data-design-undo]').title`),/^ย้อนกลับ: เชื่อม /);
  await b.click(`[data-design-tool-button="select"]`);
  await b.clickAt({x:canvas.x-canvas.w/2+40,y:canvas.y-canvas.h/2+150});await b.clickAt(at(0,-200));
  // Junction ↔ roundabout from the junction inspector, one undo step.
  {
    await b.waitFor(()=>b.count('[data-network-junction-hit]'),'junction');
    const c0=await b.evalValue(`(()=>{const l=document.querySelector('[data-network-junction-hit]'),m=l.getScreenCTM(),p=new DOMPoint(l.x1.baseVal.value,l.y1.baseVal.value).matrixTransform(m);return{x:p.x,y:p.y};})()`);
    await b.clickAt({x:c0.x+45,y:c0.y+12});await b.click('[data-design-action="back-to-junction"]');
    await b.waitFor(()=>b.count('[data-design-junction-type="junction"]'),'junction type shown');
    await b.click('[data-design-action="to-roundabout"]');
    await b.waitFor(async()=>await b.count('[data-design-junction-type="roundabout"]')&&await b.count('[data-design-field="ring-radius"]'),'converted to a roundabout in place');
    await b.screenshot('artifacts/design-browser-roundabout.png');
    await b.click('[data-design-undo]');
    await b.waitFor(()=>b.count('[data-design-junction-type="junction"]'),'undo restores the junction');
    await b.key('Escape');
  }
  // Narrow screen (P1): the inspector is a drawer, open while something is selected, and can be closed.
  await b.send('Emulation.setDeviceMetricsOverride',{width:820,height:900,deviceScaleFactor:1,mobile:false});
  await b.waitFor(async()=>await b.evalValue(`getComputedStyle(document.querySelector('[data-design-inspector-toggle]')).display`)!=='none','drawer toggle on a narrow screen');
  const open=()=>b.evalValue(`(()=>{const r=document.querySelector('.design-inspector').getBoundingClientRect();return r.right<=innerWidth+1&&r.left<innerWidth-50;})()`);
  await b.waitFor(open,'inspector drawer open with a selection');
  await b.click('[data-design-inspector-toggle]');await b.waitFor(async()=>!(await open()),'drawer closes');
  await b.click('[data-design-inspector-toggle]');await b.waitFor(open,'drawer opens again');
  // Phone: review first — the inspector is a bottom sheet, the plan stays visible above it, nothing overflows sideways.
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(400);
  diag.phone=await b.evalValue(`(()=>{const i=document.querySelector('.design-inspector').getBoundingClientRect(),c=document.querySelector('.design-canvas').getBoundingClientRect();
    return{sheetTop:i.top,sheetH:i.height,canvasTop:c.top,width:document.documentElement.scrollWidth,inner:innerWidth,note:getComputedStyle(document.querySelector('[data-design-phone-note]')??document.body).display};})()`);
  assert.ok(diag.phone.sheetH<=844*0.55&&diag.phone.sheetTop-diag.phone.canvasTop>=250,'plan visible above the sheet: '+JSON.stringify(diag.phone));
  assert.ok(diag.phone.width<=diag.phone.inner+1,'no sideways scroll on a phone: '+JSON.stringify(diag.phone));
  assert.equal(await b.evalValue(`getComputedStyle(document.querySelector('[data-design-file="save"]')).display`),'none','phone: file actions folded');
  assert.notEqual(await b.evalValue(`getComputedStyle(document.querySelector('[data-design-more]').parentElement).display`),'none','phone: "เพิ่มเติม" menu');
  await b.click('[data-design-tool-button="road"]');
  await b.waitFor(async()=>(await b.evalValue(`getComputedStyle(document.querySelector('[data-design-draw-actions]')).display`))==='flex','phone: drawing buttons');
  assert.ok(await b.evalValue(`document.querySelector('[data-design-draw-actions]').getBoundingClientRect().bottom<document.querySelector('.design-inspector').getBoundingClientRect().top`),'phone: drawing buttons above the sheet');
  await b.screenshot('artifacts/design-browser-phone-draw.png');
  await b.click('[data-design-draw-action="cancel"]');
  await b.screenshot('artifacts/design-browser-phone.png');
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await sleep(300);
  await b.click('[data-design-scenario="alt-1"]');await b.waitFor(async()=>(await b.text('[data-design-scenario][aria-selected="true"]'))==='ทางเลือก A','back to the alternative');
  // Leaving the advanced editor waits for a successful save.
  await b.waitFor(()=>b.count('[data-network-junction-hit]'),'junction');const jc3=await b.rect('[data-network-junction-hit]');
  await b.clickAt({x:jc3.x+14,y:jc3.y});await b.click('[data-design-action="back-to-junction"]');await sleep(300);await b.click('[data-design-action="advanced-junction"]');
  await b.waitFor(()=>b.count('[data-junction-back-to-design]'),'advanced editor');
  await b.evalValue(`localStorage.setItem('thai-street-design-junction-handoff-v1','{broken')`);
  await b.click('[data-junction-back-to-design]');await sleep(400);
  assert.equal(await b.evalValue('location.pathname'),'/junction','stays when the edits cannot be saved back');
  assert.match(await b.evalValue('document.body.innerText'),/อ่านข้อมูลที่ส่งมาจากหน้าออกแบบไม่ได้/);
  // Stored work that cannot be read is copied aside, never silently replaced.
  await b.evalValue(`localStorage.setItem('thai-street-road-first-v1','{broken')`);
  await b.goto('/design');await ready();await b.waitFor(()=>b.count('[data-design-unreadable]'),'unreadable work reported');
  assert.equal(await b.evalValue(`localStorage.getItem('thai-street-road-first-v1-unreadable')`),'{broken','copy kept');
  assert.equal(await b.count('[data-design-notice="error"]'),1);
  assert.deepEqual(b.errors,[],'no runtime errors');
  console.log(`PASS design workspace browser acceptance (${actions.length} actions: draw two roads with automatic junction, section by number in 5 actions, labelled undo/redo, point drag, reload, continue road + typed length in ${aidActions} actions, right-turn pocket with typed storage in ${pocketActions} actions, storage/corner handles, Slip lane, alternative in 1 action with highlighted difference, figure export, scenarios after reload, advanced junction round trip, home page, Design Summary, 3D view, reference image scale/move/remove, section by station, online map placement, /network redirect + import of earlier work, save state, restore removed alternative, one undo per typed value, advanced editor waits for save, unreadable storage kept, bands, narrow-screen drawer, join roads drawn end to end)`);
}catch(error){
  // On CI the message becomes a check annotation, so a failure can be read without the job log.
  if(process.env.GITHUB_ACTIONS){let state='';try{state=JSON.stringify({...diag,path:await b.evalValue('location.pathname'),active:await b.text('[data-design-scenario][aria-selected="true"]'),tabs:await b.evalValue(`[...document.querySelectorAll('[data-design-scenario]')].map(x=>x.dataset.designScenario+'='+x.textContent).join('|')`),roads:await b.evalValue(`[...document.querySelectorAll('[data-design-road]')].map(x=>x.dataset.designRoad).join(',')`),notice:await b.text('[data-design-notice]')});}catch{}
    const msg=(String(error?.message??error)+' · '+state).replace(/\r?\n/g,' ').slice(0,1500);console.log(`::error title=design browser acceptance::${msg}`);}
  try{await b.screenshot('artifacts/design-browser-failure.png');}catch{}
  throw error;
}finally{b.close();}
