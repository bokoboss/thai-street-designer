// P0 (independent review 2026-10-20): no road or junction leg disappears silently.
// - a road that later reaches an existing junction joins it, or stays out with a reason shown;
// - a junction never loses legs past the supported four; a road left out on purpose is not added back.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:2};
const start=()=>c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{approachLength:40},roads:[]});
const step=(ed,cmd)=>{const x=c.runCommand(ed,cmd);return{ed:x.editor,r:x.result};};
const road=(id,a,b)=>({type:'road.add',road:{id,name:'ถนน '+id,points:[a,b],section:sec}});
const legsOf=ed=>rp.compileRoadFirstProject(ed.project).legs.map(l=>l.roadId+':'+l.side).sort();

// T junction (A through, B ends at A) + C ends at the same point from the other side → joins as the 4th leg.
let ed=start();
({ed}=step(ed,road('A',{x:-200,y:0},{x:200,y:0})));
({ed}=step(ed,road('B',{x:0,y:200},{x:0,y:0})));
assert.deepEqual(legsOf(ed),['A:ahead','A:behind','B:behind']);
let {ed:e2,r}=step(ed,road('C',{x:0,y:-200},{x:0,y:0}));
assert.equal(r.error,null);assert.deepEqual(r.joined.map(j=>j.roads),[['C']]);
assert.match(r.label,/ถนน C เข้าทางแยก แยก ถนน A × ถนน B/);
assert.deepEqual(legsOf(e2),['A:ahead','A:behind','B:behind','C:behind']);
assert.deepEqual(rp.compileRoadFirstProject(e2.project).unjoined,{});

// Four-leg junction + a road ending at its centre would make five legs → not joined, reason shown, junction keeps 4 legs.
({ed:e2,r}=step(e2,road('D',{x:-150,y:-150},{x:0,y:0})));
assert.equal(r.error,null);assert.equal(r.joined.length,0);assert.equal(r.blocked.length,1);
assert.match(r.blocked[0].reason,/เกิน 4 ขา/);assert.ok(r.warnings.some(w=>/ถนน D ถึง.*เชื่อมเข้าไม่ได้/.test(w)));
const comp=rp.compileRoadFirstProject(e2.project);
assert.equal(comp.legs.length,4);assert.deepEqual(Object.values(comp.unjoined),[['D']]);
assert.ok(comp.issues.some(s=>/ถนน ถนน D ผ่านหรือมาจบที่ทางแยกนี้แต่ไม่ได้เชื่อม/.test(s)),'stays visible as an issue');
assert.deepEqual(comp.overflow,[],'no junction silently loses legs');

// A road crossing straight through the centre of a four-leg junction: same — reported, not truncated.
let e3=start();
({ed:e3}=step(e3,road('A',{x:-200,y:0},{x:200,y:0})));
({ed:e3}=step(e3,road('B',{x:0,y:-200},{x:0,y:200})));
({ed:e3,r}=step(e3,road('E',{x:-150,y:-150},{x:150,y:150})));
assert.equal(r.blocked.length,1);assert.equal(rp.compileRoadFirstProject(e3.project).legs.length,4);

// A new crossing of three roads at once that would need more than four legs stays an open crossing with the reason.
let e4=start();
({ed:e4}=step(e4,road('A',{x:-200,y:0},{x:200,y:0})));
({ed:e4}=step(e4,road('B',{x:0,y:-200},{x:0,y:200})));
({ed:e4}=step(e4,{type:'crossing.decide',candidateId:e4.project.decisions[0].candidateId,decision:'grade-separated'}));
({ed:e4,r}=step(e4,road('F',{x:-150,y:-150},{x:150,y:150})));
assert.equal(r.autoJunctions.length,0);assert.equal(rp.compileRoadFirstProject(e4.project).overflow.length,0);

// A road the junction left out on purpose (junction.setRoads) is not added back by an unrelated edit.
({ed:e2}=step(e2,{type:'road.remove',roadId:'D'}));
const cid=e2.project.decisions[0].candidateId;
({ed:e2,r}=step(e2,{type:'junction.setRoads',candidateId:cid,roads:['A','B']}));assert.equal(r.error,null);
({ed:e2,r}=step(e2,{type:'road.setSection',roadId:'A',patch:{walk:2.5}}));
({ed:e2,r}=step(e2,{type:'road.movePoint',roadId:'A',index:0,point:{x:-210,y:0}}));
assert.equal(r.joined.length,0,'kept out');assert.deepEqual(legsOf(e2),['A:ahead','A:behind','B:behind']);
console.log('PASS topology integrity: roads reaching a junction join it or are reported; no silent leg loss beyond four; deliberate exclusions kept');
