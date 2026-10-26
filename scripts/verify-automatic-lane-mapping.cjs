// PR C: fail-first contract for automatic junction and ramp lane connections.
const assert=require('node:assert/strict'),path=require('node:path');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const model=T('core/junction/model.cjs'),geometry=T('core/junction/geometry.cjs');
const slip=T('core/junction/slip-model.cjs');
const mapping=T('core/junction/automatic-lane-mapping.cjs');
const ramps=T('core/road-first/ramp-lane-connections.cjs');
const derive=T('core/road-first/derive.cjs'),rampGeometry=T('core/road-first/ramps.cjs');
const rampMap=roads=>ramps.automaticRampLaneConnections(roads,derive.compileRoadNetwork(roads,[]));
const original=model.initial(),before=structuredClone(original),baseGeometry=geometry.edges(original);
const auto=mapping.automaticLaneMapping(original);
assert(auto.connections.length>0,'four-arm junction is mapped without manual links');
const exists=(res,from,to,turn)=>res.connections.some(c=>c.from.armId===from&&c.to.armId===to&&c.movement===turn);
assert(exists(auto,0,2,'through'),'opposite road is through');
assert(exists(auto,0,1,'left'),'screen-coordinate -90 degree turn is left in LHT');
assert(exists(auto,0,3,'right'),'screen-coordinate +90 degree turn is right in LHT');
assert(auto.connections.every(c=>Number.isFinite(c.fromPoint.x)&&Number.isFinite(c.toPoint.y)),'lane centres come from the shared section geometry');
assert.equal(new Set(auto.connections.map(c=>c.id)).size,auto.connections.length,'connector IDs are unique');
for(const turn of ['left','through','right']){
  const same=auto.connections.filter(c=>c.from.armId===0&&c.movement===turn);
  assert.equal(new Set(same.map(c=>c.to.role+':'+c.to.laneIndex)).size,same.length,'no double assignment to one receiver for the same approach and turn');
}
assert.deepEqual(original,before,'automatic mapping does not alter authored junction settings');
assert.deepEqual(geometry.edges(original),baseGeometry,'junction footprint and Slip invariant unchanged');
assert.deepEqual(mapping.automaticLaneMapping(JSON.parse(JSON.stringify(original))),auto,'save/reopen deterministic');

// A dedicated median turn lane must not pull the adjacent through lane into that lane's receiver.
const dedicated=structuredClone(original);
dedicated.arms[0].laneMarkings=model.withLaneArrow(dedicated.arms[0],'incoming','main',0,'right');
dedicated.arms[0].laneMarkings=model.withLaneArrow(dedicated.arms[0],'incoming','main',1,'straight');
const dedicatedMap=mapping.automaticLaneMapping(dedicated);
const through=dedicatedMap.connections.find(c=>c.from.armId===0&&c.movement==='through');
assert.equal(through.to.laneIndex,1,'through follows the aligned curb lane, not a centered group index');
for(const c of dedicatedMap.connections){
  for(const [ref,point] of [[c.from,c.fromPoint],[c.to,c.toPoint]]){
    const local=geometry.rotate(point,-geometry.armTurn(dedicated,ref.armId));
    const origin=geometry.armTreatmentOrigins(dedicated,ref.armId)[ref.direction];
    assert(Math.abs(local.x-origin)<1e-6,'connection anchor uses the actual incoming/departure datum');
  }
}

const unmarked=structuredClone(original);
unmarked.arms[0].laneMarkings=model.withLaneArrow(unmarked.arms[0],'incoming','main',0,'none');
assert(mapping.automaticLaneMapping(unmarked).issues.some(i=>i.kind==='movement-review'&&i.from.armId===0),'an unassigned lane is reviewed, not silently omitted');
const invalid=structuredClone(original);invalid.arms[1].angle=0;
const invalidMap=mapping.automaticLaneMapping(invalid);
assert.equal(invalidMap.connections.length,0);assert(invalidMap.issues.some(i=>i.kind==='geometry'),'coincident legs cannot generate a mapped result');

