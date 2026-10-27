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
// 8. Source-authorized junction → bridge → junction is reversible without deleting authored
// per-leg junction data. Neither the roads nor their non-generated profile points change.
{
 const original=base(),id=dv.detectCandidates(original.roads)[0].id;
 original.decisions=[{
   candidateId:id,decision:'junction',name:'แยกเดิม',roads:['L','U'],at:{x:0,y:0},
   treatments:{corner:12,cornerRadii:{'L:ahead':10},
     legs:{'L:ahead':{stop:true,signal:true,crossing:true}},
     approaches:{'U:behind':{length:35}},
     slips:[],
     connectors:[{from:{leg:'U:ahead',role:'main',laneIndex:0},movement:'through',mode:'suppress'}]}
 }];
 // Author a *geometrically valid* Slip using the same candidate/radius checks as the UI,
 // instead of guessing a curve and making the fixture invalid before testing the restore.
 const ae=T('core/road-first/approach-edit.cjs'),info=ae.approachInfo(rp.compileRoadFirstProject(original),id,'L:behind');
 assert.ok(info&&info.slipTo,'Slip has an adjacent receiving approach');
 const slip=ae.newSlip(info,option=>!c.executeCommand(original,{type:'slip.set',candidateId:id,slip:option}).error);
 assert.ok(slip,'the Slip candidate was generated');
 const withSlip=c.executeCommand(original,{type:'slip.set',candidateId:id,slip});
 assert.equal(withSlip.error,null,withSlip.error);
 original.decisions=withSlip.project.decisions;
 const baseJson=JSON.stringify(original),bridge=gs.gradeProposal(original,id,'U','over');
 assert.ok(bridge.cmd,bridge.error);
 let ed=c.createEditor(original);
 const raised=c.runCommand(ed,bridge.cmd);assert.equal(raised.result.error,null,raised.result.error);ed=c.endGesture(raised.editor);
 assert.deepEqual(ed.project.decisions[0].treatments,original.decisions[0].treatments,'every authored treatment remains dormant, never deleted');
 assert.equal(ed.project.decisions[0].name,'แยกเดิม','authored junction name remains');
 assert.equal(rp.compileRoadFirstProject(ed.project).project.junctions.length,0,'active junction removed while bridge is present');
 const beforeRestore=structuredClone(ed.project);
 const restore=c.runCommand(ed,{type:'crossing.decide',candidateId:id,decision:'junction'});
 assert.equal(restore.result.error,null,restore.result.error);ed=c.endGesture(restore.editor);
 assert.deepEqual(ed.project.roads,original.roads,'exact original road coordinates, sections and profiles restored');
 assert.deepEqual(ed.project.decisions,original.decisions,'original junction decision and all treatments restored exactly');
 assert.equal(rp.compileRoadFirstProject(ed.project).project.junctions.length,1,'junction geometry compiled again');
 assert.equal(rp.compileRoadFirstProject(ed.project).crossings.length,0,'no dangling bridge surface');
 assert.equal(rp.validateRoadFirstProject(ed.project),null);
 assert.equal(JSON.stringify(rp.normalizeRoadFirstProject(JSON.parse(JSON.stringify(ed.project)))),baseJson,'Save/Open roundtrip identical');
 ed=c.undo(ed).editor;assert.deepEqual(ed.project,beforeRestore,'one undo restores the complete bridge with unchanged dormant details');
 ed=c.redo(ed).editor;assert.deepEqual(ed.project,original,'one redo restores full original junction');
 const dip=gs.gradeProposal(ed.project,id,'U','under');
 assert.ok(dip.cmd,dip.error);
 let tunnel=c.executeCommand(ed.project,dip.cmd);assert.equal(tunnel.error,null,tunnel.error);
 assert.ok(rp.compileRoadFirstProject(tunnel.project).project.crossings.some(x=>x.tunnel),'underpass exists');
 let returned=c.executeCommand(tunnel.project,{type:'crossing.decide',candidateId:id,decision:'junction'});
 assert.equal(returned.error,null,returned.error);
 assert.deepEqual(returned.project.roads,original.roads,'underpass restores original road elevations');
 assert.deepEqual(returned.project.decisions,original.decisions,'underpass restores every authored junction treatment');
 const alternate=gs.gradeProposal(tunnel.project,id,'U','over');
 assert.ok(alternate.cmd,alternate.error); // switching a generated underpass to a bridge
 const flip=c.executeCommand(tunnel.project,alternate.cmd);assert.equal(flip.error,null,flip.error);
 const fromFlip=c.executeCommand(flip.project,{type:'crossing.decide',candidateId:id,decision:'junction'});
 assert.equal(fromFlip.error,null,fromFlip.error);
 assert.deepEqual(fromFlip.project.roads,original.roads,'bridge after underpass returns original road profile');
 assert.deepEqual(fromFlip.project.decisions,original.decisions);
 const ignored=c.executeCommand(raised.editor.project,{type:'crossing.decide',candidateId:id,decision:'ignore'});
 assert.match(ignored.error,/คืนเป็นทางแยก|แนวดิ่งสะพาน/,'cannot forget the owner of an active bridge');
 assert.deepEqual(ignored.project,raised.editor.project,'refused ignore is atomic');
 const damaged=structuredClone(beforeRestore);
 damaged.roads.find(r=>r.id==='L').profile=[{station:0,z:2},{station:1000,z:2}];
 const fail=c.executeCommand(damaged,{type:'crossing.decide',candidateId:id,decision:'junction'});
 assert.match(fail.error,/ระดับถนนยังต่างกัน/,'separately authored conflicting levels block restoration');
 assert.deepEqual(fail.project,damaged,'failed restore changes no authored data');
 // Legacy saves with no stored treatments must not get made-up details.
 const legacy=base(),legacyCid=dv.detectCandidates(legacy.roads)[0].id;
 legacy.decisions=[{candidateId:legacyCid,decision:'grade-separated',roads:['L','U'],at:{x:0,y:0}}];
 const back=c.executeCommand(legacy,{type:'crossing.decide',candidateId:legacyCid,decision:'junction'});
 assert.equal(back.error,null,back.error);
 assert.equal(back.project.decisions[0].treatments,undefined,'no invented old treatments');
}
// 9. Automatic grade separation caused by a user profile edit also preserves dormant details.
{
 const source=base(),id=dv.detectCandidates(source.roads)[0].id;
 source.decisions=[{candidateId:id,decision:'junction',name:'ชื่อเดิม',roads:['L','U'],
   treatments:{corner:14,legs:{'L:ahead':{stop:false,signal:false}}}}];
 const elevated=c.executeCommand(source,{type:'road.setProfile',roadId:'U',profile:[{station:0,z:8},{station:1000,z:8}]});
 assert.equal(elevated.error,null,elevated.error);
 assert.equal(elevated.project.decisions[0].decision,'grade-separated');
 assert.deepEqual(elevated.project.decisions[0].treatments,source.decisions[0].treatments);
 assert.equal(elevated.project.decisions[0].name,'ชื่อเดิม');
 const restore=c.executeCommand(elevated.project,{type:'crossing.decide',candidateId:id,decision:'junction'});
 assert.match(restore.error,/ระดับถนนยังต่างกัน/,'a user-edited independent profile is not silently flattened');
 assert.deepEqual(restore.project,elevated.project);
}

