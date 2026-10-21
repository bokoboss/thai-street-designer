// Phase 3 slice 4 — junction detail in place: approach turn pockets, Slip lane and corner radius
// through the typed commands, and plan handles that map to the same values as the fields.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),ae=T('core/road-first/approach-edit.cjs'),rp=T('core/road-first/project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
let ed=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},
  roads:[{id:'R1',name:'ถนนหลัก',points:[{x:-200,y:0},{x:200,y:0}],section:sec},{id:'R2',name:'ถนนรอง',points:[{x:0,y:-200},{x:0,y:200}],section:sec}]});
const step=cmd=>{const x=c.runCommand(ed,cmd);assert.equal(x.result.error,null,JSON.stringify(cmd)+' → '+x.result.error);ed=x.editor;return x.result;};
step({type:'road.add',road:{id:'R3',name:'tmp',points:[{x:500,y:500},{x:600,y:500}],section:sec}});step({type:'road.remove',roadId:'R3'});
const cid=ed.project.decisions[0].candidateId,compiled=()=>rp.compileRoadFirstProject(ed.project);
const legs=ae.junctionApproaches(compiled(),cid);assert.equal(legs.length,4,'four approaches');
const leg='R1:behind';
let info=ae.approachInfo(compiled(),cid,leg);assert.ok(info,'approach found');assert.equal(info.arm.incomingPockets?.right.lanes??0,0);

// + right-turn pocket (median side): one lane with the engine's starting sizes; the other side is untouched.
let r=step({type:'leg.setTreatment',candidateId:cid,leg,patch:ae.pocketTreatment(info.arm,'right',{})});
assert.match(r.label,/^แก้ขา ถนนหลัก ← ที่ แยก/);
info=ae.approachInfo(compiled(),cid,leg);
assert.deepEqual([info.arm.incomingPockets.right.lanes,info.arm.incomingPockets.right.length,info.arm.incomingPockets.right.taper],[1,25,15]);
assert.equal(info.arm.incomingPockets.left.lanes,0);
// Typed width / storage / taper.
step({type:'leg.setTreatment',candidateId:cid,leg,patch:ae.pocketTreatment(info.arm,'right',{width:3,length:40,taper:20})});
info=ae.approachInfo(compiled(),cid,leg);assert.deepEqual(info.arm.incomingPockets.right,{...info.arm.incomingPockets.right,lanes:1,width:3,length:40,taper:20});

// Pocket handle sits at the end of storage and maps back to the same length.
const h=ae.pocketHandle(info.junction,info.armId,'right');assert.ok(h);
assert.equal(ae.pocketLengthFromPoint(info.junction,info.armId,'right',h),40,'handle ↔ field round trip');
const far=ae.pocketLengthFromPoint(info.junction,info.armId,'right',{x:-1e4,y:0});assert.equal(far,140,'drag is clamped to the data range');
assert.equal(ae.pocketLengthFromPoint(info.junction,info.armId,'right',{x:1e4,y:0}),5,'never shorter than 5 m');

// Remove the pocket.
step({type:'leg.setTreatment',candidateId:cid,leg,patch:ae.pocketTreatment(info.arm,'right',null)});
assert.equal(ae.approachInfo(compiled(),cid,leg).arm.incomingPockets.right.lanes,0);

// + Slip lane to the next approach, then typed width/radius and a deceleration lane.
info=ae.approachInfo(compiled(),cid,leg);assert.ok(info.slipTo,'next approach known');
const slip=ae.newSlip(info,s=>!c.executeCommand(ed.project,{type:'slip.set',candidateId:cid,slip:s}).error);
assert.equal(slip.radius,32,'default radius fits: approaches stretch along the road for the Slip lane');r=step({type:'slip.set',candidateId:cid,slip});assert.match(r.label,/^ตั้ง Slip lane จาก ถนนหลัก ←/);
info=ae.approachInfo(compiled(),cid,leg);assert.ok(info.slip,'slip compiled');
step({type:'slip.set',candidateId:cid,slip:ae.slipPatch(info,{width:4.5,radius:slip.radius,approach:{mode:'auxiliary',width:3.25,storage:30,taper:20}})});
info=ae.approachInfo(compiled(),cid,leg);assert.equal(info.slip.width,4.5);assert.equal(info.slip.radius,slip.radius);assert.equal(info.slip.approach.mode,'auxiliary');
step({type:'slip.remove',candidateId:cid,from:leg});assert.equal(ae.approachInfo(compiled(),cid,leg).slip,undefined);

// Corner handles: one per corner, each maps back to the current radius.
const j=ae.approachInfo(compiled(),cid,leg).junction,hs=ae.cornerHandles(j);
assert.equal(hs.length,4);for(const x of hs)assert.equal(ae.cornerFromPoint(j,x.corner,x.point),j.design.corner);
step({type:'junction.setCorner',candidateId:cid,corner:15});
const j2=ae.approachInfo(compiled(),cid,leg).junction,h2=ae.cornerHandles(j2)[0];
assert.equal(ae.cornerFromPoint(j,0,h2.point),15,'a handle moved to the 15 m arc reads 15 m');
console.log('PASS approach editing in place: right-turn pocket add/size/remove, pocket handle ↔ length, Slip lane add/size/remove, corner handles ↔ radius');

