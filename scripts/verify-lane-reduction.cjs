// Mid-block 2 -> 1 -> 2 lane reduction. Regression first; no new geometry path.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const cmd=T('core/road-first/commands.cjs'),rf=T('core/road-first/project.cjs');
const gl=T('core/network/network-link-geometry.cjs'),network=T('core/network/network-project.cjs');
const sectionStretches=T('core/road-first/section-stretches.cjs');
const geom=T('core/junction/geometry.cjs'),junction=T('core/junction/model.cjs'),slip=T('core/junction/slip-model.cjs');
const section={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2,bands:[{id:'sh',type:'shoulder',width:1}]};
const original={kind:'road-first',schemaVersion:3,title:'Lane reduction',decisions:[],options:{},roads:[
 {id:'A',name:'ถนนหลัก',alignment:'arc',points:[{x:-300,y:0},{x:300,y:0}],section}
]};
const reduction={id:'D1',start:200,end:400,taperIn:30,taperOut:30,forwardLanes:1,backwardLanes:2,walk:2,bands:[{type:'shoulder',width:1}]};
const near=(a,b,e=.01)=>Math.abs(a-b)<e;
const fresh=()=>cmd.createEditor(structuredClone(original));
const doCmd=(e,c)=>{const r=cmd.runCommand(e,c);assert.equal(r.result.error,null,`${c.type}: ${r.result.error}`);return cmd.endGesture(r.editor);};
const compile=e=>rf.compileRoadFirstProject(e.project);
const geometry=e=>{const p=compile(e).project;return gl.resolveLinkSectionGeometry(p,p.links[0]);};
const at=(g,s)=>{const i=g.stations.findIndex(v=>v>=s-1e-6);assert.ok(i>=0,`station ${s} exists`);return i;};
const set=(e,stretches)=>cmd.runCommand(e,{type:'road.setSectionStretches',roadId:'A',stretches});
const originalGeometry=geometry(fresh());
assert.equal(rf.normalizeRoadFirstProject(JSON.parse(JSON.stringify(original))).roads[0].sectionStretches,undefined);
assert.ok(near(originalGeometry.left[at(originalGeometry,300)],8),'old road unchanged: 2 lanes on the forward side');
assert.ok(near(originalGeometry.right[at(originalGeometry,300)],8),'old road unchanged: 2 lanes on the backward side');

let e=fresh();
e=doCmd(e,{type:'road.setSectionStretches',roadId:'A',stretches:[reduction]});
const compiled=compile(e),link=compiled.project.links[0];
assert.equal(network.validateNetworkProject(compiled.project),null,'compiled project stays valid');
const drops=link.components.filter(x=>x.kind==='lane'&&x.operation==='drop');
assert.equal(drops.length,1,'one explicit curb-side lane reduction, not a negative width trick');
assert.equal(drops[0].side,'curb');assert.equal(drops[0].direction,'forward');
const g=geometry(e),before=at(g,100),middle=at(g,300),after=at(g,500);
assert.ok(near(g.left[before],8)&&near(g.left[middle],4.75)&&near(g.left[after],8),'surface footprint narrows and reopens');
assert.ok(near(g.right[middle],8),'backward direction unaffected');
assert.ok(near(g.forwardBands[0].inner[middle],g.left[middle]),'shoulder follows the actual edge');
assert.ok(near(g.forwardWalk.inner[middle],g.forwardBands[0].outer[middle]),'sidewalk follows the shoulder');
const mainDivider=g.laneLines.find(x=>x.id==='forward:main:1');
assert.ok(mainDivider,'stable main divider identity');
assert.ok(mainDivider.offsets[before]!=null&&mainDivider.offsets[middle]===null&&mainDivider.offsets[after]!=null,'no phantom 2-lane marking inside the single-lane stretch');
assert.equal(JSON.stringify(compile(e)),JSON.stringify(compile(e)),'deterministic');
const saved=JSON.parse(JSON.stringify(e.project));assert.deepEqual(rf.normalizeRoadFirstProject(saved),saved,'save/reopen unchanged');
assert.equal(JSON.stringify(rf.compileRoadFirstProject(saved)),JSON.stringify(compiled),'reopened geometry unchanged');
const undone=cmd.undo(e);assert.ok(undone);assert.deepEqual(undone.editor.project,original,'single undo');
const redone=cmd.redo(undone.editor);assert.ok(redone);assert.deepEqual(redone.editor.project,e.project,'single redo');

