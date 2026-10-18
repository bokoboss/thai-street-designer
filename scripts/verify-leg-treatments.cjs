// Phase 2 slice 3 — junction treatments keyed by road leg (ADR-0002, limit L5).
// Edits made on a compiled junction are captured against the road leg (roadId:ahead|behind)
// and re-bound to whatever arm slot that leg gets on the next compile.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const rf=T('core/road-first/derive.cjs'),lt=T('core/road-first/leg-treatments.cjs');
const n=T('core/network/network-project.cjs'),v=T('core/junction/design-validation.cjs'),m=T('core/junction/model.cjs');

const sec=(f,b)=>({forwardLanes:f,backwardLanes:b,laneWidth:3.25,median:2,walk:2});
const turn=(p,deg)=>{const r=deg*Math.PI/180;return{x:p.x*Math.cos(r)-p.y*Math.sin(r),y:p.x*Math.sin(r)+p.y*Math.cos(r)};};
const roadsAt=(heading,mainLanes=2,rotate=0)=>{
  const r=heading*Math.PI/180,dx=Math.cos(r)*120,dy=Math.sin(r)*120;
  return [
    {id:'R1',name:'ถนนหลัก',points:[{x:-150,y:0},{x:150,y:0}].map(p=>turn(p,rotate)),section:sec(mainLanes,mainLanes)},
    {id:'R2',name:'ถนนรอง',points:[{x:-dx,y:-dy},{x:dx,y:dy}].map(p=>turn(p,rotate)),section:sec(1,1)},
  ];
};
const sl=T('core/junction/slip-model.cjs');
const decide=(roads,treatments)=>rf.detectCandidates(roads).map(c=>({candidateId:c.id,decision:'junction',treatments}));
const slotOf=(result,key)=>{const [roadId,side]=key.split(':');return result.legs.find(l=>l.roadId===roadId&&l.side===side).armId;};
const opts={approachLength:80};

// 1. Compile, then edit the junction the way the Junction editor would (by arm slot).
const roads=roadsAt(90),first=rf.compileRoadNetwork(roads,decide(roads),opts);
assert.deepEqual(first.issues,[]);
const west=slotOf(first,'R1:behind'),south=slotOf(first,'R2:ahead'),north=slotOf(first,'R2:behind'),east=slotOf(first,'R1:ahead');
const edited=structuredClone(first.project),d=edited.junctions[0].design;
d.arms[west].incomingPockets={left:{...m.emptyPockets().left},right:{...m.emptyPockets().right,lanes:1,length:30,taper:15}};
d.arms[west].laneMarkings={...m.markingsFor(d.arms[west]),incomingMain:['right','straight']};
d.arms[south].crossing=false;
d.arms[east].medianOpenings=[{id:'o1',start:30,length:12,type:'uturn'}];
const slipTo=sl.nextActiveArm(d,south);assert.equal(slipTo,west,'left-turn Slip from R2 ahead goes to R1 behind');
d.slips=[{...sl.defaultSlip(south,slipTo,4.5,28),crossing:{enabled:true,offset:8}}];
d.corner=12;
assert.equal(v.designError(d),null,'edited junction is valid');

// 2. Capture re-keys every arm-level edit by road leg.
const captured=lt.captureTreatments(roads,decide(roads),edited,opts);
assert.deepEqual(captured.issues,[]);
const t=captured.decisions[0].treatments;
assert.equal(t.legs['R1:behind'].incomingPockets.right.lanes,1);
assert.deepEqual(t.legs['R1:behind'].laneMarkings.incomingMain,['right','straight']);
assert.equal(t.legs['R2:ahead'].crossing,false);
assert.equal(t.legs['R1:ahead'].medianOpenings[0].type,'uturn');
assert.equal(t.legs['R2:behind'],undefined,'untouched legs store nothing');
assert.deepEqual(t.slips.map(s=>[s.from,s.to,s.width,s.radius,s.crossing.enabled]),[['R2:ahead','R1:behind',4.5,28,true]]);
assert.equal(t.corner,12);

