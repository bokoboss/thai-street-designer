// Phase 4A — road levels and grade-separated crossings: acceptance tests of docs/spec/PHASE_4A_ELEVATION.md.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),el=T('core/road-first/elevation.cjs'),lg=T('core/network/network-link-geometry.cjs'),rep=T('core/network/network-design-report.cjs'),n=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
// Profile basics.
assert.equal(el.levelAt(undefined,50),0);assert.equal(el.levelAt([{station:0,z:0},{station:100,z:10}],50),5);assert.equal(el.levelAt([{station:10,z:3}],0),3);
{const near=el.riseProfile(undefined,40,0,30,6,.04,500);assert.equal(el.profileError(near),null,'rise near the road start stays valid');assert.equal(near[0].station,0);assert.ok(near[0].z>0&&near[0].z<6,'starts part-way up');assert.equal(el.levelAt(near,40),6);}
assert.match(el.profileError([{station:5,z:0},{station:5,z:1}]),/ระยะเดียวกัน/);assert.equal(el.profileError(undefined),null);

let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'R1',name:'ถนนล่าง',points:[{x:-300,y:0},{x:300,y:0}],section:sec}]});
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const comp=()=>rp.compileRoadFirstProject(e.project);
// 1. Crossing in plan at different levels: no junction; grade-separated with the higher road over.
const r=run({type:'road.add',road:{id:'R2',name:'ถนนบน',points:[{x:0,y:-300},{x:0,y:300}],section:sec,profile:[{station:0,z:7},{station:600,z:7}]}});
assert.equal(r.autoJunctions.length,0,'no junction');assert.equal(r.autoSeparated.length,1,'grade separation announced');
assert.equal(comp().project.junctions.length,0);
let x=comp().crossings;assert.equal(x.length,1);assert.equal(x[0].relation,'over');assert.equal(x[0].over,'R2');assert.equal(x[0].gap,7);
assert.equal(comp().project.crossings[0].relation,'over','network carries the crossing');
const dec=e.project.decisions[0];assert.deepEqual([dec.decision,dec.over],['grade-separated','R2']);
// Link levels for consumers.
const r2link=comp().project.links.find(l=>comp().sources.links[l.id]==='R2');assert.ok(lg.resolveLinkSectionGeometry(comp().project,r2link).z.every(v=>v===7));
// 2. Flip: R1 rises over R2 in one step; plan draw order and levels follow.
const gs=T('core/road-first/grade-separation.cjs'),flip=gs.overCommand(e.project,dec.candidateId,'R1');assert.ok(flip.cmd,flip.error);
const fr=run(flip.cmd);assert.match(fr.label,/ถนนล่าง ข้าม ถนนบน/);
x=comp().crossings[0];assert.equal(x.over,'R1');assert.ok(Math.abs(x.gap-el.RISE_DEFAULTS.height)<.01,'generated rise: default height above the lower road');
const order=lg.linksInDrawOrder(comp().project).map(l=>comp().sources.links[l.id]);assert.equal(order.at(-1),'R1','upper road drawn last');
assert.ok(e.project.roads.find(q=>q.id==='R1').profile.length>=4,'R1 has a rise profile');
// 4. One undo reverts relation and profile.
e=c.undo(e).editor;assert.equal(comp().crossings[0].over,'R2');assert.equal(e.project.roads.find(q=>q.id==='R1').profile,undefined);
e=c.redo(e).editor;assert.equal(comp().crossings[0].over,'R1');
// 3. Moving an alignment recomputes the crossing deterministically.
run({type:'road.movePoint',roadId:'R2',index:0,point:{x:40,y:-300}});run({type:'road.movePoint',roadId:'R2',index:1,point:{x:40,y:300}});
const a1=JSON.stringify(comp().crossings),a2=JSON.stringify(comp().crossings);assert.equal(a1,a2,'deterministic');
assert.ok(Math.abs(comp().crossings[0].point.x-40)<.01,'crossing moved with the road');
// Unresolved: equal levels on a grade separation; contradicting choice.
const flat=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'A',name:'A',points:[{x:-100,y:0},{x:100,y:0}],section:sec},{id:'B',name:'B',points:[{x:0,y:-100},{x:0,y:100}],section:sec}]});
let f=c.endGesture(c.runCommand(flat,{type:'road.add',road:{id:'tmp',name:'t',points:[{x:900,y:900},{x:950,y:900}],section:sec}}).editor);
const cid=f.project.decisions[0].candidateId;f=c.runCommand(f,{type:'crossing.decide',candidateId:cid,decision:'grade-separated'}).editor;
assert.equal(rp.compileRoadFirstProject(f.project).crossings[0].relation,'unresolved','same level → unresolved');
// Junction with roads at different levels is reported.
const j=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'A',name:'A',points:[{x:-100,y:0},{x:100,y:0}],section:sec},{id:'B',name:'B',points:[{x:0,y:-100},{x:0,y:100}],section:sec}]});
let g=c.endGesture(c.runCommand(j,{type:'road.add',road:{id:'tmp',name:'t',points:[{x:900,y:900},{x:950,y:900}],section:sec}}).editor);
g=c.runCommand(g,{type:'road.setProfile',roadId:'A',profile:[{station:0,z:2},{station:200,z:2}]}).editor;
assert.ok(rp.compileRoadFirstProject(g.project).issues.some(i=>/ระดับถนนต่างกัน/.test(i)),'junction level mismatch reported');
// 5. Old files: no profile, level 0, no crossings.
const old=rp.normalizeRoadFirstProject(JSON.parse(JSON.stringify(j.project)));assert.equal(rp.compileRoadFirstProject(old).crossings.length,0);
assert.ok(rp.compileRoadFirstProject(old).project.links.every(l=>!l.levels));
assert.match(rp.validateRoadFirstProject({...e.project,roads:e.project.roads.map(q=>q.id==='R1'?{...q,profile:[{station:-1,z:0}]}:q)}),/แนวดิ่ง/);
assert.equal(n.validateNetworkProject(comp().project),null);
// 6. Report lists the crossing with its relation and gap.
const html=rep.networkDesignReportHtml(rep.buildNetworkDesignReport(comp().project,'สภาพเดิม'));
assert.match(html,/ทางต่างระดับ/);assert.match(html,/ถนนล่าง/);assert.ok(html.includes(`${comp().crossings[0].gap.toFixed(1)} ม.`),'gap in the report');
console.log('PASS 4A elevation: no junction at different levels, flip in one step, undo, deterministic move, unresolved, level mismatch, old files, report');