// Mixed main/auxiliary lanes and non-adjacent through sources keep their physical lateral positions.
const mixed=structuredClone(original);
for(const a of mixed.arms){a.length=220;a.incoming=3;a.outgoing=3;}
mixed.arms[0].laneMarkings={...model.markingsFor(mixed.arms[0]),incomingMain:['straight','right','straight']};
const mixedThrough=mapping.automaticLaneMapping(mixed).connections.filter(c=>c.from.armId===0&&c.movement==='through');
assert.deepEqual(mixedThrough.map(c=>[c.from.laneIndex,c.to.laneIndex]),[[0,0],[2,2]],'no forced contiguous receiver block across a dedicated turn lane');
mixed.arms[0].incomingPockets={...model.emptyPockets(),right:{lanes:1,length:40,taper:20},left:{lanes:1,length:40,taper:20}};
mixed.arms[1].outgoingPockets={...model.emptyPockets(),left:{lanes:1,length:40,taper:20}};
mixed.arms[3].outgoingPockets={...model.emptyPockets(),right:{lanes:1,length:40,taper:20}};
const mixedMap=mapping.automaticLaneMapping(mixed);
assert(mixedMap.connections.some(c=>c.from.armId===0&&c.from.role==='aux-left'&&c.to.role==='aux-left'&&c.movement==='left'),'curb-side dedicated left turn uses the curb-most receiving lane');
assert(mixedMap.connections.some(c=>c.from.armId===0&&c.from.role==='aux-right'&&c.to.role==='aux-right'&&c.movement==='right'),'median dedicated right turn uses the median receiver');
for(const angle of [40,55,90]){
  const skew=structuredClone(original);skew.arms.forEach((a,i)=>{a.length=220;a.angle=[0,angle,180,180+angle][i];});
  const skewMap=mapping.automaticLaneMapping(skew);
  assert(exists(skewMap,0,1,'left')&&exists(skewMap,0,2,'through')&&exists(skewMap,0,3,'right'),`LHT classification at ${angle} degrees`);
  const rotated=structuredClone(skew);rotated.arms.forEach(a=>a.angle=(a.angle+137)%360);
  assert.deepEqual(mapping.automaticLaneMapping(rotated).connections.map(c=>c.id).sort(),skewMap.connections.map(c=>c.id).sort(),'rotation preserves semantic connections');
}

const three=structuredClone(original);three.enabled[2]=false;
const threeMap=mapping.automaticLaneMapping(three);
assert(threeMap.issues.some(i=>i.kind==='no-exit'&&i.from?.armId===0&&i.movement==='through'),'unavailable arm is reported, not invented');
const skewT=structuredClone(original);skewT.enabled[2]=false;
skewT.arms.forEach((a,i)=>{a.length=220;a.angle=[0,40,180,220][i];});
const skewTMap=mapping.automaticLaneMapping(skewT);
assert(exists(skewTMap,0,1,'left')&&exists(skewTMap,0,3,'right'),'acute skew T stem turns into either direction of the main road');
assert(!skewTMap.connections.some(c=>c.from.armId===0&&c.movement==='through'),'a skew T stem has no false through movement');
const ambiguous=structuredClone(skewT);ambiguous.arms[1].angle=140;
assert(mapping.automaticLaneMapping(ambiguous).issues.some(i=>i.kind==='ambiguous'&&i.from?.armId===0),'equally plausible opposite legs require review');
const narrow=structuredClone(original);narrow.arms[2].outgoing=1;
const narrowMap=mapping.automaticLaneMapping(narrow);
assert(narrowMap.issues.some(i=>i.kind==='capacity'&&i.from?.armId===0&&i.movement==='through'),'2-to-1 receiving lane shortage is a review, never a hidden merge');
assert.equal(narrowMap.connections.filter(c=>c.from.armId===0&&c.movement==='through').length,1,'only one through lane assigned to single receiving lane');
const closed=structuredClone(original);closed.arms[2].outgoing=0;
assert(mapping.automaticLaneMapping(closed).issues.some(i=>i.kind==='no-receiver'&&i.from?.armId===0),'zero outgoing lanes do not receive a phantom link');

