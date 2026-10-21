// Phase 2 slice 4 — road-first project file and one-way migration from Network v1–v5.
// Golden rule: every migrated project compiles back to the same world geometry
// (junction outlines, sidewalks, islands, Slip pavement, arrows, stop/divider marks,
// RoadLink alignments and resolved RoadLink surfaces) within 1 cm.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const n=T('core/network/network-project.cjs'),jp=T('core/network/junction-auxiliary-proposal.cjs'),seed=T('core/network/parallel-frontage-seed.cjs');
const mg=T('core/road-first/migrate.cjs'),rp=T('core/road-first/project.cjs'),dg=T('core/road-first/geometry-digest.cjs');
const m=T('core/junction/model.cjs'),sl=T('core/junction/slip-model.cjs'),v=T('core/junction/design-validation.cjs');

const golden=(name,net,{expectIssues=[]}={})=>{
  assert.equal(n.validateNetworkProject(net),null,`${name}: fixture is a valid network`);
  const r=mg.migrateNetworkProject(net);
  assert(r.items.every(i=>['lost','changed','check'].includes(i.severity)&&i.subject&&i.message),`${name}: every finding has severity, subject and message`);
  assert.deepEqual(r.issues,r.items.map(mg.migrationText),`${name}: issue text derived from items`);
  const unexpected=r.issues.filter(i=>!expectIssues.some(re=>re.test(i)));
  assert.deepEqual(unexpected,[],`${name}: migration issues`);
  for(const re of expectIssues)assert(r.issues.some(i=>re.test(i)),`${name}: expected issue ${re}`);
  assert.equal(rp.validateRoadFirstProject(r.project),null,`${name}: migrated file is valid`);
  // Through JSON, as a stored file would be.
  const stored=rp.normalizeRoadFirstProject(JSON.parse(JSON.stringify(r.project)));
  const compiled=rp.compileRoadFirstProject(stored);
  assert.deepEqual(compiled.issues,[],`${name}: compile issues`);
  assert.equal(n.validateNetworkProject(compiled.project),null,`${name}: compiled network is valid`);
  for(const j of compiled.project.junctions)assert.equal(v.designError(j.design),null,`${name}: ${j.name} design`);
  assert.deepEqual(dg.compareDigests(dg.networkDigest(net),dg.networkDigest(compiled.project)),[],`${name}: golden geometry`);
  assert.equal(compiled.project.title,net.title);
  return{...r,compiled:compiled.project};
};
const sum=[];

// G1. Built-in demo: two four-leg junctions joined by one RoadLink.
const demo=golden('demo',n.createNetworkProject());
assert.equal(demo.project.roads.length,3);assert.equal(demo.project.decisions.filter(d=>d.decision==='junction').length,2);
sum.push('demo');

// G2. Rotated junctions (instance + design rotation), a curved RoadLink and a T-junction.
let g2=n.createNetworkProject();
g2=n.rotateJunction(g2,'J-1',30);g2.junctions[0].design.rotation=15;
const L=g2.links[0],a=n.worldPort(g2,L.from),b=n.worldPort(g2,L.to);
g2=n.setLinkVia(g2,L.id,[{x:(a.x+b.x)/2,y:(a.y+b.y)/2+60,radius:40}]);
g2=n.setJunctionArmEnabled(g2,'J-2',1,false).project;
golden('rotated + curved + tee',g2);sum.push('rotation/PI/tee');

// G3. Junction-owned detail: pockets, markings, arrows, median opening, Slip, corner, roadside, divider settings.
const g3=n.createNetworkProject(),d3=g3.junctions[0].design;
d3.arms[0].incomingPockets={left:{...m.emptyPockets().left},right:{...m.emptyPockets().right,lanes:1,length:30,taper:15}};
d3.arms[1].laneMarkings={...m.markingsFor(d3.arms[1]),incomingMain:['left','sr']};
d3.arms[2].medianOpenings=[{id:'u1',start:30,length:12,type:'uturn'}];d3.arms[2].median=6;
d3.arms[3].crossing=false;d3.arms[3].dividerMode='dashed';d3.arms[1].solidLength=20;
d3.slips=[{...sl.defaultSlip(1,sl.nextActiveArm(d3,1),4.5,30),crossing:{enabled:true,offset:9}}];
d3.corner=14;d3.title='แยกทดสอบ';g3.junctions[0].name='แยกทดสอบ';
assert.equal(v.designError(d3),null,'G3 fixture design');
const r3=golden('junction detail',g3);
const j3=r3.project.decisions.find(d=>d.name==='แยกทดสอบ').treatments;
assert.equal(j3.corner,14);assert.equal(j3.slips.length,1);assert(Object.values(j3.legs).some(t=>t.incomingPockets?.right.lanes===1),'pocket stored by leg');
sum.push('pockets/markings/opening/Slip/corner');
// Editing a migrated junction and capturing it keeps the approach zones and reports no road edits.
const lt=T('core/road-first/leg-treatments.cjs'),edited3=structuredClone(r3.compiled);
const ej=edited3.junctions.find(j=>j.name==='แยกทดสอบ'),armIx=ej.design.enabled.findIndex(Boolean);ej.design.arms[armIx].signal=false;
const cap=lt.captureTreatments(r3.project.roads,r3.project.decisions,edited3,r3.project.options);
assert.deepEqual(cap.issues,[],'capture after migration reports nothing unexpected');
const recompiled=rp.compileRoadFirstProject({...r3.project,decisions:cap.decisions});
assert.deepEqual(recompiled.issues,[]);
assert.deepEqual(dg.compareDigests(dg.networkDigest(edited3),dg.networkDigest(recompiled.project)),[],'captured edit compiles to the edited geometry');
assert.equal(recompiled.project.junctions.find(j=>j.name==='แยกทดสอบ').design.arms[armIx].signal,false,'edit kept');

