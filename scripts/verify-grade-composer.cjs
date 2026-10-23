// Flyover / underpass composer: parameters, footprint, measured outcome, refusals, release consent (docs/spec/GRADE_COMPOSER.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const lc=T('core/road-first/level-criteria.cjs'),K=lc.levelCriteria();
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),gs=T('core/road-first/grade-separation.cjs'),el=T('core/road-first/elevation.cjs'),dv=T('core/road-first/derive.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
const near=(a,b,eps=.01)=>Math.abs(a-b)<=eps;
const base=()=>({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[
  {id:'L',name:'ถนนล่าง',points:[{x:-500,y:0},{x:500,y:0}],section:sec},{id:'U',name:'ถนนบน',points:[{x:0,y:-500},{x:0,y:500}],section:sec}]});
const P=base(),cid=dv.detectCandidates(P.roads)[0].id;
const outcome=(p,prop)=>gs.gradeOutcome(p,prop,c.executeCommand,rp.compileRoadFirstProject);
const width=el.sectionWidth(sec);

// 1. Defaults come from the level criteria; the default proposal is the one-click command.
{const d=gs.gradeDefaults(P,cid,'U','over');assert.deepEqual(d,{height:lc.bridgeRise(K),top:width+20,grade:lc.gradeFor(K,{}),curve:0});
 assert.equal(gs.gradeDefaults(P,cid,'L','under').height,lc.tunnelDepth(K));
 assert.deepEqual(gs.gradeProposal(P,cid,'U','over').cmd,gs.overCommand(P,cid,'U').cmd);}

// 2. Parameters shape the rise: height, level length over the road, approach grade; the plan gives the footprint.
{const p=gs.gradeProposal(P,cid,'U','over',{height:8,top:50,grade:.03});assert.ok(p.cmd,p.error);
 const prof=p.cmd.profiles.U,run=8/.03;
 assert.ok(near(el.levelAt(prof,500),8)&&near(el.levelAt(prof,475),8)&&near(el.levelAt(prof,525),8),'level 50 m over the crossing at +8');
 assert.ok(near(p.plan.extent.start,500-25-run)&&near(p.plan.extent.end,500+25+run),'footprint from height / grade');
 assert.ok(near(p.plan.need,25+run));
 const o=outcome(P,p);assert.equal(o.error,undefined);assert.ok(near(o.clearance.min,8-K.deckDepth.value),'measured clearance of the result');
 const g=gs.gradeGhost(P,p.plan);assert.equal(g.approaches.length,2);assert.ok(g.level.every(q=>near(q.x,0)&&q.y>=-25.01&&q.y<=25.01),'ghost: level stretch on the road in plan');}

// 3. Vertical curves are entered, never chosen: owned points carry the length, the road ends get owned level points,
//    grades stay continuous; a curve that runs over the lower road shows up as a lower measured clearance.
{const p=gs.gradeProposal(P,cid,'U','over',{curve:16});assert.ok(p.cmd,p.error);const prof=p.cmd.profiles.U;
 assert.equal(el.profileError(prof),null);assert.ok(prof.filter(q=>q.curveLength===16).length===4,'four grade breaks curved');
 assert.ok(prof.some(q=>q.station===0)&&prof.some(q=>q.station===1000),'owned level points at the road ends');assert.ok(prof.every(q=>q.generatedBy===p.cmd.owner));
 const v=el.resolveVerticalProfile(prof);for(const q of prof.slice(1,-1)){const a=q.station-q.curveLength/2,b=q.station+q.curveLength/2;
   assert.ok(near(v.gradeAt(a-1e-6),v.gradeAt(a+1e-6),1e-4)&&near(v.gradeAt(b-1e-6),v.gradeAt(b+1e-6),1e-4),'C1 at curve ends');}
 assert.ok(!outcome(P,p).issues.some(i=>/ช่องลอด/.test(i)),'short curves stay off the lower road');
 const long=gs.gradeProposal(P,cid,'U','over',{curve:40});assert.ok(long.cmd,long.error);const o=outcome(P,long);
 assert.ok(o.clearance.min<K.clearance.value,`curve over the lower road lowers the clearance (${o.clearance.min})`);
 assert.ok(o.issues.some(i=>/ช่องลอดที่วัดได้/.test(i)),'shown before placing');
 assert.match(gs.gradeProposal(P,cid,'U','over',{curve:400}).error,/โค้งดิ่ง|ช่วงถนนไม่พอ/,'too long a curve refused with a reason');}

// 4. Refusals keep the plan for the red ghost; bad input is refused; nothing changes.
{const short={...base(),roads:base().roads.map(r=>r.id==='U'?{...r,points:[{x:0,y:-120},{x:0,y:120}]}:r)};
 const s=gs.gradeProposal(short,dv.detectCandidates(short.roads)[0].id,'U','over');
 assert.match(s.error,/ช่วงถนนไม่พอ/);assert.ok(s.plan&&s.plan.need>s.plan.length/2,'plan kept: needs more than the road has');assert.equal(s.cmd,undefined);
 assert.ok(gs.gradeGhost(short,s.plan),'red ghost can be drawn');
 assert.match(gs.gradeProposal(P,cid,'U','over',{height:-1}).error,/ค่าที่ใส่ไม่ถูกต้อง/);
 assert.match(gs.gradeProposal(P,cid,'U','over',{grade:NaN}).error,/ค่าที่ใส่ไม่ถูกต้อง/);}

// 5. One step, one undo: relation and every profile come back; swapping to an underpass is coherent.
let e=c.createEditor(base());
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
{const before=JSON.stringify(e.project);run(gs.gradeProposal(e.project,cid,'U','over',{height:7,curve:10}).cmd);
 const after=JSON.stringify(e.project);assert.notEqual(after,before);
 e=c.undo(e).editor;assert.equal(JSON.stringify(e.project),before,'one undo restores relation and profiles');e=c.redo(e).editor;assert.equal(JSON.stringify(e.project),after);
 run(gs.gradeProposal(e.project,cid,'U','under').cmd);
 const x=rp.compileRoadFirstProject(e.project).crossings[0];assert.equal(x.over,'L');assert.equal(x.clearance.structure,'tunnel');
 assert.ok(near(x.clearance.min,K.clearance.value,.02),'underpass after a bridge: the owned rise is gone, tunnel clearance as set');
 assert.ok(e.project.roads.find(r=>r.id==='U').profile.every(q=>q.z<=1e-9),'no leftover rise on the road now under');}

// 6. A road already clear is not changed: only the relation.
{const high={...base(),roads:base().roads.map(r=>r.id==='U'?{...r,profile:[{station:0,z:9},{station:1000,z:9}]}:r)};
 const p=gs.gradeProposal(high,cid,'U','over');assert.equal(p.plan.unchanged,true);assert.equal(p.cmd.profiles.U,undefined);}

// 7. Earlier work of unknown source (untagged rise of the other road): kept by default, released only with consent.
{const legacy={...base(),roads:base().roads.map(r=>r.id==='L'?{...r,profile:[{station:300,z:0},{station:470,z:6.5},{station:530,z:6.5},{station:700,z:0}]}:r)};
 legacy.decisions=[{candidateId:cid,decision:'grade-separated',over:'L'}];
 const keep=gs.gradeProposal(legacy,cid,'U','over');assert.deepEqual(keep.plan.legacy,{roadId:'L',stations:[470,530],released:false});
 assert.ok(near(el.levelAt(keep.cmd.profiles.U,500),6.5+lc.bridgeRise(K)),'without consent the old rise stays (stacked)');
 const rel=gs.gradeProposal(legacy,cid,'U','over',{release:true});assert.equal(rel.plan.legacy.released,true);
 assert.deepEqual(rel.cmd.release,[{roadId:'L',station:470},{roadId:'L',station:530}]);
 e=c.createEditor(legacy);const before=JSON.stringify(e.project);run(rel.cmd);
 assert.ok(near(el.levelAt(e.project.roads.find(r=>r.id==='L').profile,500),0),'released: the old rise is removed');
 assert.ok(near(el.levelAt(e.project.roads.find(r=>r.id==='U').profile,500),lc.bridgeRise(K)));
 e=c.undo(e).editor;assert.equal(JSON.stringify(e.project),before,'one undo brings the old points back');
 // The command boundary still protects points nobody released.
 const forged={...rel.cmd,release:undefined};const x=c.executeCommand(legacy,forged);assert.match(x.error,/ต้องเก็บจุดระดับเดิม/);}
console.log('PASS grade composer: criteria defaults, height / level length / grade / entered vertical curves, footprint + ghost, measured outcome before placing, refusals keep the plan, one undo, bridge → underpass, already clear unchanged, release only with consent');
