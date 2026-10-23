// Auxiliary lanes at ramp ends (deceleration / acceleration), lane continuity into the ramp, weaving (docs/spec/RAMP_LANES.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),rm=T('core/road-first/ramps.cjs'),lr=T('core/road-first/lane-runs.cjs'),lg=T('core/network/network-link-geometry.cjs'),n=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:0};
const edge=1.5+2*3.25,near=(a,b,eps=1e-3)=>Math.abs(a-b)<=eps;
const ramp=(id,points)=>({id,name:id,role:'ramp',points,section:{...rm.RAMP_SECTION}});
let e;
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const R=id=>e.project.roads.find(r=>r.id===id);
const comp=()=>rp.compileRoadFirstProject(e.project);
const fresh=()=>{e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[{id:'M',name:'ถนนหลัก',alignment:'arc',points:[{x:-400,y:0},{x:400,y:0}],section:sec}]});};
// Components of the main road's links, in road stations (the road is split into links at its attachments).
const mainGeo=()=>{const C=comp(),P=C.project,ranges=C.linkRanges.filter(r=>r.roadId==='M');
  const comps=ranges.flatMap(r=>P.links.find(l=>l.id===r.id).components.map(x=>({...x,id:x.id.replace(/^run-/,''),start:x.start+r.from,end:x.end+r.from})));
  // Pieces of one run on consecutive links read as one.
  const l={components:Object.values(comps.reduce((m,x)=>{const y=m[x.id];m[x.id]=y?{...y,end:Math.max(y.end,x.end),start:Math.min(y.start,x.start),taperOut:x.end>y.end?x.taperOut:y.taperOut,taperIn:x.start<y.start?x.taperIn:y.taperIn}:x;return m;},{}))};
  const leftAt=s0=>{const r=ranges.find(r=>s0>=r.from&&s0<=r.to),link=P.links.find(x=>x.id===r.id),g=lg.resolveLinkSectionGeometry(P,link);return g.left[g.stations.findIndex(v=>v>=s0-r.from-1e-6)];};
  return{P,l,leftAt};};

// 1. Deceleration lane before a diverge (eastbound, top side): a full lane up to the diverge, taper upstream; the ramp
//    continues that lane (its centre on the lane's centre), the tie-in taper gives way to the lane, the gore stays.
fresh();run({type:'road.add',road:ramp('X',[{x:-100,y:0},{x:0,y:-40},{x:100,y:-60}])});
{assert.ok(R('X').anchors.start);const before=JSON.stringify(e.project);
 run({type:'ramp.setLane',roadId:'X',end:'start',lane:{length:100,taper:50}});
 const {P,l,leftAt}=mainGeo(),aux=l.components.find(x=>x.id==='aux-X-start');
 assert.deepEqual([aux.direction,aux.side,aux.start,aux.end,aux.taperIn,aux.taperOut],['forward','curb',150,300,50,0]);
 assert.ok(near(leftAt(100),edge,.01)&&near(leftAt(260),edge+3.25,.01),'one more lane next to the diverge');
 assert.ok(near(R('X').points[0].y,-(edge+3.25/2)),'ramp continues the auxiliary lane (centre on its centre)');
 const t=P.rampTapers.find(x=>x.id==='X:start');assert.ok(t&&t.gore,'gore kept');assert.ok(t.gore.every(v=>Math.abs(v.y)>=edge-1e-3),'gore outside the main lanes');
 assert.ok(near(Math.abs(t.gore[0].y),edge)&&near(Math.abs(t.gore[2].y),edge),'gore from the main lanes’ edge');
 assert.equal(n.validateNetworkProject(P),null);assert.equal(JSON.stringify(comp()),JSON.stringify(comp()));
 assert.equal(rp.validateRoadFirstProject(JSON.parse(JSON.stringify(e.project))),null,'save / reopen');
 e=c.undo(e).editor;assert.equal(JSON.stringify(e.project),before,'one undo');e=c.redo(e).editor;}

