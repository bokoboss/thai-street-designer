// SPIKE 1B — road-first compile onto the existing engine. Not part of pnpm test.
// Writes evidence to artifacts/spike-road-first/.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const rf=T('core/road-first/derive.cjs'),np=T('core/network/network-project.cjs'),geo=T('core/junction/geometry.cjs'),
  dv=T('core/junction/design-validation.cjs'),{designReviews}=T('core/junction/reviews.cjs'),{NetworkDrawing}=T('app/network/network-drawing.cjs');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const OUT='artifacts/spike-road-first';fs.mkdirSync(OUT,{recursive:true});
const section=(f=2,b=2,extra={})=>({forwardLanes:f,backwardLanes:b,laneWidth:3.25,median:2,walk:2,...extra});
const results=[];
const close=(a,b,tol=1e-6)=>Math.abs(a-b)<=tol;
function deepClose(a,b,tol=1e-6,p='$'){
  if(typeof a==='number'&&typeof b==='number'){if(!close(a,b,tol))throw new Error(`${p}: ${a} ≠ ${b}`);return;}
  if(Array.isArray(a)){assert(Array.isArray(b)&&a.length===b.length,`${p}: length ${a.length} ≠ ${b?.length}`);a.forEach((v,i)=>deepClose(v,b[i],tol,`${p}[${i}]`));return;}
  if(a&&typeof a==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))deepClose(a[k],b[k],tol,`${p}.${k}`);return;}
  assert.equal(a,b,p);
}
function engineChecks(project){
  const out=[];
  for(const j of project.junctions){
    const err=dv.designError(j.design);if(err)out.push(`${j.id}: ${err}`);
  }
  const v=np.validateNetworkProject(project);if(v)out.push('project: '+v);
  for(const l of project.links)for(const i of np.linkIssues(project,l))if(['port-facing','missing-port','alignment'].includes(i.kind))out.push(`${l.id}: ${i.message}`);
  return out;
}
function render(name,project){
  const b=np.projectBounds(project,30),w=b.w,h=b.h;
  const noop=()=>{};
  const body=renderToStaticMarkup(React.createElement(NetworkDrawing,{project,zoom:1,selection:null,comparisonFocus:null,parallelCorridorId:null,parallelDraftMainlineId:null,selectedArm:null,linkMode:false,pendingPort:null,selectedLinkVertex:null,onSelect:noop,onArmSelect:noop,onJunctionMoveStart:noop,onArmMoveStart:noop,onLinkInsertVertex:noop,onLinkVertexMoveStart:noop,onLinkVertexSelect:noop,onPort:noop}));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${w} ${h}" width="${Math.round(w*3)}" height="${Math.round(h*3)}" data-network-plan="true">${body}</svg>`;
  fs.writeFileSync(`${OUT}/${name}.svg`,svg);
  return `${name}.svg`;
}
function record(name,fn){
  try{const r=fn();results.push({name,status:'pass',...r});console.log('PASS',name);}
  catch(e){results.push({name,status:'fail',error:String(e.message||e)});console.log('FAIL',name,e.message);}
}
const cand=(roads)=>rf.detectCandidates(roads);
const confirmAll=(roads,extra={})=>cand(roads).map(c=>({candidateId:c.id,decision:'junction',...(extra[c.id]??{})}));

// 1. Four-leg 90° crossings reproduce the existing hand-authored demo network exactly.
record('four-leg-90-reproduces-demo',()=>{
  const roads=[
    {id:'R1',name:'ถนนหลัก',points:[{x:-242,y:0},{x:242,y:0}],section:section()},
    {id:'R2',name:'ซอย A',points:[{x:-150,y:-92},{x:-150,y:92}],section:section()},
    {id:'R3',name:'ซอย B',points:[{x:150,y:-92},{x:150,y:92}],section:section()},
  ];
  const c=cand(roads);assert.equal(c.length,2);
  const r=rf.compileRoadNetwork(roads,confirmAll(roads),{approachLength:92});
  assert.deepEqual(r.issues,[]);
  const demo=np.createNetworkProject();
  assert.equal(r.project.junctions.length,2);assert.equal(r.project.links.length,1);
  r.project.junctions.forEach((j,i)=>{
    const d=demo.junctions[i];
    deepClose({x:j.x,y:j.y},{x:d.x,y:d.y});
    deepClose(geo.edges(j.design),geo.edges(d.design),1e-6);
  });
  const L=r.project.links[0],D=demo.links[0];
  assert.deepEqual([L.from,L.to],[D.from,D.to]);
  deepClose(np.linkPoints(r.project,L),np.linkPoints(demo,D));
  assert.deepEqual(engineChecks(r.project),[]);
  return {note:'junction edges, port refs and link geometry identical to createNetworkProject()',svg:render('01-four-leg-demo',r.project)};
});