// G4. Roundabout.
const g4=n.createNetworkProject();g4.junctions[1].design={...g4.junctions[1].design,type:'roundabout',slips:[]};
assert.equal(v.designError(g4.junctions[1].design),null,'G4 fixture design');
golden('roundabout',g4);sum.push('roundabout');

// G5. Road ends: port → road end with a PI, and a standalone road end → road end.
let g5=n.createNetworkProject();
const port=n.worldPort(g5,{junctionId:'J-2',armId:0});
const sec={incoming:2,outgoing:1,median:0,width:3.25,walk:2,bands:[],incomingSection:{width:3.25,walk:2,bands:[]},outgoingSection:{width:3.25,walk:2,bands:[]}};
const e1=n.addRoadEnd(g5,{x:port.x+160,y:port.y-90},180,sec,'ปลายทางตะวันออก');g5=e1.project;
const c1=n.connectPorts(g5,{junctionId:'J-2',armId:0},{endId:e1.roadEnd.id});g5=n.setLinkVia(c1.project,c1.link.id,[{x:port.x+80,y:port.y,radius:40}]);
const s1=n.addRoadEnd(g5,{x:-200,y:300},0,sec,'ซอย ก ต้น');g5=s1.project;const s2=n.addRoadEnd(g5,{x:100,y:300},180,{...sec,incoming:1,outgoing:2},'ซอย ก ปลาย');g5=s2.project;
g5=n.connectPorts(g5,{endId:s2.roadEnd.id},{endId:s1.roadEnd.id}).project;
const r5=golden('road ends',g5);
assert(r5.compiled.roadEnds.some(e=>e.name==='ปลายทางตะวันออก'),'road end names kept');
sum.push('road ends');

// G6. Reversed RoadLink carrying a pocket handoff, a width component and a linear section profile.
let g6=n.createNetworkProject();const L6=g6.links[0];
g6.links[0]={...L6,from:L6.to,to:L6.from,via:[...L6.via].reverse()};
const toRef=g6.links[0].to,arm6=g6.junctions.find(j=>j.id===toRef.junctionId).design.arms[toRef.armId];
arm6.outgoingPockets={left:{lanes:1,length:25,taper:15},right:{lanes:0,length:25,taper:15}};
const prop=jp.junctionAuxiliaryProposals(g6,g6.links[0]).find(p=>p.end==='to'&&p.sourceDirection==='outgoing'&&p.sourceSide==='left');
assert(prop,'handoff proposal at the link end');
g6=jp.continueJunctionAuxiliaryToCorridor(g6,L6.id,prop.id).project;
g6=n.updateLinkSectionProfile(g6,L6.id,'linear');
const w=n.addLinkStationComponent(g6,L6.id,'width');g6=n.updateLinkStationComponent(w.project,L6.id,w.component.id,{start:60,end:110,delta:1}).project;
const r6=golden('reversed link + handoff + components',g6);
const cl=r6.compiled.links.find(l=>l.components.length);
assert(cl.components.some(c=>c.kind==='lane'&&c.source),'handoff source rebuilt');
assert.deepEqual(jp.junctionAuxiliaryHandoffIssues(r6.compiled,cl),[],'handoff is recognised on the compiled link');
assert.equal(cl.sectionProfile.mode,'linear');
sum.push('reversed link/handoff/components');

// G7. Network schema v4 file: normalised, then migrated.
const v4=JSON.parse(JSON.stringify(n.createNetworkProject()));v4.schemaVersion=4;delete v4.roadEnds;
golden('v4 file',n.normalizeNetworkProject(v4));sum.push('v4 file');

// G8. Parallel corridors are reported as not carried yet; geometry still matches.
const g8=seed.seedParallelFrontage(n.createNetworkProject(),{mainlineLinkIds:['L-1'],mainlineStartJunctionId:'J-1',side:'left',offset:40});
assert.equal(g8.error,null);
const g8r=golden('parallel corridor',g8.project,{expectIssues:[/ทางขนาน/]});sum.push('parallel corridor (reported)');
// Per-object report: the corridor is "not carried over" and points at the mainline road.
assert.deepEqual(g8r.issues,g8r.items.map(mg.migrationText),'issue text is derived from the per-object items');
{
  const item=g8r.items.find(i=>/ทางขนาน/.test(i.message));
  assert.equal(item.severity,'lost');assert.equal(item.target?.kind,'road');
  assert(g8r.project.roads.some(r=>r.id===item.target.roadId),'target road exists in the migrated project');
  assert(g8r.project.roads.find(r=>r.id===item.target.roadId).links.some(l=>l.name===g8.project.links.find(x=>x.id==='L-1').name),'target is the mainline road');
}


// File rules.
assert.throws(()=>rp.normalizeRoadFirstProject({...demo.project,schemaVersion:2}),/รุ่นที่ใหม่กว่า/,'future road-first version rejected');
assert.throws(()=>rp.normalizeRoadFirstProject({...demo.project,kind:'network'}),/ไม่ใช่ไฟล์/);
const broken=structuredClone(demo.project);broken.roads[0].points=[broken.roads[0].points[0]];
assert(rp.validateRoadFirstProject(broken),'road needs two points');

console.log(`PASS road-first migration golden (${sum.length} fixtures: ${sum.join(', ')}); file version and validation rules`);