// A left-turn pocket and a Slip lane on the same approach both serve the left turn and give a broken channel: refused both ways.
{
  let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ก',points:[{x:-200,y:0},{x:200,y:0}],section:sec},{id:'B',name:'ข',points:[{x:0,y:-200},{x:0,y:200}],section:sec}]});
  e=c.runCommand(e,{type:'road.add',road:{id:'Z',name:'z',points:[{x:500,y:500},{x:600,y:500}],section:sec}}).editor;
  const id=e.project.decisions[0].candidateId,leg='B:ahead',inf=()=>ae.approachInfo(rp.compileRoadFirstProject(e.project),id,leg);
  const s=ae.newSlip(inf());let x=c.runCommand(e,{type:'slip.set',candidateId:id,slip:s});assert.equal(x.result.error,null);e=x.editor;
  x=c.runCommand(e,{type:'leg.setTreatment',candidateId:id,leg,patch:ae.pocketTreatment(inf().arm,'left',{})});
  assert.equal(x.result.error,c.LEFT_WITH_SLIP,'left pocket refused beside a Slip lane');
  x=c.runCommand(e,{type:'leg.setTreatment',candidateId:id,leg,patch:ae.pocketTreatment(inf().arm,'right',{})});assert.equal(x.result.error,null,'right pocket still allowed');e=x.editor;
  x=c.runCommand(e,{type:'slip.set',candidateId:id,slip:ae.slipPatch(inf(),{width:4.5})});assert.equal(x.result.error,null,'editing the Slip stays allowed');e=x.editor;
  e=c.runCommand(e,{type:'slip.remove',candidateId:id,from:leg}).editor;
  x=c.runCommand(e,{type:'leg.setTreatment',candidateId:id,leg,patch:ae.pocketTreatment(inf().arm,'left',{})});assert.equal(x.result.error,null);e=x.editor;
  assert.equal(c.runCommand(e,{type:'slip.set',candidateId:id,slip:ae.newSlip(inf())}).result.error,c.SLIP_WITH_LEFT,'Slip refused beside a left pocket');
  console.log('PASS left-turn pocket and Slip lane on one approach are refused both ways; right pocket and Slip edits still allowed');
}

// Per-corner radius (P2): a handle edits only its corner; the junction radius stays the default for the others.
{
  let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ก',points:[{x:-200,y:0},{x:200,y:0}],section:sec},{id:'B',name:'ข',points:[{x:0,y:-200},{x:0,y:200}],section:sec}]});
  e=c.runCommand(e,{type:'road.add',road:{id:'Z',name:'z',points:[{x:500,y:500},{x:600,y:500}],section:sec}}).editor;
  const id=e.project.decisions[0].candidateId,comp=()=>rp.compileRoadFirstProject(e.project);
  const j0=comp().project.junctions[0],h0=ae.cornerHandles(j0);assert.ok(h0.every(h=>h.radius===j0.design.corner));
  const first=comp().legs.find(l=>l.armId===h0[0].armId),key=first.roadId+':'+first.side;
  let x=c.runCommand(e,{type:'junction.setCornerAt',candidateId:id,leg:key,radius:16});assert.equal(x.result.error,null);e=x.editor;
  assert.match(x.result.label,/^ปรับรัศมีมุม .* เป็น 16 ม\./);
  const j1=comp().project.junctions[0],h1=ae.cornerHandles(j1);
  assert.equal(h1[0].radius,16);assert.ok(h1.slice(1).every(h=>h.radius===j1.design.corner),'other corners keep the default');
  assert.equal(ae.cornerFromPoint(j1,0,h1[0].point),16,'handle ↔ value round trip on that corner');
  // The default can change without touching the corner set on its own.
  e=c.runCommand(e,{type:'junction.setCorner',candidateId:id,corner:12}).editor;
  const h2=ae.cornerHandles(comp().project.junctions[0]);assert.equal(h2[0].radius,16);assert.ok(h2.slice(1).every(h=>h.radius===12));
  // Back to the default; the advanced editor round trip keeps per-corner radii.
  e=c.runCommand(e,{type:'junction.setCornerAt',candidateId:id,leg:key,radius:9}).editor;
  const ho=T('core/road-first/junction-handoff.cjs').createHandoff(e.project,'existing',id);
  const back=T('core/road-first/junction-handoff.cjs').handoffCommand(ho,e.project);assert.equal(back.cmd,null,'unchanged through the advanced editor');
  e=c.runCommand(e,{type:'junction.setCornerAt',candidateId:id,leg:key,radius:null}).editor;
  assert.equal(e.project.decisions[0].treatments.cornerRadii,undefined);
  console.log('PASS per-corner radius: one corner at a time, default for the rest, reset, advanced editor round trip');
}
