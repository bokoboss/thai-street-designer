// Section on a structure: a road's own section over its bridge decks and in its tunnels, with transitions to the
// section at grade (docs/spec/STRUCTURE_SECTIONS.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),gs=T('core/road-first/grade-separation.cjs'),dv=T('core/road-first/derive.cjs');
const ss=T('core/road-first/structure-sections.cjs'),lg=T('core/network/network-link-geometry.cjs'),n=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2,bands:[{id:'b1',type:'shoulder',width:1.5}]};
const near=(a,b,eps=.02)=>Math.abs(a-b)<=eps;
let e;
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const comp=()=>rp.compileRoadFirstProject(e.project);
const R=id=>e.project.roads.find(r=>r.id===id);
const linkOf=(C,roadId)=>{const r=C.linkRanges.find(x=>x.roadId===roadId);return C.project.links.find(l=>l.id===r.id);};
const fresh=()=>{e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[
  {id:'L',name:'ถนนล่าง',points:[{x:-400,y:0},{x:400,y:0}],section:sec},{id:'U',name:'ถนนบน',points:[{x:0,y:-400},{x:0,y:400}],section:sec}]});
  const cand=dv.detectCandidates(e.project.roads)[0];run(gs.overCommand(e.project,cand.id,'U').cmd);};
const BR={forwardLanes:2,backwardLanes:2,walk:.75,bands:[{type:'shoulder',width:.5}],transition:30};

// 1. Old files and roads without a structure section are unchanged.
fresh();{const C=comp();assert.equal(linkOf(C,'U').components.length,0);assert.equal(ss.structureSpans(C,'U').length,1,'one deck on U');}

// 2. A bridge section on the upper road: narrower footway and shoulder over the deck, transitions outside it.
{const before=JSON.stringify(e.project),deckBefore=comp().project.crossings[0].deck;
 run({type:'road.setStructureSection',roadId:'U',section:BR});
 const C=comp(),l=linkOf(C,'U'),[sa,sb]=ss.structureSpans(C,'U')[0];
 assert.equal(l.sectionProfile.mode,'linear');assert.equal(n.validateNetworkProject(C.project),null);
 assert.deepEqual(l.components.map(x=>x.id).sort(),['st-structure-1-shoulder-b','st-structure-1-shoulder-f','st-structure-1-walk-b','st-structure-1-walk-f']);
 const w=l.components.find(x=>x.id==='st-structure-1-walk-f');
 assert.ok(near(w.start,sa-30)&&near(w.end,sb+30)&&w.taperIn===30&&w.taperOut===30,'transitions outside the deck');
 const g=lg.resolveLinkSectionGeometry(C.project,l),i=k=>g.stations.findIndex(v=>v>=k-1e-6),mid=(sa+sb)/2;
 assert.ok(near(Math.abs(g.forwardWalk.outer[i(mid)]-g.forwardWalk.inner[i(mid)]),.75)&&near(Math.abs(g.forwardWalk.outer[i(50)]-g.forwardWalk.inner[i(50)]),2),'footway 2 → 0.75 on the deck');
 // The plan deck is as wide as the section on it.
 const half=C.project.crossings[0].deck.half;assert.ok(near(half,deckBefore.half-1.25-1),`deck half ${deckBefore.half} → ${half}`);
 assert.equal(JSON.stringify(comp()),JSON.stringify(comp()));assert.equal(rp.validateRoadFirstProject(JSON.parse(JSON.stringify(e.project))),null,'save / reopen');
 e=c.undo(e).editor;assert.equal(JSON.stringify(e.project),before,'one undo');e=c.redo(e).editor;}

// 3. One more lane each way on the structure (e.g. a climbing lane on the bridge) and the lower road untouched.
{run({type:'road.setStructureSection',roadId:'U',section:{...BR,forwardLanes:3}});const C=comp();
 assert.ok(linkOf(C,'U').components.some(x=>x.id==='st-structure-1-f1'));assert.equal(linkOf(C,'L').components.length,0,'lower road keeps its section');
  const baseClearance=gs && comp().crossings[0].clearance;
  assert.ok(baseClearance?.spanUnder, 'effective bridge section has a measured lower-road overlap');}

// 4. Tunnel: the section applies in the tunnel of a lower road below ground.
{e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[
  {id:'L',name:'ถนนล่าง',points:[{x:-400,y:0},{x:400,y:0}],section:sec},{id:'U',name:'ถนนบน',points:[{x:0,y:-400},{x:0,y:400}],section:sec}]});
 const cand=dv.detectCandidates(e.project.roads)[0];run(gs.underCommand(e.project,cand.id,'L').cmd);
 run({type:'road.setStructureSection',roadId:'L',section:{...BR,walk:0}});const C=comp();
 assert.equal(ss.structureSpans(C,'L').length,1,'one tunnel on L');assert.ok(linkOf(C,'L').components.some(x=>x.id==='st-structure-1-walk-f'));
 assert.equal(ss.structureSpans(C,'U').length,0,'the road over a tunnel at grade has no structure');}

// 5. No structure: kept and listed; refusals with the reason.
{fresh();run({type:'road.setStructureSection',roadId:'L',section:BR});assert.ok(comp().issues.some(i=>/ถนนล่าง: หน้าตัดบนโครงสร้างตั้งไว้แต่ถนนนี้ไม่มีสะพานหรืออุโมงค์/.test(i)));
 const f=(x,re)=>assert.match(c.executeCommand(e.project,{type:'road.setStructureSection',roadId:'U',section:x}).error,re);
 f({...BR,forwardLanes:1},/น้อยกว่าถนน/);f({...BR,walk:9},/ไม่เกิน 5 ม\./);f({...BR,transition:-1},/หน้าตัดบนโครงสร้าง/);f({...BR,bands:[{type:'bike',width:1}]},/ไม่มีแถบ bike/);
 run({type:'road.setStructureSection',roadId:'L',section:null});assert.equal(R('L').structureSection,undefined,'removed');}

