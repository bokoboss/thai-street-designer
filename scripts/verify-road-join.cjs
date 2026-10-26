// P2 (independent review 2026-10-20): roads drawn end to end are found and can be joined into one road;
// junction settings on the absorbed road move with it (leg sides flip when it ran the other way).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),j=T('core/road-first/join.cjs'),rp=T('core/road-first/project.cjs'),ae=T('core/road-first/approach-edit.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:2};
const run=(ed,cmd)=>{const x=c.runCommand(ed,cmd);assert.equal(x.result.error,null,JSON.stringify(cmd.type)+': '+x.result.error);return [x.editor,x.result];};
const start=()=>c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{approachLength:40},roads:[]});
const add=(ed,id,pts)=>run(ed,{type:'road.add',road:{id,name:'ถนน '+id,points:pts,section:sec}})[0];
for(const reversed of [false,true]){
  let ed=start();
  ed=add(ed,'A',[{x:-300,y:0},{x:0,y:0}]);
  // B continues A to the east; drawn west→east, or east→west when reversed.
  ed=add(ed,'B',reversed?[{x:300,y:0},{x:0,y:0}]:[{x:0,y:0},{x:300,y:0}]);
  ed=add(ed,'X',[{x:150,y:-200},{x:150,y:200}]);   // crosses B → junction
  assert.deepEqual(j.endJoins(ed.project.roads).map(e=>[e.a,e.b]),[['A','B']],'touching ends found');
  // A right-turn pocket on B's west approach of the junction with X.
  const cid=ed.project.decisions[0].candidateId,bLeg=reversed?'B:ahead':'B:behind';
  const info=ae.approachInfo(rp.compileRoadFirstProject(ed.project),cid,bLeg);
  [ed]=run(ed,{type:'leg.setTreatment',candidateId:cid,leg:bLeg,patch:ae.pocketTreatment(info.arm,'right',{length:30})});
  [ed]=run(ed,{type:'junction.setCornerAt',candidateId:cid,leg:bLeg,radius:12});
  let r;[ed,r]=run(ed,{type:'road.join',roadId:'A',otherId:'B'});
  assert.match(r.label,/^เชื่อม ถนน A กับ ถนน B เป็นถนนเดียว/);
  const A=ed.project.roads.find(x=>x.id==='A');
  assert.deepEqual(ed.project.roads.map(x=>x.id),['A','X']);assert.equal(A.points.length,3);
  assert.deepEqual([A.points[0],A.points.at(-1)],[{x:-300,y:0},{x:300,y:0}],'one road west→east, A keeps its direction');
  const comp=rp.compileRoadFirstProject(ed.project);
  assert.equal(comp.project.junctions.length,1);assert.deepEqual(comp.issues,[]);
  const leg=comp.legs.find(l=>l.roadId==='A'&&l.side==='behind');
  assert.equal(comp.project.junctions[0].design.arms[leg.armId].incomingPockets.right.lanes,1,'pocket moved to the joined road (west approach)');
  assert.equal(ed.project.decisions[0].treatments.cornerRadii['A:behind'],12,'per-corner radius follows the absorbed road leg in both road orientations');
  assert.equal(ed.project.decisions[0].treatments.cornerRadii[bLeg],undefined,'absorbed road corner key is removed');
  assert.equal(comp.project.junctions[0].design.cornerRadii[leg.armId],12,'compiled radius stays on the same physical corner');
  assert.equal(j.endJoins(ed.project.roads).length,0);
  // Undo restores both roads.
  assert.deepEqual(c.undo(ed).editor.project.roads.map(x=>x.id),['A','B','X']);
}
// A junction point is not a continuation: three roads meeting at one point are not offered for joining.
let e3=start();e3=add(e3,'A',[{x:-300,y:0},{x:0,y:0}]);e3=add(e3,'B',[{x:0,y:0},{x:300,y:0}]);e3=add(e3,'C',[{x:0,y:-200},{x:0,y:200}]);
assert.equal(j.endJoins(e3.project.roads).length,0);
assert.match(c.runCommand(e3,{type:'road.join',roadId:'A',otherId:'B'}).result.error,/ไม่ได้ชนกัน|ถนนอื่น/);
console.log('PASS road join: touching ends found (not at junctions), joined into one road both orientations, junction settings follow, undo');