// 2. T junction: road ending on another road → 3 legs, one disabled arm.
record('tee',()=>{
  const roads=[
    {id:'R1',name:'ถนนหลัก',points:[{x:-120,y:0},{x:120,y:0}],section:section()},
    {id:'R2',name:'ซอยเข้า',points:[{x:0,y:0},{x:0,y:100}],section:section(1,1,{median:0})},
  ];
  const c=cand(roads);assert.equal(c.length,1);assert.equal(c[0].kind,'tee');
  const r=rf.compileRoadNetwork(roads,confirmAll(roads),{approachLength:60});
  assert.deepEqual(r.issues,[]);
  const j=r.project.junctions[0];assert.equal(j.design.enabled.filter(Boolean).length,3);
  assert.deepEqual(engineChecks(r.project),[]);
  return {note:'3 active arms; side road 1+1 lanes without median',svg:render('02-tee',r.project)};
});

// 3. Skew 55° crossing.
record('skew-55',()=>{
  const a=55*Math.PI/180;
  const roads=[
    {id:'R1',name:'ถนนหลัก',points:[{x:-100,y:0},{x:100,y:0}],section:section()},
    {id:'R2',name:'ถนนเฉียง',points:[{x:-80*Math.cos(a),y:-80*Math.sin(a)},{x:80*Math.cos(a),y:80*Math.sin(a)}],section:section()},
  ];
  const r=rf.compileRoadNetwork(roads,confirmAll(roads),{approachLength:60});
  assert.deepEqual(r.issues,[]);
  assert.deepEqual(engineChecks(r.project),[]);
  const angles=r.project.junctions[0].design.arms.map(v=>v.angle);
  return {note:'arm headings '+angles.map(v=>v.toFixed(1)).join(', '),svg:render('03-skew-55',r.project)};
});

// 4. Curved road between two junctions: bend becomes a RoadLink PI with radius.
record('curved-between-junctions',()=>{
  const roads=[
    {id:'R1',name:'ถนนโค้ง',points:[{x:-200,y:0},{x:0,y:0},{x:120,y:-90},{x:260,y:-90}],section:section()},
    {id:'R2',name:'ซอย A',points:[{x:-120,y:-70},{x:-120,y:70}],section:section()},
    {id:'R3',name:'ซอย B',points:[{x:190,y:-160},{x:190,y:-20}],section:section()},
  ];
  roads[0].points[1].radius=60;roads[0].points[2].radius=60;
  const r=rf.compileRoadNetwork(roads,confirmAll(roads),{approachLength:50});
  assert.deepEqual(r.issues,[]);
  const between=r.project.links.filter(l=>np.isJunctionPort(l.from)&&np.isJunctionPort(l.to));
  assert.equal(between.length,1);assert.equal(between[0].via.length,2);
  assert.deepEqual(engineChecks(r.project),[]);
  return {note:'2 PIs (R=60 m) carried into the RoadLink between the junctions',svg:render('04-curved-between',r.project)};
});

// 5. Curved road beyond the last junction: drawn through a road end (Phase 2 slice 1).
record('curved-dead-end',()=>{
  const roads=[
    {id:'R1',name:'ถนนหลัก',points:[{x:-120,y:0},{x:120,y:0}],section:section()},
    {id:'R2',name:'ถนนโค้งปลายตัน',points:[{x:0,y:-80},{x:0,y:30},{x:60,y:110}],section:section()},
  ];
  const r=rf.compileRoadNetwork(roads,confirmAll(roads),{approachLength:60});
  const tail=r.project.links.find(l=>!np.isJunctionPort(l.to)&&l.name.startsWith('ถนนโค้งปลายตัน'));
  assert(tail,'tail continues as a link to a road end');
  assert.deepEqual(engineChecks(r.project),[]);
  return {note:'arm stops before the bend; the tail continues through the bend to a road end',issues:r.issues,svg:render('05-curved-dead-end',r.project)};
});

