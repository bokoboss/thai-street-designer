// Reverse a road, straighten it between points, connect two roads with a tangent curve (docs/spec/SELECT_HUB.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),dv=T('core/road-first/derive.cjs'),el=T('core/road-first/elevation.cjs'),rm=T('core/road-first/ramps.cjs'),lb=T('core/road-first/leg-binding.cjs'),tc=T('core/road-first/tangent-connect.cjs');
const sec={forwardLanes:3,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
const near=(a,b,eps=1e-3)=>Math.abs(a-b)<=eps;
let e;
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const R=id=>e.project.roads.find(r=>r.id===id);
const fresh=roads=>{e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads});};

// 1. Reverse a two-way road: traffic, junction settings, levels, openings and attached ramps stay on the ground.
fresh([{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-300,y:0},{x:300,y:0}],section:sec}]);
run({type:'road.add',road:{id:'B',name:'ถนนบี',points:[{x:0,y:-200},{x:0,y:200}],section:{...sec,forwardLanes:2}}});
{const cid=e.project.decisions[0].candidateId;
 run({type:'junction.setTreatments',candidateId:cid,treatments:{legs:{[lb.legKey('A','ahead')]:{stopLine:false}},cornerRadii:{[lb.legKey('A','ahead')]:12}}});
 run({type:'road.setProfile',roadId:'A',profile:[{station:0,z:0},{station:600,z:.4}]});
 run({type:'road.setOpenings',roadId:'A',openings:[{id:'o1',type:'uturn',station:80,length:8}]});
 run({type:'road.add',road:{id:'X',name:'ทางลาด',role:'ramp',points:[{x:150,y:0},{x:230,y:-30}],section:{...rm.RAMP_SECTION}}});
 const before=JSON.parse(JSON.stringify(e.project)),xStart={...R('X').points[0]},zGround=el.levelAt(R('A').profile,100);
 const r=run({type:'road.reverse',roadId:'A'});assert.match(r.label,/กลับทิศการวาด ถนนเอ/);
 const a=R('A');assert.deepEqual(a.points[0],{x:300,y:0});assert.equal(a.section.forwardLanes,2);assert.equal(a.section.backwardLanes,3,'lane counts follow the direction');
 assert.ok(near(el.levelAt(a.profile,500),zGround),'same level on the ground');
 assert.equal(a.openings[0].station,512,'opening at the same place');
 assert.ok(e.project.decisions[0].treatments.legs[lb.legKey('A','behind')],'leg settings on the same arm');
 assert.equal(e.project.decisions[0].treatments.cornerRadii[lb.legKey('A','behind')],12,'per-corner radius follows the same physical road leg');
 assert.equal(e.project.decisions[0].treatments.cornerRadii[lb.legKey('A','ahead')],undefined,'old directional leg key does not linger');
 const compiled=rp.compileRoadFirstProject(e.project),leg=compiled.legs.find(l=>l.roadId==='A'&&l.side==='behind');
 assert.equal(compiled.project.junctions.find(j=>j.id===leg.junctionId).design.cornerRadii[leg.armId],12,'compiled corner stays on that leg');
 assert.equal(R('X').anchors.start.roadId,'A');assert.equal(R('X').anchors.start.side,-1);assert.ok(near(R('X').anchors.start.station,150));
 assert.deepEqual(R('X').points[0],xStart,'ramp stays attached in place');assert.equal(rp.compileRoadFirstProject(e.project).project.junctions.length,1);
 run({type:'road.reverse',roadId:'A'});
 assert.deepEqual(e.project.roads,before.roads,'reversing twice gives the same roads');assert.deepEqual(e.project.decisions,before.decisions,'and the same junction settings');
 e=c.undo(e).editor;e=c.undo(e).editor;assert.deepEqual(e.project,before,'one undo each');}

// 2. Reverse a ramp: its direction of travel changes. Attached, that would run against traffic and is refused with the
//    reason; detached, it reverses (and a free end that now fits the traffic attaches as usual).
{assert.match(c.executeCommand(e.project,{type:'road.reverse',roadId:'X'}).error,/สวนทิศ/);
 run({type:'road.add',road:{id:'Y',name:'ทางลาดอิสระ',role:'ramp',points:[{x:-250,y:-150},{x:-150,y:-180}],section:{...rm.RAMP_SECTION}}});
 const r=run({type:'road.reverse',roadId:'Y'});assert.match(r.label,/ทางลาดกลับทิศเดินรถ/);assert.deepEqual(R('Y').points[0],{x:-150,y:-180});
 assert.equal(R('Y').section.forwardLanes,1,'a one-way ramp keeps its lane on its own direction');}

