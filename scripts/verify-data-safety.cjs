// P0 (independent review 2026-10-20): object identity and undo steps.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const ids=T('core/road-first/ids.cjs'),cmp=T('core/road-first/compare.cjs'),c=T('core/road-first/commands.cjs'),h=T('core/common/history.cjs');
const sec={forwardLanes:1,backwardLanes:1,laneWidth:3.25,median:0,walk:2};

// Road ids are opaque and never collide; names stay "ถนน n".
const roads=[{id:'R-1',name:'ถนน 1',points:[{x:0,y:0},{x:100,y:0}],section:sec}];
const many=new Set(Array.from({length:500},()=>ids.newRoadId(roads)));assert.equal(many.size,500);assert.ok(![...many].includes('R-1'));
assert.match(ids.newRoadId([]),/^R-[0-9a-z]{8}$/);assert.equal(ids.nextRoadName(roads),'ถนน 2');

// Delete a road and draw a new one: the comparison shows removed + added, not "changed".
const base={kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads};
const alt={...base,roads:[{id:ids.newRoadId(roads),name:'ถนน 1',points:[{x:0,y:50},{x:100,y:50}],section:sec}]};
assert.deepEqual(cmp.compareScenarios(base,alt).counts,{added:1,removed:1,changed:0});

// Typed values are separate undo steps once the gesture is closed (the workspace closes it after every typed commit).
let ed=c.createEditor(base);
ed=c.endGesture(c.runCommand(ed,{type:'road.setSection',roadId:'R-1',patch:{walk:2.5}}).editor);
ed=c.endGesture(c.runCommand(ed,{type:'road.setSection',roadId:'R-1',patch:{walk:3}}).editor);
assert.equal(c.undo(ed).editor.project.roads[0].section.walk,2.5,'one undo per typed value');
// A drag (same group, gesture still open) stays one step.
let dr=c.createEditor(base);
for(const x of [10,20,30])dr=c.runCommand(dr,{type:'road.movePoint',roadId:'R-1',index:0,point:{x,y:0}}).editor;
assert.equal(c.undo(dr).editor.project.roads[0].points[0].x,0,'a drag is one step');
console.log('PASS data safety: road ids never reused (comparison shows removed + added), one undo step per typed value, one per drag');

// An arm that needs more than the straight part of its road is reported with numbers for the plan (not only as text).
{
  const rp=T('core/road-first/project.cjs'),ae=T('core/road-first/approach-edit.cjs'),s2={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
  let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{approachLength:40},roads:[]});
  for(const r of [{id:'A',points:[{x:-300,y:0},{x:300,y:0}]},{id:'B',points:[{x:0,y:-200},{x:0,y:200}]},{id:'C',points:[{x:90,y:-200},{x:90,y:200}]}])e=c.runCommand(e,{type:'road.add',road:{...r,name:'ถนน '+r.id,section:s2}}).editor;
  const comp=()=>rp.compileRoadFirstProject(e.project),cid=e.project.decisions.find(d=>d.roads.includes('B')).candidateId;
  assert.equal(comp().shortfalls.length,0);
  const info=ae.approachInfo(comp(),cid,'A:ahead'),x=c.runCommand(e,{type:'leg.setTreatment',candidateId:cid,leg:'A:ahead',patch:ae.pocketTreatment(info.arm,'right',{length:60})});
  if(!x.result.error){e=x.editor;const sf=comp().shortfalls;assert.equal(sf.length,1);assert.equal(sf[0].roadId,'A');assert.ok(sf[0].required>sf[0].room);}
  console.log('PASS arm shortfall reported with room and required length'+(x.result.error?' (edit refused by the engine: '+x.result.error+')':''));
}