// 6. Carried through reverse (lanes swap with the direction) and split (both pieces keep it).
{run({type:'road.setStructureSection',roadId:'U',section:{...BR,forwardLanes:3}});run({type:'road.reverse',roadId:'U'});
 assert.deepEqual([R('U').structureSection.forwardLanes,R('U').structureSection.backwardLanes],[2,3]);run({type:'road.reverse',roadId:'U'});
 run({type:'road.split',roadId:'U',at:{x:0,y:-300},newId:'U2'});assert.deepEqual(R('U2').structureSection,R('U').structureSection);}
// 7. An unresolved crossing with a chosen upper road is NOT a built bridge.
// Its authored structure section stays saved but cannot change link widths, 2D deck
// or 3D faces until real elevation gives a resolved crossing.
{
 const p={kind:'road-first',schemaVersion:3,title:'pending crossing',options:{},
   roads:[
     {id:'L',name:'Lower',points:[{x:-400,y:0},{x:400,y:0}],section:structuredClone(sec)},
     {id:'U',name:'Upper',points:[{x:0,y:-400},{x:0,y:400}],section:structuredClone(sec),structureSection:structuredClone(BR)}
   ],decisions:[]};
 const id=dv.detectCandidates(p.roads)[0].id;
 p.decisions=[{candidateId:id,decision:'grade-separated',over:'U',roads:['L','U'],at:{x:0,y:0}}];
 const scene=T('core/network/network-scene-geometry.cjs');
 const structureParts=(C)=>C.project.links.filter(l=>C.linkRanges.some(x=>x.id===l.id&&x.roadId==='U'))
   .flatMap(l=>l.components.filter(x=>x.id.startsWith('st-structure-')));
 const pending=rp.compileRoadFirstProject(p);
 assert.equal(pending.crossings[0].relation,'unresolved');
 assert.deepEqual(pending.structures,[],'unresolved crossing has no physical structure extents');
 assert.equal(pending.project.crossings[0].deck,undefined,'plan has no phantom deck');
 assert.equal(pending.project.crossings[0].tunnel,undefined,'plan has no phantom tunnel');
 assert.equal(structureParts(pending).length,0,'pending bridge does not change section widths or lanes');
 assert.equal(scene.resolveElevatedLinkScene(pending.project).faces.length,0,'3D has no phantom structure');
 assert.deepEqual(rp.normalizeRoadFirstProject(JSON.parse(JSON.stringify(p))),p,'dormant settings survive reopen');

 // Even an incorrectly nominated "upper" road at a lower elevation stays unresolved.
 const lower=structuredClone(p);
 lower.roads[1].profile=[{station:0,z:-3},{station:800,z:-3}];
 const reversed=rp.compileRoadFirstProject(lower);
 assert.equal(reversed.crossings[0].relation,'unresolved');
 assert.equal(reversed.structures.length,0);
 assert.equal(structureParts(reversed).length,0);

 const proposed=gs.overCommand(p,id,'U');assert.ok(proposed.cmd,proposed.error);
 const placed=c.executeCommand(p,proposed.cmd);assert.equal(placed.error,null,placed.error);
 const bridge=rp.compileRoadFirstProject(placed.project);
 assert.equal(bridge.crossings[0].relation,'over');
 assert.ok(bridge.project.crossings[0].deck,'2D plan receives the real bridge deck');
 assert.equal(ss.structureSpans(bridge,'U').length,1,'the saved custom section activates on a real bridge');
 assert.ok(structureParts(bridge).length>0,'bridge structure section affects actual link geometry');
 assert.ok(scene.resolveElevatedLinkScene(bridge.project).faces.some(f=>f.layer==='deck'),'3D renders real deck faces');

 const restored=c.executeCommand(placed.project,{type:'crossing.decide',candidateId:id,decision:'junction'});
 assert.equal(restored.error,null,restored.error);
 const back=rp.compileRoadFirstProject(restored.project);
 assert.equal(back.project.junctions.length,1,'the at-grade junction is rebuilt');
 assert.equal(back.project.crossings?.length??0,0,'no bridge objects remain in 2D/3D');
 assert.equal(back.structures.length,0);
 assert.equal(structureParts(back).length,0,'the custom bridge width is dormant at grade');
 assert.equal(scene.resolveElevatedLinkScene(back.project).faces.length,0,'restored ground has no 3D bridge faces');
 assert.deepEqual(restored.project.roads.find(r=>r.id==='U').structureSection,BR,
   'authored structure settings are retained, not deleted on restore');
 assert.ok(back.issues.some(i=>i.includes('หน้าตัดบนโครงสร้างตั้งไว้แต่ถนนนี้ไม่มีสะพาน')),
   'retained dormant settings are explicitly reported for review');
 const again=gs.overCommand(restored.project,id,'U');assert.ok(again.cmd,again.error);
 const replay=c.executeCommand(restored.project,again.cmd);assert.equal(replay.error,null,replay.error);
 assert.equal(ss.structureSpans(rp.compileRoadFirstProject(replay.project),'U').length,1,
   'custom section reactivates with the next explicit bridge proposal');
}

console.log('PASS structure sections: old files unchanged, bridge section over the deck with transitions outside it (plan geometry, deck width, deterministic, save / reopen, one undo), extra lane on a bridge, tunnel, listed when there is no structure, refusals, reverse / split');
