// Phase 3 slice 5 — scenarios on the road-first workspace: duplicate as an alternative, rename/remove,
// storage and file round trip (a single saved project still opens), migration of every Network-page
// scenario, and the comparison that highlights what differs.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const sc=T('core/road-first/scenarios.cjs'),cmp=T('core/road-first/compare.cjs'),c=T('core/road-first/commands.cjs'),ae=T('core/road-first/approach-edit.cjs'),rp=T('core/road-first/project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
let ed=c.createEditor({kind:'road-first',schemaVersion:1,title:'โครงการ',decisions:[],options:{approachLength:40},roads:[]});
const step=cmd=>{const x=c.runCommand(ed,cmd);assert.equal(x.result.error,null,x.result.error);ed=x.editor;};
step({type:'road.add',road:{id:'R1',name:'ถนนหลัก',points:[{x:-200,y:0},{x:200,y:0}],section:sec}});
step({type:'road.add',road:{id:'R2',name:'ถนนรอง',points:[{x:0,y:-200},{x:0,y:200}],section:sec}});
const existing=ed.project;

// Workspace with Existing; duplicate gives "ทางเลือก A" copied from the active scenario and makes it active.
let w=sc.createWorkspace(existing);assert.equal(sc.activeScenario(w).name,'สภาพเดิม');
let r=sc.duplicateScenario(w);assert.equal(r.error,null);w=r.workspace;
assert.equal(sc.activeScenario(w).name,'ทางเลือก A');assert.equal(sc.referenceScenario(w).id,'existing');
assert.equal(sc.duplicateScenario(w).workspace.scenarios.at(-1).name,'ทางเลือก B');
assert.equal(sc.renameScenario(w,'alt-1','สภาพเดิม').error,'ชื่อทางเลือกซ้ำกับรายการอื่น');
w=sc.renameScenario(w,'alt-1','ทางเลือก A เพิ่มเลนเลี้ยว').workspace;
assert.equal(sc.removeScenario(w,'existing').error,'สภาพเดิมเป็นฐานของทุกทางเลือก ลบไม่ได้');

// No difference right after duplicating.
assert.equal(cmp.compareScenarios(existing,sc.activeScenario(w).project).deltas.length,0);

// Alternative: right-turn pocket on one approach, corner radius, and a new road.
ed=c.createEditor(sc.activeScenario(w).project);
const cid=ed.project.decisions[0].candidateId,info=ae.approachInfo(rp.compileRoadFirstProject(ed.project),cid,'R1:behind');
step({type:'leg.setTreatment',candidateId:cid,leg:'R1:behind',patch:ae.pocketTreatment(info.arm,'right',{})});
step({type:'junction.setCorner',candidateId:cid,corner:15});
step({type:'road.add',road:{id:'R3',name:'ถนนใหม่',points:[{x:-150,y:300},{x:150,y:300}],section:sec}});
w=sc.replaceScenarioProject(w,'alt-1',ed.project);
assert.deepEqual(sc.existingScenario(w).project,existing,'Existing untouched');
const diff=cmp.compareScenarios(sc.referenceScenario(w).project,sc.activeScenario(w).project);
assert.deepEqual(diff.counts,{added:1,removed:0,changed:1});
const j=diff.deltas.find(d=>d.target.kind==='junction');assert.deepEqual(j.changes,['เลนเลี้ยว','รัศมีมุม']);assert.ok(j.bounds.w>0);
assert.equal(diff.deltas.find(d=>d.status==='added').target.id,'R3','new road highlighted, other roads not');
const m=Object.fromEntries(diff.metrics.map(x=>[x.key,x]));assert.equal(m.turnLanes.delta,1);assert.equal(m.roads.delta,1);assert.equal(m.length.delta,300);
// Reverse direction reports the road as removed.
assert.equal(cmp.compareScenarios(sc.activeScenario(w).project,existing).counts.removed,1);

// Storage / file round trip; a single saved project opens as a workspace with Existing only.
const back=sc.normalizeWorkspace(JSON.parse(JSON.stringify(w)));assert.deepEqual(back,w);
const single=sc.normalizeWorkspace(JSON.parse(JSON.stringify(existing)));assert.equal(single.scenarios.length,1);assert.equal(single.scenarios[0].name,'สภาพเดิม');
assert.throws(()=>sc.normalizeWorkspace({...w,workspaceVersion:2}),/รุ่นที่ใหม่กว่า/);

// Removing an alternative switches back to its source.
const removed=sc.removeScenario(w,'alt-1');assert.equal(removed.workspace.activeScenarioId,'existing');assert.equal(removed.workspace.scenarios.length,1);

// Every Network-page scenario is migrated, not only the active one.
const ns=T('core/network/network-scenarios.cjs'),np=T('core/network/network-project.cjs');
let nw=ns.createNetworkScenarioWorkspace(np.createNetworkProject());nw=ns.duplicateNetworkScenario(nw).workspace;
const mig=sc.migrateNetworkWorkspace(nw);
assert.deepEqual(mig.workspace.scenarios.map(s=>[s.name,s.kind]),[['สภาพเดิม','existing'],['Alt A','alternative']]);
assert.equal(mig.workspace.activeScenarioId,nw.activeScenarioId);
console.log('PASS scenarios: duplicate/rename/remove, comparison by road and crossing identity with metrics, storage + single-project files, migration of every earlier scenario');

// Work left in the earlier Network page is added as extra alternatives, never replacing anything.
{
  let base=sc.createWorkspace(existing);base=sc.duplicateScenario(base).workspace;
  const add=sc.appendScenarios(base,mig.workspace,'(หน้าเดิม)');
  assert.equal(add.error,null);
  assert.deepEqual(add.workspace.scenarios.map(s=>s.name),['สภาพเดิม','ทางเลือก A','สภาพเดิม (หน้าเดิม)','Alt A (หน้าเดิม)']);
  assert.ok(add.workspace.scenarios.slice(2).every(s=>s.kind==='alternative'&&s.sourceScenarioId==='existing'));
  assert.equal(add.workspace.activeScenarioId,add.workspace.scenarios[2].id);
  let full=base;for(let i=0;i<5;i++)full=sc.duplicateScenario(full).workspace;
  const partial=sc.appendScenarios(full,mig.workspace,'(หน้าเดิม)');assert.equal(partial.workspace.scenarios.length,8);assert.match(partial.note,/ไม่ได้นำเข้า 1 รายการ/);
  full=sc.duplicateScenario(full).workspace;assert.match(sc.appendScenarios(full,mig.workspace,'x').error,/ครบ 8 รายการ/);
  console.log('PASS earlier Network work imports as extra alternatives within the limit');
}
