// Project access (driveway) as a road role (UX closure before Phase 4A, review 2026-10-21).
// An access road reaching a road makes an access junction: the through road keeps flowing (no stop line, crossing or
// signal on its legs), the access leg keeps its stop/give-way line and has no crossing. These are concept defaults the
// engineer can override per leg; they are not standards.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),ids=T('core/road-first/ids.cjs'),pr=T('core/road-first/presets.cjs'),cmp=T('core/road-first/compare.cjs');
const main={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
const empty={kind:'road-first',schemaVersion:1,title:'t',roads:[],decisions:[],options:{}};
let ed=c.createEditor(empty);
const step=cmd=>{const x=c.runCommand(ed,cmd);assert.equal(x.result.error,null,JSON.stringify(cmd.type)+' → '+x.result.error);ed=c.endGesture(x.editor);return x.result;};
step({type:'road.add',road:{id:'R1',name:'ถนนหลัก',points:[{x:-200,y:0},{x:200,y:0}],section:main}});
const access=pr.presetSection('access');
assert.equal(access.median,0);assert.equal(access.forwardLanes+access.backwardLanes,2);
assert.equal(ids.nextRoadName(ed.project.roads,'access'),'ทางเข้า 1');
const r=step({type:'road.add',road:{id:'A1',name:'ทางเข้า 1',role:'access',points:[{x:0,y:80},{x:0,y:0}],section:access}});
assert.equal(r.autoJunctions.length,1,'access junction created automatically');
const d=ed.project.decisions[0];assert.equal(d.name,'ทางเข้า 1','junction named after the access');
const comp=()=>rp.compileRoadFirstProject(ed.project),arms=()=>{const j=comp().project.junctions[0];return comp().legs.filter(l=>l.junctionId===j.id).map(l=>({road:l.roadId,arm:j.design.arms[l.armId]}));};
for(const {road,arm} of arms()){
  if(road==='R1')assert.deepEqual([arm.stop,arm.crossing,arm.signal],[false,false,false],'through road keeps flowing');
  else assert.deepEqual([arm.stop,arm.crossing,arm.signal],[true,false,false],'access leg: give-way line, no crossing');
}
assert.equal(comp().issues.length,0,comp().issues.join(' | '));
// A leg treatment can still override the default (engineer's choice).
step({type:'leg.setTreatment',candidateId:d.candidateId,leg:'R1:ahead',patch:{crossing:true}});
assert.equal(arms().find(a=>a.road==='R1'&&a.arm.crossing).arm.crossing,true,'override kept');
// Role toggled off: an ordinary junction again (defaults of an ordinary junction come back).
const off=step({type:'road.setRole',roadId:'A1',role:null});assert.match(off.label,/ทางเข้า 1/);
assert.ok(arms().filter(a=>a.road==='A1').every(a=>a.arm.crossing),'ordinary junction leg has a crossing again');
step({type:'road.setRole',roadId:'A1',role:'access'});
// Validation and storage.
const stored=rp.normalizeRoadFirstProject(JSON.parse(JSON.stringify(ed.project)));
assert.equal(stored.roads.find(x=>x.id==='A1').role,'access','role kept in the file');
assert.match(rp.validateRoadFirstProject({...ed.project,roads:ed.project.roads.map(x=>x.id==='A1'?{...x,role:'bridge'}:x)}),/ชนิดถนน/);
// Old files (no role) still open and compile the same.
const old=JSON.parse(JSON.stringify(empty));old.roads=[{id:'R1',name:'a',points:[{x:0,y:0},{x:100,y:0}],section:main}];
assert.equal(rp.validateRoadFirstProject(rp.normalizeRoadFirstProject(old)),null);
// Comparison names the role change.
const before=structuredClone(ed.project);step({type:'road.setRole',roadId:'A1',role:null});
assert.ok(cmp.compareScenarios(before,ed.project).deltas.find(x=>x.target.id==='A1').changes.includes('ชนิดถนน'));
console.log('PASS project access: access road role, access junction defaults (overridable), toggle, file round trip, old files, comparison');
