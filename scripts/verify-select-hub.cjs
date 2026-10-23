// Select as the editing hub: move a selection, split a road, box selection (docs/spec/SELECT_HUB.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),dv=T('core/road-first/derive.cjs'),el=T('core/road-first/elevation.cjs'),sel=T('core/road-first/selection.cjs'),rm=T('core/road-first/ramps.cjs'),lb=T('core/road-first/leg-binding.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
const near=(a,b,eps=1e-3)=>Math.abs(a-b)<=eps;
let e;
const run=(cmd,gesture=false)=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=gesture?x.editor:c.endGesture(x.editor);return x.result;};
const R=id=>e.project.roads.find(r=>r.id===id);
const comp=()=>rp.compileRoadFirstProject(e.project);
const start=()=>{e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-300,y:0},{x:300,y:0}],section:sec}]});
  run({type:'road.add',road:{id:'B',name:'ถนนบี',points:[{x:0,y:-200},{x:0,y:200}],section:sec}});};

// 1. Moving a selection: a junction with its settings moves with both roads; one drag (many steps) = one undo step.
start();
{const cid=e.project.decisions[0].candidateId;run({type:'junction.setCorner',candidateId:cid,corner:14});
 const before=JSON.stringify(e.project);
 for(let i=1;i<=5;i++)run({type:'roads.move',roadIds:['A','B'],delta:{x:10,y:4}},true);e=c.endGesture(e);
 assert.ok(near(R('A').points[0].x,-250)&&near(R('B').points[0].y,-180),'moved by the sum of the steps');
 assert.equal(comp().project.junctions.length,1);assert.equal(e.project.decisions[0].treatments.corner,14,'junction settings kept');
 assert.ok(near(e.project.decisions[0].at.x,50)&&near(e.project.decisions[0].at.y,20),'junction re-bound at its new place');
 e=c.undo(e).editor;assert.equal(JSON.stringify(e.project),before,'one undo for the whole drag');}

// 2. Ramps: one attached to a moved road follows it; a ramp moved on its own slides along the road or lets go.
start();
run({type:'road.add',road:{id:'X',name:'ทางลาด',role:'ramp',points:[{x:-200,y:0},{x:-120,y:-30}],section:{...rm.RAMP_SECTION}}});
assert.ok(R('X').anchors?.start,'attached');
run({type:'roads.move',roadIds:['A'],delta:{x:0,y:-10}});assert.ok(near(R('X').points[0].y,-10-(1.5+2*3.25)),'ramp end follows the moved road');
run({type:'roads.move',roadIds:['X'],delta:{x:15,y:0}});assert.ok(R('X').anchors?.start&&near(R('X').anchors.start.station,115,.5),'moved along the road: still attached, slid');
run({type:'roads.move',roadIds:['X'],delta:{x:0,y:-60}});assert.equal(R('X').anchors,undefined,'moved away: lets go');
assert.match(c.executeCommand(e.project,{type:'roads.move',roadIds:['nope'],delta:{x:1,y:1}}).error,/ไม่พบถนน/);
assert.match(c.executeCommand(e.project,{type:'roads.move',roadIds:['A'],delta:{x:NaN,y:1}}).error,/ระยะย้าย/);