// 3. Recompiling the same roads reproduces the edited junction exactly.
const again=rf.compileRoadNetwork(roads,captured.decisions,opts);
assert.deepEqual(again.issues,[]);
assert.deepEqual(again.project.junctions[0].design,d,'capture → compile round-trips the junction');

// 4. Rotating the whole junction shifts every arm slot; all treatments stay on their road legs.
const rotateRoads=roadsAt(90,2,-60),rcands=rf.detectCandidates(rotateRoads);
const rotated=rf.compileRoadNetwork(rotateRoads,captured.decisions.map((x,i)=>({...x,candidateId:rcands[i].id})),opts);
assert.deepEqual(rotated.issues,[]);
const od=rotated.project.junctions[0].design;
for(const key of ['R1:ahead','R1:behind','R2:ahead','R2:behind'])assert.notEqual(slotOf(rotated,key),slotOf(first,key),`${key} moved to another slot`);
assert.equal(od.arms[slotOf(rotated,'R1:behind')].incomingPockets.right.lanes,1,'pocket stays on R1 behind');
assert.equal(od.arms[slotOf(rotated,'R2:ahead')].crossing,false,'crossing setting stays on R2 ahead');
assert.equal(od.arms[slotOf(rotated,'R2:behind')].crossing,true,'other R2 leg keeps its default');
assert.equal(od.arms[slotOf(rotated,'R1:ahead')].medianOpenings[0].id,'o1');
assert.deepEqual(od.slips.map(s=>[s.fromArm,s.toArm,s.crossing.offset]),[[slotOf(rotated,'R2:ahead'),slotOf(rotated,'R1:behind'),8]],'Slip follows its legs');
assert.equal(v.designError(od),null);
assert.equal(n.validateNetworkProject(rotated.project),null);

// 4b. Turning one road changes which legs are neighbours: leg settings still follow; a Slip that no longer joins neighbours is reported.
const turned=roadsAt(225),tcands=rf.detectCandidates(turned);
const reordered=rf.compileRoadNetwork(turned,captured.decisions.map((x,i)=>({...x,candidateId:tcands[i].id})),opts);
const rd=reordered.project.junctions[0].design;
assert.notEqual(slotOf(reordered,'R2:ahead'),south);
assert.equal(rd.arms[slotOf(reordered,'R1:behind')].incomingPockets.right.lanes,1);
assert.equal(rd.arms[slotOf(reordered,'R2:ahead')].crossing,false);
assert.equal(rd.slips.length,0);assert(reordered.issues.some(s=>/Slip lane/.test(s)&&/ถนนรอง →/.test(s)),'Slip that lost its neighbour is reported by road name');
assert.equal(v.designError(rd),null);

// 5. Lane-dependent settings follow a lane-count change on the road.
const wider=roadsAt(90,3),widened=rf.compileRoadNetwork(wider,captured.decisions,opts);
const wm=widened.project.junctions[0].design.arms[slotOf(widened,'R1:behind')].laneMarkings.incomingMain;
assert.equal(wm.length,3,'markings resized to three lanes');assert.deepEqual(wm.slice(0,2),['right','straight'],'edited lanes kept');

// 6. Road-owned values edited on the junction are reported, not stored as treatments.
const roadEdit=structuredClone(edited);roadEdit.junctions[0].design.arms[north].incoming=2;
const reported=lt.captureTreatments(roads,decide(roads),roadEdit,opts);
assert(reported.issues.some(s=>/ถนนรอง/.test(s)&&/แก้ที่ถนน/.test(s)),'lane count edit on a junction arm is reported as a road edit');
assert.equal(reported.decisions[0].treatments.legs['R2:behind'],undefined);

// 7. A treatment for a leg that no longer exists is reported.
const stale=rf.compileRoadNetwork(roads,decide(roads,{legs:{'R9:ahead':{crossing:false}}}),opts);
assert(stale.issues.some(s=>/R9|ไม่มีแล้ว/.test(s)),'stale leg treatment reported');

console.log('PASS leg treatments: pockets, markings, crossing, median openings, Slip and corner captured by road leg, exact round trip, survive slot reordering and lane-count change, road-owned edits reported');