const withSlip=slip.addSlip(original,0),slipMap=mapping.automaticLaneMapping(withSlip);
assert(slipMap.slipRoutes.some(s=>s.fromArm===0&&s.toArm===1),'Slip is owned by its existing geometry');
assert(!exists(slipMap,0,1,'left'),'an explicit Slip is never duplicated by a through-junction connector');
assert(exists(slipMap,0,2,'through'),'other movements remain mapped when Slip is present');
assert.deepEqual(geometry.edges(withSlip),baseGeometry,'adding Slip preserves the base junction footprint');
assert.deepEqual(mapping.automaticLaneMapping(withSlip),mapping.automaticLaneMapping(JSON.parse(JSON.stringify(withSlip))),'Slip mapping survives file reopen');
const unfitSlip=structuredClone(withSlip);
unfitSlip.slips[0].departure={mode:'acceleration',width:3.5,length:200,merge:120,separator:'chevron',separatorWidth:1};
assert(mapping.automaticLaneMapping(unfitSlip).issues.some(i=>i.kind==='geometry'),'an authored Slip that does not fit is reviewed by the existing Slip validator');
assert.deepEqual(geometry.edges(unfitSlip),baseGeometry,'reviewing an unfit Slip never changes the junction core');

const uturn=structuredClone(original);
uturn.arms[0].laneMarkings=model.withLaneArrow(uturn.arms[0],'incoming','main',0,'uturn');
const uturnMap=mapping.automaticLaneMapping(uturn);
assert(uturnMap.issues.some(i=>i.kind==='uturn-review'),'U-turn is not inferred through an arbitrary arm');
assert(!uturnMap.connections.some(c=>c.from.armId===0&&c.from.role==='main'&&c.from.laneIndex===0),'U-turn-only lane has no invented turn');

const main={id:'A',name:'ถนนหลัก',alignment:'arc',points:[{x:-300,y:0},{x:300,y:0}],section:{forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:3,walk:0}};
const ramp={id:'R',name:'ทางลาด',role:'ramp',alignment:'arc',points:[{x:-100,y:-10},{x:0,y:-35}],
  section:{forwardLanes:1,backwardLanes:0,laneWidth:3.5,median:0,walk:0},
  anchors:{start:{roadId:'A',station:200,side:1}},terminals:{start:{length:100,taper:50}}};
ramp.points[0]=rampGeometry.anchorPoint(main,ramp.anchors.start,main.section.laneWidth/2);
const routed=rampMap([main,ramp]);
assert.equal(routed.length,1);
assert.equal(routed[0].status,'mapped');
assert.equal(routed[0].movement,'diverge');
assert.equal(routed[0].direction,'forward');
assert.equal(routed[0].mainCurbLane,1);
assert(routed[0].auxiliaryRunId,'maps via the existing auxiliary lane run');
const merge={...ramp,anchors:{end:{roadId:'A',station:400,side:-1}},terminals:{end:{length:100,taper:50}}};
merge.points=[{x:200,y:35},rampGeometry.anchorPoint(main,merge.anchors.end,main.section.laneWidth/2)];
const mergeMap=rampMap([main,merge])[0];
assert.equal(mergeMap.status,'mapped');assert.equal(mergeMap.movement,'merge');
assert.equal(mergeMap.direction,'backward','opposite-side merge uses actual backward traffic');
assert(mergeMap.auxiliaryRunId);
const noTerminal={...ramp,terminals:undefined};
const reviewed=rampMap([main,noTerminal])[0];
assert.equal(reviewed.status,'review','no authoring a missing acceleration / deceleration lane');
assert(!reviewed.auxiliaryRunId);
assert.deepEqual(rampMap([main]),[],'old files with no ramps stay untouched');