// 3. Split a road: two pieces trace the same ground; levels, openings, junction settings and ramp attachments follow.
start();
{const cid=e.project.decisions[0].candidateId;run({type:'junction.setCorner',candidateId:cid,corner:12});
 const legs=Object.fromEntries([[lb.legKey('A','ahead'),{stopLine:false}]]);run({type:'junction.setTreatments',candidateId:cid,treatments:{...e.project.decisions[0].treatments,legs}});
 run({type:'road.setProfile',roadId:'A',profile:[{station:0,z:0},{station:600,z:.4}]});
 run({type:'road.setOpenings',roadId:'A',openings:[{id:'o1',type:'uturn',station:80,length:8},{id:'o2',type:'opening',station:520,length:6}]});
 run({type:'road.add',road:{id:'X',name:'ทางลาด',role:'ramp',points:[{x:150,y:0},{x:230,y:-30}],section:{...rm.RAMP_SECTION}}});
 const xBefore={...R('X').points[0]},before=JSON.stringify(e.project),zAt=s=>el.levelAt(R('A').profile,s),z500=zAt(500),z100=zAt(100);
 const r=run({type:'road.split',roadId:'A',at:{x:-50,y:3},newId:'A2'});assert.match(r.label,/แยกถนน ถนนเอ ที่ระยะ 250\.0 ม\./);
 const a=R('A'),b=R('A2');assert.equal(b.name,'ถนนเอ (2)');
 assert.ok(near(dv.stations(a.points,a.alignment).at(-1),250)&&near(dv.stations(b.points,b.alignment).at(-1),350),'same total length');
 assert.ok(near(el.levelAt(a.profile,100),z100)&&near(el.levelAt(b.profile,250),z500),'levels unchanged on the ground');
 assert.deepEqual(a.openings.map(o=>o.id),['o1']);assert.deepEqual(b.openings.map(o=>[o.id,o.station]),[['o2',270]]);
 const d=e.project.decisions[0];assert.deepEqual(d.roads.slice().sort(),['A2','B'],'junction now on the new piece');
 assert.equal(d.treatments.corner,12);assert.ok(d.treatments.legs[lb.legKey('A2','ahead')],'leg settings follow');
 assert.equal(comp().project.junctions.length,1);assert.equal(R('X').anchors.start.roadId,'A2');assert.ok(near(R('X').anchors.start.station,200));
 assert.deepEqual(R('X').points[0],xBefore,'ramp end stays in place');
 assert.equal(rp.validateRoadFirstProject(JSON.parse(JSON.stringify(e.project))),null);
 // Joined back: one road again.
 run({type:'road.setProfile',roadId:'A',profile:null});run({type:'road.setProfile',roadId:'A2',profile:null});
 e=c.undo(c.undo(c.undo(e).editor).editor).editor;assert.equal(JSON.stringify(e.project),before,'one undo per step, split included');}
// Refusals.
start();
{const f=(at,re,extra)=>assert.match(c.executeCommand(extra??e.project,{type:'road.split',roadId:'A',at,newId:'N'}).error,re);
 f({x:-298,y:0},/ใกล้ปลายถนน/);f({x:0,y:0},/จุดตัด|ทางแยก/);
 const bent=JSON.parse(JSON.stringify(e.project));bent.roads[0].points=[{x:-300,y:0},{x:0,y:0,radius:100},{x:200,y:200}];bent.decisions=[];bent.roads=[bent.roads[0]];
 const arcPt=T('core/common/resolved-alignment.cjs').resolveAlignment(bent.roads[0].points,'arc');f(arcPt.pointAt(arcPt.vertices[1]),/โค้ง/,bent);
 const op=JSON.parse(JSON.stringify(e.project));op.roads[0].openings=[{id:'o',type:'opening',station:100,length:10}];f({x:-195,y:0},/ช่องเปิด/,op);
 assert.match(c.executeCommand(e.project,{type:'road.split',roadId:'A',at:{x:-100,y:0},newId:'B'}).error,/มีถนนรหัส B/);}

// 4. Box selection touches a road anywhere along it (even with no point inside the box); bounds; join pair.
start();
assert.deepEqual(sel.roadsInBox(e.project.roads,{x0:-50,y0:-10,x1:-40,y1:10}),['A'],'segment through the box');
assert.deepEqual(sel.roadsInBox(e.project.roads,{x0:-10,y0:-10,x1:10,y1:10}).sort(),['A','B']);
assert.deepEqual(sel.roadsInBox(e.project.roads,{x0:100,y0:100,x1:120,y1:120}),[]);
assert.deepEqual(sel.selectionBounds(e.project.roads,['A']),{x0:-300,y0:0,x1:300,y1:0});
run({type:'road.split',roadId:'A',at:{x:-150,y:0},newId:'A2'});assert.deepEqual(sel.joinablePair(e.project.roads,['A','A2']),['A','A2']);
assert.equal(sel.joinablePair(e.project.roads,['A','B']),null);assert.deepEqual(sel.toggleId(['A'],'B'),['A','B']);assert.deepEqual(sel.toggleId(['A','B'],'A'),['B']);
// 5. Split at an existing (sharp) point: no doubled point, same ground.
{e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-300,y:0},{x:0,y:0},{x:200,y:150}],section:sec}]});
 run({type:'road.split',roadId:'A',at:{x:0,y:0},newId:'A2'});assert.deepEqual(R('A').points,[{x:-300,y:0},{x:0,y:0}]);assert.deepEqual(R('A2').points,[{x:0,y:0},{x:200,y:150}]);}
console.log('PASS select hub: split at a point, move a selection (junction kept, one undo per drag), ramps follow / slide / let go, split keeps the ground (levels, openings, junction settings, ramp attachments) with refusals, box selection, bounds, join pair');
