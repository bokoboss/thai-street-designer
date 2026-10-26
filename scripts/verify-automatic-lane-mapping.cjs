// PR C: fail-first contract for automatic junction and ramp lane connections.
const assert=require('node:assert/strict'),path=require('node:path');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const model=T('core/junction/model.cjs'),geometry=T('core/junction/geometry.cjs');
const slip=T('core/junction/slip-model.cjs');
const mapping=T('core/junction/automatic-lane-mapping.cjs');
const ramps=T('core/road-first/ramp-lane-connections.cjs');
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

const three=structuredClone(original);three.enabled[2]=false;
const threeMap=mapping.automaticLaneMapping(three);
assert(threeMap.issues.some(i=>i.kind==='no-exit'&&i.from?.armId===0&&i.movement==='through'),'unavailable arm is reported, not invented');
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

const uturn=structuredClone(original);
uturn.arms[0].laneMarkings=model.withLaneArrow(uturn.arms[0],'incoming','main',0,'uturn');
const uturnMap=mapping.automaticLaneMapping(uturn);
assert(uturnMap.issues.some(i=>i.kind==='uturn-review'),'U-turn is not inferred through an arbitrary arm');
assert(!uturnMap.connections.some(c=>c.from.armId===0&&c.from.role==='main'&&c.from.laneIndex===0),'U-turn-only lane has no invented turn');

const main={id:'A',name:'ถนนหลัก',alignment:'arc',points:[{x:-300,y:0},{x:300,y:0}],section:{forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:3,walk:0}};
const ramp={id:'R',name:'ทางลาด',role:'ramp',alignment:'arc',points:[{x:-100,y:-10},{x:0,y:-35}],
  section:{forwardLanes:1,backwardLanes:0,laneWidth:3.5,median:0,walk:0},
  anchors:{start:{roadId:'A',station:200,side:1}},terminals:{start:{length:100,taper:50}}};
const routed=ramps.automaticRampLaneConnections([main,ramp]);
assert.equal(routed.length,1);
assert.equal(routed[0].status,'mapped');
assert.equal(routed[0].movement,'diverge');
assert.equal(routed[0].direction,'forward');
assert.equal(routed[0].mainCurbLane,1);
assert(routed[0].auxiliaryRunId,'maps via the existing auxiliary lane run');
const merge={...ramp,anchors:{end:{roadId:'A',station:400,side:-1}},terminals:{end:{length:100,taper:50}}};
const mergeMap=ramps.automaticRampLaneConnections([main,merge])[0];
assert.equal(mergeMap.status,'mapped');assert.equal(mergeMap.movement,'merge');
assert.equal(mergeMap.direction,'backward','opposite-side merge uses actual backward traffic');
assert(mergeMap.auxiliaryRunId);
const noTerminal={...ramp,terminals:undefined};
const reviewed=ramps.automaticRampLaneConnections([main,noTerminal])[0];
assert.equal(reviewed.status,'review','no authoring a missing acceleration / deceleration lane');
assert(!reviewed.auxiliaryRunId);
assert.deepEqual(ramps.automaticRampLaneConnections([main]),[],'old files with no ramps stay untouched');

console.log('PASS PR C auto lane mapping: Thai left-hand turns, multi-arrow lane order, receiving shortage, 3-leg review, U-turn, Slip invariant, old-file roundtrip, ramp diverge/merge and no invented auxiliary');