// 6. Slip lane is keyed to road legs: survives recompile after a section edit, and the junction mouth follows the road.
record('slip-survives-road-edit',()=>{
  const make=(f)=>[
    {id:'R1',name:'ถนนหลัก',points:[{x:-120,y:0},{x:120,y:0}],section:section(f,2)},
    {id:'R2',name:'ถนนรอง',points:[{x:0,y:-100},{x:0,y:100}],section:section()},
  ];
  const before=make(2),c=cand(before)[0];
  const decision=[{candidateId:c.id,decision:'junction',treatments:{slips:[{from:'R1:behind'}]}}];
  const r1=rf.compileRoadNetwork(before,decision,{approachLength:80});
  assert.deepEqual(r1.issues,[]);assert.equal(r1.project.junctions[0].design.slips.length,1);
  assert.deepEqual(engineChecks(r1.project),[]);
  const base=structuredClone(r1.project.junctions[0].design);base.slips=[];
  deepClose(geo.edges(r1.project.junctions[0].design),geo.edges(base),1e-9); // Slip invariant holds on derived junctions
  const after=make(3),c2=cand(after)[0];
  const r2=rf.compileRoadNetwork(after,[{...decision[0],candidateId:c2.id}],{approachLength:80});
  assert.deepEqual(r2.issues,[]);
  const s1=r1.project.junctions[0].design.slips[0],s2=r2.project.junctions[0].design.slips[0];
  assert(s2,'slip kept');
  const legOf=(r,arm)=>r.legs.find(l=>l.junctionId==='J-1'&&l.armId===arm);
  assert.deepEqual([legOf(r2,s2.fromArm).roadId,legOf(r2,s2.fromArm).side],[legOf(r1,s1.fromArm).roadId,legOf(r1,s1.fromArm).side]);
  const changed=JSON.stringify(geo.edges(r1.project.junctions[0].design))!==JSON.stringify(geo.edges(r2.project.junctions[0].design));
  assert(changed,'junction mouth must change when the road section changes');
  assert.deepEqual(engineChecks(r2.project),[]);
  return {note:'Slip stays on the same road leg; widening R1 eastbound to 3 lanes changes the junction edges',svg:render('06-slip-after-edit',r2.project)};
});

// 7. Candidate is explicit: no decision → no junction; grade separated → no junction.
record('candidate-explicit',()=>{
  const roads=[
    {id:'R1',name:'ถนนหลัก',points:[{x:-120,y:0},{x:120,y:0}],section:section()},
    {id:'R2',name:'ถนนรอง',points:[{x:0,y:-100},{x:0,y:100}],section:section()},
  ];
  const c=cand(roads)[0];
  const none=rf.compileRoadNetwork(roads,[]),gs=rf.compileRoadNetwork(roads,[{candidateId:c.id,decision:'grade-separated'}]);
  assert.equal(none.project.junctions.length,0);assert.equal(gs.project.junctions.length,0);
  assert(none.issues.some(i=>i.includes('ยังไม่ได้ยืนยัน')));
  assert.equal(gs.project.links.length,2);assert.equal(gs.project.roadEnds.length,4);
  assert.deepEqual(engineChecks(gs.project),[]);
  return {note:'topology changes only on explicit confirmation; grade-separated roads are drawn as two standalone roads',issues:gs.issues,svg:render('07-grade-separated',gs.project)};
});

// 8. Five legs exceed the four-slot junction design.
record('five-leg-limit',()=>{
  const roads=[
    {id:'R1',name:'A',points:[{x:-100,y:0},{x:100,y:0}],section:section()},
    {id:'R2',name:'B',points:[{x:0,y:-100},{x:0,y:100}],section:section()},
    {id:'R3',name:'C',points:[{x:0,y:0},{x:70,y:-70}],section:section(1,1,{median:0})},
  ];
  const decisions=cand(roads).map(c=>({candidateId:c.id,decision:'junction'}));
  const r=rf.compileRoadNetwork(roads,decisions,{approachLength:50});
  return {note:`${cand(roads).length} candidates at one point; issues: ${r.issues.join(' | ')||'none'}`,issues:r.issues};
});

fs.writeFileSync(`${OUT}/results.json`,JSON.stringify(results,null,2));
const failed=results.filter(r=>r.status==='fail');
console.log(`${results.length-failed.length}/${results.length} spike checks passed`);
if(failed.length)process.exitCode=1;