// 2. Acceleration lane after a merge: full lane from the merge, taper downstream.
run({type:'road.add',road:ramp('Y',[{x:100,y:-60},{x:150,y:-40},{x:300,y:0}])});
{assert.ok(R('Y').anchors.end);run({type:'ramp.setLane',roadId:'Y',end:'end',lane:{length:60,taper:40}});
 const aux=mainGeo().l.components.find(x=>x.id==='aux-Y-end');assert.deepEqual([aux.start,aux.end,aux.taperIn,aux.taperOut],[700,800,0,40]);
 assert.ok(near(R('Y').points.at(-1).y,-(edge+3.25/2)));}

// 3. Westbound side (bottom, against the drawing direction): the deceleration lane lies at higher stations.
{run({type:'road.add',road:ramp('Z',[{x:150,y:0},{x:50,y:40},{x:-50,y:60}])});assert.equal(R('Z').anchors.start.side,-1);
 run({type:'ramp.setLane',roadId:'Z',end:'start',lane:{length:100,taper:50}});
 const aux=mainGeo().l.components.find(x=>x.id==='aux-Z-start');assert.deepEqual([aux.direction,aux.start,aux.end,aux.taperIn,aux.taperOut],['backward',550,700,0,50]);}

// 4. Weaving: a merge followed by a diverge on the same side is measured; lanes that meet become one continuous lane.
fresh();
run({type:'road.add',road:ramp('IN',[{x:-300,y:-60},{x:-250,y:-40},{x:-100,y:0}])});
run({type:'road.add',road:ramp('OUT',[{x:100,y:0},{x:250,y:-40},{x:300,y:-60}])});
{let w=lr.weavingSections(e.project.roads);assert.deepEqual(w,[{roadId:'M',side:1,merge:'IN',diverge:'OUT',length:200,connected:false}]);
 assert.ok(comp().issues.some(i=>/ทางเข้าจาก IN ถึงทางออกไป OUT ห่าง 200 ม\. — ต้องตรวจตามเกณฑ์/.test(i)),'measured, to check');
 run({type:'ramp.setLane',roadId:'IN',end:'end',lane:{length:150,taper:20}});run({type:'ramp.setLane',roadId:'OUT',end:'start',lane:{length:150,taper:20}});
 w=lr.weavingSections(e.project.roads);assert.equal(w[0].connected,true);
 const auxs=mainGeo().l.components.filter(x=>x.id.startsWith('aux-'));assert.equal(auxs.length,1,'one continuous auxiliary lane');
 assert.deepEqual([auxs[0].start,auxs[0].end,auxs[0].taperIn,auxs[0].taperOut],[300,500,0,0]);
 assert.ok(comp().issues.some(i=>/ช่องเสริมต่อเนื่อง \(ช่วงทอผ้า\)/.test(i)));}

// 5. Refusals; detaching leaves the setting dormant; a reversed ramp drops it.
{assert.match(c.executeCommand(e.project,{type:'ramp.setLane',roadId:'IN',end:'start',lane:{length:100,taper:50}}).error,/ไม่ได้ต่อกับข้างถนน/);
 assert.match(c.executeCommand(e.project,{type:'ramp.setLane',roadId:'IN',end:'end',lane:{length:5,taper:50}}).error,/10–1000/);
 assert.match(c.executeCommand(e.project,{type:'ramp.setLane',roadId:'M',end:'end',lane:{length:50,taper:50}}).error,/ไม่พบทางลาด/);
 const bad=JSON.parse(JSON.stringify(e.project));bad.roads[0].terminals={start:{length:100,taper:50}};assert.match(rp.validateRoadFirstProject(bad),/ช่องเร่ง\/ลดความเร็ว/);
 run({type:'ramp.detach',roadId:'OUT',end:'start'});assert.ok(R('OUT').terminals?.start,'setting kept');
 assert.ok(!mainGeo().l.components.some(x=>x.id.startsWith('aux-OUT')),'not built while detached');
 run({type:'ramp.setLane',roadId:'IN',end:'end',lane:null});assert.equal(R('IN').terminals,undefined,'removed');}
console.log('PASS ramp lanes: deceleration / acceleration lanes on the traffic side (both directions), ramp continues the lane, gore from the main lanes, one continuous lane across a weave, weaving measured, refusals, dormant when detached');