// 10. A local restore must not silently collapse a second grade-separated crossing
// which is supported by this same bridge profile. One undo is not the only safety mechanism.
{
 const p=base();p.roads.push({id:'N',name:'ถนนข้างเคียง',points:[{x:-400,y:10},{x:400,y:10}],section:sec});
 const candidates=dv.detectCandidates(p.roads);
 const own=candidates.find(x=>x.roads.some(r=>r.roadId==='L')&&x.roads.some(r=>r.roadId==='U'));
 const nearby=candidates.find(x=>x.roads.some(r=>r.roadId==='N')&&x.roads.some(r=>r.roadId==='U'));
 assert.ok(own&&nearby,'two crossing candidates use the same vertical road');
 p.decisions=[{candidateId:own.id,decision:'junction',roads:['L','U']},
   {candidateId:nearby.id,decision:'grade-separated',roads:['N','U'],over:'U'}];
 const up=gs.gradeProposal(p,own.id,'U','over');assert.ok(up.cmd,up.error);
 const raised=c.executeCommand(p,up.cmd);assert.equal(raised.error,null,raised.error);
 const x=rp.compileRoadFirstProject(raised.project).crossings.find(v=>v.candidateId===nearby.id);
 assert.equal(x.relation,'over','nearby crossing currently relies on the upper road');
 const restore=c.executeCommand(raised.project,{type:'crossing.decide',candidateId:own.id,decision:'junction'});
 assert.match(restore.error,/ทางต่างระดับใกล้เคียง/,'cannot silently remove nearby bridge');
 assert.deepEqual(restore.project,raised.project,'dependency refusal is atomic');
}

console.log('PASS grade composer: criteria defaults, height / level length / grade / entered vertical curves, footprint + ghost, measured outcome before placing, refusals keep the plan, one undo, bridge → underpass, already clear unchanged, release only with consent');
