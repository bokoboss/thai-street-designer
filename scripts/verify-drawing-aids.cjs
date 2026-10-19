// Phase 3 slice 3 — drawing aids: snapping to road ends and alignments, 15° angle inference,
// snap suspension, typed length, continuing a road from its end.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const s=T('core/road-first/snap.cjs'),c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:2};
const roads=[{id:'R1',name:'ถนนหลัก',points:[{x:0,y:0},{x:200,y:0}],section:sec}];
const o={pxPerMetre:2};

// Road end wins within 14 px (7 m at 2 px/m), even when the alignment is closer in a straight line.
let r=s.snapPoint({x:204,y:3},roads,o);assert.equal(r.kind,'end');assert.deepEqual(r.point,{x:200,y:0});assert.equal(r.end,'end');
// Point on a road alignment within 9 px.
r=s.snapPoint({x:100,y:4},roads,o);assert.equal(r.kind,'road');assert.deepEqual(r.point,{x:100,y:0});
assert.equal(s.snapPoint({x:100,y:6},roads,o).kind,'none','outside the road radius');
// Angle inference: 15° steps from the plan axes and from the previous segment; reports angle and length.
r=s.snapPoint({x:302,y:98},[],{...o,from:{x:300,y:0}});assert.equal(r.kind,'angle');assert.equal(r.angle,90);assert.equal(r.point.x,300);
r=s.snapPoint({x:360,y:2},[],{...o,from:{x:300,y:0}});assert.equal(r.angle,0);assert.equal(r.length,60.03);
r=s.snapPoint({x:300+Math.cos(1.2)*50,y:Math.sin(1.2)*50},[],{...o,from:{x:300,y:0},previousHeading:23.75});
assert.equal(r.kind,'angle');assert.equal(Math.round(r.angle*100)/100,68.75,'15° steps relative to the previous segment (23.75 + 45)');
// Shift suspends every snap.
r=s.snapPoint({x:204,y:3},roads,{...o,off:true});assert.equal(r.kind,'none');assert.deepEqual(r.point,{x:204,y:3});
// Typed length along the cursor direction.
assert.deepEqual(s.pointAtLength({x:0,y:0},{x:3,y:4},120),{x:72,y:96});

// Continue a road from its end; crossing another road while extending creates a junction in the same step.
const project={kind:'road-first',schemaVersion:1,title:'t',roads:[...roads,{id:'R2',name:'ถนนรอง',points:[{x:300,y:-100},{x:300,y:100}],section:{...sec,forwardLanes:1,backwardLanes:1,median:0}}],decisions:[],options:{approachLength:40}};
let ed=c.createEditor(project);
let x=c.runCommand(ed,{type:'road.extend',roadId:'R1',atStart:false,points:[{x:420,y:0}]});
assert.equal(x.result.error,null);assert.equal(x.result.label,'ต่อถนน ถนนหลัก · สร้างทางแยก 1 แห่ง');
assert.deepEqual(x.editor.project.roads[0].points.at(-1),{x:420,y:0});
assert.equal(rp.compileRoadFirstProject(x.editor.project).project.junctions.length,1);
x=c.runCommand(ed,{type:'road.extend',roadId:'R1',atStart:true,points:[{x:-50,y:0},{x:-80,y:-40}]});
assert.deepEqual(x.editor.project.roads[0].points.slice(0,3),[{x:-80,y:-40},{x:-50,y:0},{x:0,y:0}],'points added before the start in drawing order');
// A new road ending on another road's alignment makes a T-junction.
const tee=c.runCommand(ed,{type:'road.add',road:{id:'R3',name:'ซอย',points:[{x:100,y:150},{x:100,y:0}],section:{...sec,forwardLanes:1,backwardLanes:1,median:0}}});
assert.deepEqual(tee.result.autoJunctions.length,1);
const tj=rp.compileRoadFirstProject(tee.editor.project).project.junctions[0];
assert.equal(tj.design.enabled.filter(Boolean).length,3,'three-leg junction');

console.log('PASS drawing aids: end and alignment snapping, 15° angle inference (axes and previous segment), Shift suspends snapping, typed length, continue from road end, T-junction on an alignment');