// 3. Straighten between two points: points in between removed, levels / openings / ramps re-measured on the ground.
fresh([{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-300,y:0},{x:-100,y:20},{x:100,y:-20},{x:300,y:0}],section:sec,profile:[{station:0,z:0},{station:610,z:.6}],openings:[{id:'o',type:'opening',station:450,length:6}]}]);
run({type:'road.add',road:{id:'X',name:'ทางลาด',role:'ramp',points:[{x:150,y:-12},{x:230,y:-40}],section:{...rm.RAMP_SECTION}}});
{const len0=dv.stations(R('A').points,'arc').at(-1),centre=dv.pointAt(R('A').points,453,'arc');assert.ok(R('X').anchors?.start);
 const r=run({type:'road.straighten',roadId:'A',from:0,to:3});assert.match(r.label,/ทำแนวตรง ถนนเอ จากจุดที่ 1 ถึง 4 · ลบจุดแนว 2 จุด/);
 const a=R('A');assert.equal(a.points.length,2);assert.ok(near(dv.stations(a.points,'arc').at(-1),600));
 assert.ok(near(a.profile.at(-1).station,600,.01),'last level point at the new end');assert.ok(a.profile.at(-1).station<len0);
 assert.ok(Math.abs(a.openings[0].station+3-(centre.x+300))<1,'opening kept near its place');
 assert.ok(R('X').anchors?.start&&Math.abs(R('X').points[0].y+(1.5+3*3.25))<1e-3,'ramp re-attached on the straight edge');
 assert.match(c.executeCommand(e.project,{type:'road.straighten',roadId:'A',from:0,to:1}).error,/อย่างน้อยหนึ่งจุด/);}

// 4. Tangent curve between two roads: ends extended to where their straights meet, joined, largest radius that fits.
fresh([{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-300,y:0},{x:-50,y:0}],section:sec},{id:'B',name:'ถนนบี',alignment:'arc',points:[{x:0,y:50},{x:0,y:300}],section:sec}]);
{const p=tc.tangentConnectPlan(e.project,'A','B');assert.ok(!p.error,p.error);assert.deepEqual(p.vertex,{x:0,y:0});assert.equal(p.radius,135);
 const before=JSON.stringify(e.project);run(p.cmd);
 assert.equal(e.project.roads.length,1);const a=R('A');assert.deepEqual(a.points.map(q=>[q.x,q.y]),[[-300,0],[0,0],[0,300]]);assert.equal(a.points[1].radius,135);
 assert.ok(near(dv.stations(a.points,'arc').at(-1),300-135+Math.PI/2*135+300-135,.01),'line, quarter circle, line');
 e=c.undo(e).editor;assert.equal(JSON.stringify(e.project),before,'one undo');
 assert.equal(tc.tangentConnectPlan(e.project,'A','B',60).radius,60);assert.match(tc.tangentConnectPlan(e.project,'A','B',500).error,/สูงสุด 135/);}
fresh([{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-300,y:0},{x:-50,y:0}],section:sec},{id:'B',name:'ถนนบี',alignment:'arc',points:[{x:0,y:40},{x:300,y:40}],section:sec}]);
assert.match(tc.tangentConnectPlan(e.project,'A','B').error,/ไม่ตัดกัน/,'parallel straights');
// 5. Split before a junction: per-corner radius follows the downstream road ID, same physical leg.
fresh([{id:'A',name:'ถนนเอ',points:[{x:-300,y:0},{x:300,y:0}],section:sec}]);
run({type:'road.add',road:{id:'B',name:'ถนนบี',points:[{x:150,y:-180},{x:150,y:180}],section:sec}});
{const cid=e.project.decisions[0].candidateId;
 run({type:'junction.setCornerAt',candidateId:cid,leg:lb.legKey('A','ahead'),radius:12});
 const before=structuredClone(e.project);
 run({type:'road.split',roadId:'A',at:{x:0,y:0},newId:'A2'});
 const j=e.project.decisions.find(d=>d.decision==='junction');
 assert.equal(j.treatments.cornerRadii[lb.legKey('A2','ahead')],12,'corner key moves to the downstream road');
 assert.equal(j.treatments.cornerRadii[lb.legKey('A','ahead')],undefined,'corner does not remain on the obsolete leg');
 const compiled=rp.compileRoadFirstProject(e.project),leg=compiled.legs.find(l=>l.roadId==='A2'&&l.side==='ahead');
 assert.equal(compiled.project.junctions.find(x=>x.id===leg.junctionId).design.cornerRadii[leg.armId],12,'compiled junction corner remains on the same world leg');
 e=c.undo(e).editor;assert.deepEqual(e.project,before,'split and corner remap undo as one command');
}

console.log('PASS reshape: reverse keeps traffic / junction settings / levels / openings / ramps (twice = identity), ramp reverse flips travel; straighten re-measures levels, openings and ramps; tangent curve joins two roads with the largest fitting radius, one undo, refusals');