let opposite=fresh();
opposite=doCmd(opposite,{type:'road.setSectionStretches',roadId:'A',stretches:[{...reduction,forwardLanes:2,backwardLanes:1}]});
const gb=geometry(opposite);assert.ok(near(gb.right[at(gb,300)],4.75)&&near(gb.left[at(gb,300)],8),'backward reduction follows left-hand traffic');
assert.equal(gb.laneLines.find(x=>x.id==='backward:main:1').offsets[at(gb,300)],null,'reverse-flow divider suppressed');

const make=sectionStretches.newLaneReduction(original.roads[0],[{start:0,end:600}],'forward');
assert.ok(make.stretch,'one-click default reduction is available');
assert.deepEqual([make.stretch.forwardLanes,make.stretch.backwardLanes],[1,2]);
assert.deepEqual([make.stretch.start,make.stretch.end,make.stretch.taperIn,make.stretch.taperOut],[200,400,30,30]);

const reject=(project,stretches,re)=>{const r=set(project,stretches);assert.match(r.result.error??'',re);assert.deepEqual(r.editor.project,project.project,'rejection is atomic');};
reject(fresh(),[{...reduction,forwardLanes:0}],/อย่างน้อย|ศูนย์|0 ช่อง/);
reject(fresh(),[{...reduction,forwardLanes:4}],/ไม่เกิน 2 ช่อง/);
reject(e,[reduction,{...reduction,id:'D2',start:250,end:450}],/ซ้อน|ลดช่อง/);
const mixed=cmd.runCommand(e,{type:'road.setLaneRuns',roadId:'A',runs:[{id:'X',direction:'forward',side:'curb',start:260,end:350,taperIn:10,taperOut:10}]});
assert.match(mixed.result.error??'',/ซ้อน|ลดช่อง/,'cannot add and reduce a lane in the same station interval');
assert.deepEqual(mixed.editor.project,e.project,'mixed overlap rejected atomically');
const structure={...original.roads[0],structureSection:{forwardLanes:1,backwardLanes:2,walk:2,bands:[{type:'shoulder',width:1}],transition:30}};
assert.match(rf.validateRoadFirstProject({...original,roads:[structure]})??'',/น้อยกว่าถนน/,'structure reductions not silently enabled');

const oldAdded={...original,roads:[{...original.roads[0],sectionStretches:[{...reduction,id:'A1',forwardLanes:3}]}]};
assert.equal(JSON.stringify(rf.normalizeRoadFirstProject(JSON.parse(JSON.stringify(oldAdded)))),JSON.stringify(oldAdded),'legacy authored add file unchanged');
const oldCompiled=rf.compileRoadFirstProject(oldAdded).project,gOld=gl.resolveLinkSectionGeometry(oldCompiled,oldCompiled.links[0]);
assert.ok(near(gOld.left[at(gOld,300)],11.25)&&gOld.laneLines.some(l=>l.id==='forward:component:st-A1-f1'),'legacy positive lane remains identical');

let reversed=doCmd(e,{type:'road.reverse',roadId:'A'});
assert.equal(reversed.project.roads[0].sectionStretches[0].backwardLanes,1);
assert.equal(reversed.project.roads[0].sectionStretches[0].forwardLanes,2);
reversed=doCmd(reversed,{type:'road.reverse',roadId:'A'});
assert.deepEqual(reversed.project.roads,e.project.roads,'reverse twice is exact');
let split=doCmd(e,{type:'road.split',roadId:'A',at:{x:0,y:0},newId:'A2'});
assert.equal(split.project.roads.length,2);
split=doCmd(split,{type:'road.join',roadId:'A',otherId:'A2'});
assert.equal(split.project.roads.length,1);
assert.equal(network.validateNetworkProject(compile(split).project),null,'split/join retains valid geometry');

const d=junction.initial();d.arms.forEach(a=>a.length=180);
assert.deepEqual(geom.edges(slip.addSlip(d,0)),geom.edges(d),'Slip invariant: base edges are unaffected');
console.log('PASS lane reduction: curb drop 2 -> 1 -> 2, exact geometry and lane markings, left-hand directions, old files, atomic refusals, undo, reverse/split/join, Slip invariant');
