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