for(const end of ['start','end'])for(const side of [1,-1]){
  const a={roadId:'A',station:300,side},p=rampGeometry.anchorPoint(main,a,main.section.laneWidth/2);
  const q={x:p.x+(end==='start'?side:-side)*100,y:p.y-side*25};
  const r={...ramp,points:end==='start'?[p,q]:[q,p],anchors:{[end]:a},terminals:{[end]:{length:100,taper:50}}};
  const result=rampMap([main,r])[0];
  assert.equal(result.status,'mapped',`${end} side ${side} follows left-hand traffic and its resolved auxiliary`);
  const wrong=structuredClone(r);wrong.points=end==='start'?[p,{...q,x:p.x-side*100}]:[{...q,x:p.x+side*100},p];
  assert.equal(rampMap([main,wrong])[0].status,'review','a ramp that travels against the main road cannot be mapped');
}
const inAnchor={roadId:'A',station:200,side:1},outAnchor={roadId:'A',station:400,side:1};
const enter={...ramp,id:'IN',points:[{x:-200,y:-35},rampGeometry.anchorPoint(main,inAnchor,1.75)],anchors:{end:inAnchor},terminals:{end:{length:250,taper:50}}};
const leave={...ramp,id:'OUT',points:[rampGeometry.anchorPoint(main,outAnchor,1.75),{x:200,y:-35}],anchors:{start:outAnchor},terminals:{start:{length:150,taper:50}}};
const weaveRoads=[main,enter,leave],weaveBefore=structuredClone(weaveRoads),weaveCompiled=derive.compileRoadNetwork(weaveRoads,[]);
const weaveMap=ramps.automaticRampLaneConnections(weaveRoads,weaveCompiled);
assert(weaveMap.every(c=>c.status==='mapped'),'both terminals map through the canonical merged auxiliary');
assert.equal(weaveMap[0].auxiliaryRunId,weaveMap[1].auxiliaryRunId,'one continuous auxiliary lane keeps one identity');
assert.deepEqual(weaveRoads,weaveBefore,'ramp mapping never edits authored roads');
assert.deepEqual(derive.compileRoadNetwork(weaveRoads,[]),weaveCompiled,'2D/3D/marking geometry stays unchanged by mapping');
const coincident=structuredClone(weaveRoads);coincident[1].terminals.end.length=150;
assert.equal(rampMap(coincident).find(c=>c.rampRoadId==='OUT').status,'review','a canonical merged run that still tapers to zero at the exit is reviewed, never silently widened');

// Authored auxiliary settings are not proof that the canonical compiler rendered a lane.
const incompatible={...main,ends:{end:{section:{incoming:3,outgoing:2,width:3.5,median:3,walk:0,bands:[]}}}};
assert.equal(rampMap([incompatible,ramp])[0].status,'review','removed/unresolved compiled auxiliary is not mapped');
const reduced={...main,sectionStretches:[{id:'drop',start:100,end:300,taperIn:30,taperOut:30,forwardLanes:1,backwardLanes:2,walk:0}]};
assert.equal(rampMap([reduced,ramp])[0].status,'review','a reduction overlapping the terminal cannot claim a continuous receiving lane');
const away={...main,sectionStretches:[{id:'drop',start:350,end:550,taperIn:30,taperOut:30,forwardLanes:1,backwardLanes:2,walk:0}]};
assert.equal(rampMap([away,ramp])[0].status,'mapped','a reduction away from the terminal leaves its mapping intact');
const shifted=structuredClone(ramp);shifted.points[0].y-=4;
assert.equal(rampMap([main,shifted])[0].status,'review','a stale anchor with a disconnected drawn endpoint needs review');

console.log('PASS PR C auto lane mapping: Thai left-hand turns, multi-arrow lane order, receiving shortage, 3-leg review, U-turn, Slip invariant, old-file roundtrip, ramp diverge/merge and no invented auxiliary');
