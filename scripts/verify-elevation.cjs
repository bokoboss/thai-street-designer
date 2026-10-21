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
// 3D reads the same levels: R2's surfaces sit at 7 m, deck sides and lane lines are raised.
const sg=T('core/network/network-scene-geometry.cjs');
{const surf=sg.resolveRoadLinkSceneSurfaces(comp().project).filter(v=>v.id.startsWith(r2link.id+':'));assert.ok(surf.length&&surf.every(v=>v.base&&v.base.every(z=>z===7)),'R2 surfaces at 7 m');
 const el3=sg.resolveElevatedLinkScene(comp().project);assert.ok(el3.faces.length>0&&el3.lines.every(l=>l.points.every(p=>p.z>7)),'deck sides and raised lines');}
// 2. Flip: R1 rises over R2 in one step; plan draw order and levels follow.
const gs=T('core/road-first/grade-separation.cjs'),flip=gs.overCommand(e.project,dec.candidateId,'R1');assert.ok(flip.cmd,flip.error);
const fr=run(flip.cmd);assert.match(fr.label,/ถนนล่าง ข้าม ถนนบน/);
x=comp().crossings[0];assert.equal(x.over,'R1');
{const r1=comp().project.links.filter(l=>comp().sources.links[l.id]==='R1');const peak=Math.max(...sg.resolveRoadLinkSceneSurfaces(comp().project).filter(v=>r1.some(l=>v.id.startsWith(l.id+':'))).flatMap(v=>v.base??[0]));assert.ok(Math.abs(peak-13)<.01,'flip: R1 raised to 13 m in 3D');}assert.ok(Math.abs(x.gap-el.RISE_DEFAULTS.height)<.01,'generated rise: default height above the lower road');
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
// 7. Structures (owner 2026-10-21): on a bridge the road keeps its widths but walkways turn to concrete, the median to a barrier,
//    trees and lights stay off the structure, and parapets stand at the outer edges.
{run({type:'road.setRoadside',roadId:'R1',roadside:{trees:true,lights:true}});
 const P=comp().project,r1=P.links.filter(l=>comp().sources.links[l.id]==='R1'),gs1=r1.map(l=>lg.resolveLinkSectionGeometry(P,l));
 const runs=gs1.flatMap(q=>q.structures);assert.ok(runs.some(q=>q.kind==='bridge'),'bridge stretch on R1');
 for(const q of gs1)for(const o of q.objects)assert.ok(!q.structures.some(st=>o.station>st.start&&o.station<st.end),'no trees or lights on the bridge');
 assert.ok(gs1.some(q=>q.objects.length>0),'trees and lights stay on the at-grade ends');
 const kinds=new Set(sg.resolveRoadLinkSceneSurfaces(P).filter(v=>r1.some(l=>v.id.startsWith(l.id+':'))).map(v=>v.kind));
 assert.ok(kinds.has('structure-walk')&&kinds.has('barrier'),'bridge finish: service walk and barrier');assert.ok(kinds.has('sidewalk'),'ground pieces keep the sidewalk');
 const sc=sg.resolveElevatedLinkScene(P);assert.ok(sc.faces.some(f=>f.layer==='top'&&/parapet/.test(f.id)),'parapets');assert.ok(!sc.faces.some(f=>f.layer==='below'),'no walls or portals on a bridge');
 // Sliced pieces cover the link exactly once.
 for(const q of gs1){const ps=lg.linkPieces(q);assert.ok(Math.abs(ps[0].start)<1e-6&&Math.abs(ps.at(-1).end-q.total)<1e-6);for(let i=1;i<ps.length;i++)assert.ok(Math.abs(ps[i].start-ps[i-1].end)<1e-6);}}
// 8. Underpass: the lower road dips 6.5 m (tool value) into an open trough on the ramps and a tunnel under the crossing road.
{let u=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ถนนลอด',points:[{x:-400,y:0},{x:400,y:0}],section:sec},{id:'B',name:'ถนนข้าม',points:[{x:0,y:-300},{x:0,y:300}],section:sec}]});
 u=c.endGesture(c.runCommand(u,{type:'road.add',road:{id:'tmp',name:'t',points:[{x:900,y:900},{x:950,y:900}],section:sec}}).editor);
 const cand=u.project.decisions[0].candidateId;u=c.endGesture(c.runCommand(u,{type:'crossing.decide',candidateId:cand,decision:'grade-separated'}).editor);
 const uc=gs.underCommand(u.project,cand,'A');assert.ok(uc.cmd,uc.error);const ur=c.runCommand(u,uc.cmd);assert.equal(ur.result.error,null);assert.match(ur.result.label,/ถนนลอด ลอดใต้ ถนนข้าม/);u=c.endGesture(ur.editor);
 const C=rp.compileRoadFirstProject(u.project);assert.equal(C.crossings[0].over,'B');assert.ok(Math.abs(C.crossings[0].gap-el.DIP_DEFAULTS.depth)<.01,'dip depth');
 assert.equal(C.project.junctions.length,0);const t=C.project.crossings[0].tunnel;assert.ok(t&&Math.abs(t.z+el.DIP_DEFAULTS.depth)<.01,'tunnel under the crossing road');
 const al=C.project.links.filter(l=>C.sources.links[l.id]==='A'),ag=al.map(l=>lg.resolveLinkSectionGeometry(C.project,l));
 assert.ok(ag.some(q=>q.structures.some(st=>st.kind==='trough')),'trough stretch');assert.ok(Math.min(...ag.flatMap(q=>q.z))<-6,'road below ground');
 const sc=sg.resolveElevatedLinkScene(C.project);assert.ok(sc.faces.filter(f=>/:wall:/.test(f.id)).length>0,'retaining walls');assert.equal(sc.faces.filter(f=>/:portal:/.test(f.id)).length,2,'two portals');
 assert.ok(sc.faces.filter(f=>/:wall:/.test(f.id)).every(f=>f.points.every(p=>p.z<=.25+1e-9)),'walls stop at ground');
 assert.ok(!sc.faces.some(f=>/:deck:|:parapet:/.test(f.id)),'no deck on a trough');
 assert.equal(n.validateNetworkProject(C.project),null);
 // One undo returns both roads to grade.
 u=c.undo(u).editor;assert.equal(u.project.roads.find(q=>q.id==='A').profile,undefined);}
console.log('PASS 4A elevation: structures (bridge finish, trough walls, tunnel portals), no junction at different levels, flip in one step, undo, deterministic move, unresolved, level mismatch, old files, report');
