const assert=require('node:assert/strict'),path=require('node:path');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const el=T('core/road-first/elevation.cjs'),rp=T('core/road-first/project.cjs'),cmd=T('core/road-first/commands.cjs'),gs=T('core/road-first/grade-separation.cjs');
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
for(const sign of [1,-1]){
 const p=[{station:0,z:0},{station:200,z:sign*8,curveLength:100},{station:400,z:0}];
 assert.equal(el.profileError(p),null);near(el.levelAt(p,200),sign*7);near(el.gradeAt(p,150),sign*.04);near(el.gradeAt(p,250),-sign*.04);
 for(const s of [150,250]){near(el.levelAt(p,s-1e-6),el.levelAt(p,s+1e-6),1e-6);near(el.gradeAt(p,s-1e-6),el.gradeAt(p,s+1e-6),1e-7);}
 assert.match(el.profileError([{station:0,z:0},{station:200,z:8,curveLength:500},{station:400,z:0}]),/โค้งดิ่ง/);
}
assert.match(el.profileError([{station:0,z:0,curveLength:20},{station:100,z:2}]),/โค้งดิ่ง/);
assert.match(el.profileError([{station:0,z:0},{station:100,z:4,curveLength:200},{station:200,z:0}]),/โค้งดิ่ง/,'curve limits cannot coincide with an unsmoothed PVI or constant boundary');
assert.match(el.profileError([{station:0,z:0},{station:100,z:2,curveLength:120},{station:200,z:0,curveLength:100},{station:300,z:0}]),/ซ้อน/);
const section={forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:4,walk:2};
const base={kind:'road-first',schemaVersion:2,title:'vertical',roads:[{id:'A',name:'A',alignment:'arc',points:[{x:-500,y:0},{x:500,y:0}],section},{id:'B',name:'B',alignment:'arc',points:[{x:0,y:-500},{x:0,y:500}],section}],decisions:[],options:{}};
const cid=T('core/road-first/derive.cjs').detectCandidates(base.roads)[0].id;
const authored=structuredClone(base);authored.roads[0].profile=[{station:0,z:0},{station:500,z:0},{station:1000,z:0}];
const original=JSON.stringify(authored),blocked=gs.overCommand(authored,cid,'A');assert.ok(blocked.error);assert.match(blocked.error,/500|จุดระดับ/);assert.equal(JSON.stringify(authored),original);
const malformed=structuredClone(base);malformed.schemaVersion=1;malformed.roads.forEach(r=>delete r.alignment);malformed.roads[0].profile={};assert.match(rp.validateRoadFirstProject(malformed),/แนวดิ่ง/,'malformed legacy profile is reported without throwing');
const proposal=gs.overCommand(base,cid,'A');assert.ok(proposal.cmd,proposal.error);
let state=cmd.createEditor(base),result=cmd.runCommand(state,proposal.cmd);assert.equal(result.result.error,null);state=cmd.endGesture(result.editor);
assert.ok(state.project.roads[0].profile.every(p=>p.generatedBy===cid));
const stable=structuredClone(state.project);stable.decisions[0].profileOwner='stable-owner';stable.roads[0].profile.forEach(p=>p.generatedBy='stable-owner');
const stableSwap=gs.overCommand(stable,cid,'B');assert.equal(stableSwap.cmd.owner,'stable-owner','owner survives candidate renumbering');
const moreCrossings=structuredClone(state.project);moreCrossings.roads[1].points=[{x:-400,y:-500},{x:-300,y:500},{x:0,y:-500},{x:0,y:500}];
moreCrossings.decisions=cmd.rebindDecisions(state.project.roads,moreCrossings.roads,state.project.decisions);
assert.notEqual(moreCrossings.decisions[0].candidateId,cid);assert.equal(moreCrossings.decisions[0].profileOwner,cid,'actual crossing reordering retains the generated owner');
const orphan=structuredClone(state.project);delete orphan.decisions[0].profileOwner;
const independent=gs.overCommand(orphan,cid,'B');assert.ok(independent.cmd);assert.notEqual(independent.cmd.owner,cid,'a new operation cannot reuse another profile owner');
assert.deepEqual(independent.cmd.profiles.A,undefined,'unrelated generated work is not removed');
const flipped=gs.overCommand(state.project,cid,'B');assert.ok(flipped.cmd,flipped.error);const flip=cmd.runCommand(state,flipped.cmd);assert.equal(flip.result.error,null);assert.equal(flip.editor.project.roads[0].profile,undefined);
const applied=cmd.endGesture(flip.editor),undone=cmd.undo(applied).editor;
assert.deepEqual(undone.project,state.project);assert.deepEqual(cmd.redo(undone).editor.project,applied.project);
// Editing a generated point makes it authored; future flips preserve it rather than deleting by extent.
const profile=structuredClone(state.project.roads[0].profile);profile[1].z+=.1;
const edited=cmd.runCommand(state,{type:'road.setProfile',roadId:'A',profile});assert.equal(edited.result.error,null);assert.equal(edited.editor.project.roads[0].profile[1].generatedBy,undefined);
const next=gs.overCommand(edited.editor.project,cid,'B');if(next.cmd){const rr=cmd.runCommand(edited.editor,next.cmd);assert.equal(rr.result.error,null);assert.ok(rr.editor.project.roads[0].profile.some(p=>p.station===profile[1].station&&p.z===profile[1].z));}
const curved=structuredClone(base);curved.schemaVersion=3;curved.roads[0].profile=[{station:0,z:0},{station:500,z:10,curveLength:200},{station:1000,z:0}];
const loaded=rp.normalizeRoadFirstProject(JSON.parse(JSON.stringify(curved)));const compiled=rp.compileRoadFirstProject(loaded),net=T('core/network/network-project.cjs'),geom=T('core/network/network-link-geometry.cjs');
const outside=structuredClone(curved);outside.roads[0].points=[{x:-200,y:0},{x:200,y:0}];assert.match(rp.validateRoadFirstProject(outside),/ปลายถนน/,'curve must also fit within the actual road');
const link=compiled.project.links.find(l=>compiled.sources.links[l.id]==='A');near(geom.linkLevelAt(link,500),el.levelAt(curved.roads[0].profile,500));
const resolved=geom.resolveLinkSectionGeometry(compiled.project,link);for(let i=0;i<resolved.stations.length;i++)near(resolved.z[i],el.levelAt(curved.roads[0].profile,resolved.stations[i]));
const reopened=net.normalizeNetworkProject(JSON.parse(JSON.stringify(compiled.project)));near(geom.linkLevelAt(reopened.links.find(l=>l.id===link.id),500),9);
const withoutCache=structuredClone(compiled.project);delete withoutCache.links[0].levels;
const rebuilt=net.normalizeNetworkProject(withoutCache);assert.ok(rebuilt.links[0].levels.length>10,'drawing samples are rebuilt from the exact profile');
const junction=structuredClone(curved);junction.roads[1].profile=[{station:0,z:9}];
assert.match(cmd.executeCommand(junction,{type:'crossing.decide',candidateId:cid,decision:'junction'}).error,/โค้งดิ่ง.*ปากทางแยก/,'flat junction approaches cannot hide a vertical curve');
const short=structuredClone(base);short.roads[0].points=[{x:-30,y:0},{x:30,y:0}];assert.match(gs.overCommand(short,cid,'A').error,/ระยะ|ช่วง/);
console.log('PASS vertical curves: crest/sag C0/C1, constrained lengths refused, authored PVI protected, generated ownership/edit detachment, flip/undo, exact shared elevations, persistence, short rise refused');
