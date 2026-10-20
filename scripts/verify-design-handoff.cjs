// Phase 3 slice 6 (staged) — advanced junction editing from /design: hand one junction to the junction editor,
// bring its edits back as one undoable command, leave everything else (and the earlier Network data) alone.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),h=T('core/road-first/junction-handoff.cjs'),rp=T('core/road-first/project.cjs');
const ns=T('core/network/network-scenarios.cjs'),np=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
let ed=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{approachLength:40},roads:[]});
const step=cmd=>{const x=c.runCommand(ed,cmd);assert.equal(x.result.error,null,x.result.error);ed=x.editor;return x.result;};
step({type:'road.add',road:{id:'R1',name:'ถนน 1',points:[{x:-200,y:0},{x:200,y:0}],section:sec}});
step({type:'road.add',road:{id:'R2',name:'ถนน 2',points:[{x:0,y:-200},{x:0,y:200}],section:sec}});
const cid=ed.project.decisions[0].candidateId;

const ho=h.createHandoff(ed.project,'existing',cid);assert.ok(ho);assert.equal(ho.junctionId,'J-1');
const stored=h.readHandoff(JSON.stringify(ho));assert.deepEqual([stored.candidateId,stored.junctionId,stored.snapshot],[ho.candidateId,ho.junctionId,ho.snapshot],'hand-off survives storage');
assert.equal(h.readHandoff('{"kind":"other"}'),null);assert.equal(h.readHandoff('not json'),null);

// Nothing edited → nothing to apply.
assert.equal(h.handoffCommand(stored,ed.project).cmd,null);

// The junction editor turns off the signal and the crossing on one arm and sets the corner radius (what /design does not offer in place).
const ctx=ns.junctionEditContext(JSON.stringify(stored.network),stored.junctionId),design=structuredClone(ctx.junction.design);
design.arms[0].signal=false;design.arms[0].crossing=false;design.corner=14;
stored.network=ns.replaceActiveNetworkProject(ctx.workspace,np.updateJunctionDesign(ctx.project,stored.junctionId,design));
const back=h.handoffCommand(h.readHandoff(JSON.stringify(stored)),ed.project);
assert.equal(back.cmd.type,'junction.setTreatments');
const r=step(back.cmd);assert.equal(r.label,'แก้ทางแยกขั้นสูง แยก ถนน 1 × ถนน 2');
const j=rp.compileRoadFirstProject(ed.project).project.junctions[0];
assert.equal(j.design.corner,14);assert.equal(j.design.arms[0].signal,false);assert.equal(j.design.arms[0].crossing,false);
assert.equal(j.design.arms[1].signal,ctx.junction.design.arms[1].signal,'other arms unchanged');
// One undo step restores the junction.
ed=c.undo(ed).editor;assert.equal(rp.compileRoadFirstProject(ed.project).project.junctions[0].design.corner,10);

// Roads edited meanwhile: still applied, with a note to check the junction.
ed=c.redo(ed).editor;ed=c.undo(ed).editor;
step({type:'road.setSection',roadId:'R1',patch:{walk:2.5}});
const stale=h.handoffCommand(h.readHandoff(JSON.stringify(stored)),ed.project);
assert.ok(stale.cmd);assert.ok(stale.issues.some(s=>s.includes('ถนนถูกแก้หลังส่งทางแยกไปแก้')));
// Junction removed meanwhile: nothing applied.
step({type:'crossing.decide',candidateId:cid,decision:'grade-separated'});
assert.equal(h.handoffCommand(h.readHandoff(JSON.stringify(stored)),ed.project).cmd,null);
console.log('PASS advanced junction hand-off: storage round trip, edits back as one undoable command, unchanged/stale/removed cases');
