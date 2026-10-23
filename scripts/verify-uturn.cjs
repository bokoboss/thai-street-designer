// U-turn bridge (horseshoe ramp over the road) and U-turn opening under a bridge (docs/spec/UTURN_STRUCTURES.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const lc=T('core/road-first/level-criteria.cjs'),K=lc.levelCriteria();
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),u=T('core/road-first/uturn.cjs'),el=T('core/road-first/elevation.cjs'),dm=T('core/road-first/diamond.cjs'),gs=T('core/road-first/grade-separation.cjs'),dv=T('core/road-first/derive.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
const near=(a,b,eps=.02)=>Math.abs(a-b)<=eps;
const project=(points,extra={})=>({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[{id:'M',name:'ถนนหลัก',alignment:'arc',points,section:sec,...extra}]});

// 1. Matrix: which traffic turns × road drawn either way. Left-hand traffic on a y-down plan: eastbound on top (y < 0).
for(const reversed of [false,true])for(const from of ['forward','backward']){
  const P=project(reversed?[{x:600,y:0},{x:-600,y:0}]:[{x:-600,y:0},{x:600,y:0}]);
  const d=u.uturnBridgeDefaults(P,'M',from),plan=u.uturnBridgePlan(P,d,'U1');assert.ok(!plan.error,plan.error);
  let e=c.createEditor(P);const x=c.runCommand(e,plan.cmd);assert.equal(x.result.error,null,x.result.error);e=c.endGesture(x.editor);
  const ramp=e.project.roads.find(r=>r.id==='U1'),name=`${from}${reversed?' reversed':''}`;
  const dir=from==='forward'?1:-1,leaves=dir*(reversed?-1:1); // +1: the turning traffic heads east
  assert.equal(ramp.anchors.start.side,dir,`${name}: leaves from the turning traffic's side`);assert.equal(ramp.anchors.end.side,-dir,`${name}: joins the opposite traffic`);
  assert.ok(near(ramp.anchors.start.station,ramp.anchors.end.station,.01),`${name}: leaves and rejoins at one station`);
  assert.equal(Math.sign(ramp.points[0].y),leaves>0?-1:1,`${name}: leaves from the eastbound (top) side when turning eastbound traffic`);
  assert.equal(Math.sign(ramp.points.at(-1).y),leaves>0?1:-1,`${name}: rejoins on the other side`);
  // The turn is to the right (left-hand traffic): heading east on top, the loop swings south (y increasing) after its far end.
  const far=ramp.points.reduce((m,p)=>leaves>0?(p.x>m.x?p:m):(p.x<m.x?p:m));assert.ok(leaves>0?far.x>ramp.points[0].x:far.x<ramp.points[0].x,`${name}: loop runs ahead of the diverge`);
  // Over the road: grade-separated with the ramp over, clearance as set, no item to check.
  const C=rp.compileRoadFirstProject(e.project);assert.equal(C.project.junctions.length,0,`${name}: no junction`);
  assert.equal(C.crossings.length,1);assert.equal(C.crossings[0].over,'U1');assert.ok(near(C.crossings[0].clearance.min,K.clearance.value),`${name}: clearance ${C.crossings[0].clearance.min}`);
  assert.deepEqual(C.issues,[],`${name}: nothing to check`);
  assert.equal(rp.validateRoadFirstProject(JSON.parse(JSON.stringify(e.project))),null,'saved file valid (template origin)');
  // One undo removes ramp and crossing decision.
  const back=c.undo(e).editor.project;assert.equal(back.roads.length,1);assert.equal(back.decisions.length,0);
}

// 2. Profile: up at the ramp grade beside the road, level through the half circle; the plan footprint matches.
{const P=project([{x:-600,y:0},{x:600,y:0}]),d=u.uturnBridgeDefaults(P,'M','forward'),plan=u.uturnBridgePlan(P,d,'U1');
 const p=plan.road.profile;assert.equal(p.length,6);assert.ok(near(p[2].z,d.height)&&near(p[3].z,d.height));
 for(let i=1;i<p.length;i++)assert.ok(Math.abs(p[i].z-p[i-1].z)/(p[i].station-p[i-1].station)<=lc.gradeFor(K,{role:'ramp'})+1e-6,'within the ramp grade');
 assert.equal(d.radius,u.uturnMinRadius(P.roads[0]));assert.ok(near(plan.footprint.to-plan.footprint.from,u.uturnFootprint(d),.01));
 assert.equal(plan.road.origin.template,'uturn-bridge');
 // The set removes as one step.
 const placed=c.executeCommand(P,plan.cmd).project,rm=dm.removeTemplateCommand(placed.roads,plan.road.origin.group,'ลบ');
 assert.equal(c.executeCommand(placed,rm).project.roads.length,1);}

// 3. Refusals with a reason; nothing changes.
{const P=project([{x:-600,y:0},{x:600,y:0}]),d=u.uturnBridgeDefaults(P,'M','forward');
 assert.match(u.uturnBridgePlan(P,{...d,radius:d.radius-2},'U1').error,/เล็กเกินไป/);
 assert.match(u.uturnBridgePlan(P,{...d,station:1100},'U1').error,/ไม่พอสำหรับสะพานกลับรถ/);
 assert.match(u.uturnBridgePlan(P,{...d,grade:0},'U1').error,/ค่าที่ใส่ไม่ถูกต้อง/);
 const bent=project([{x:-600,y:0},{x:0,y:0},{x:400,y:300}]);assert.match(u.uturnBridgePlan(bent,{...u.uturnBridgeDefaults(bent,'M'),station:-1+500},'U1').error,/แนวตรง/);
 const oneway=project([{x:-600,y:0},{x:600,y:0}],{section:{...sec,backwardLanes:0}});assert.match(u.uturnBridgePlan(oneway,d,'U1').error,/ทั้งสองทิศ/);
 const legacy={...project([{x:-600,y:0},{x:600,y:0}]),schemaVersion:1};delete legacy.roads[0].alignment;assert.match(u.uturnBridgePlan(legacy,d,'U1').error,/แปลงระยะตามแนวโค้ง/);
 // A junction near the diverge is refused by the ordinary ramp rules.
 const withCross=project([{x:-600,y:0},{x:600,y:0}]);withCross.roads.push({id:'K',name:'ถนนตัด',alignment:'arc',points:[{x:-113,y:-300},{x:-113,y:300}],section:sec});
 let e=c.createEditor({...withCross,roads:[withCross.roads[0]]});e=c.endGesture(c.runCommand(e,{type:'road.add',road:withCross.roads[1]}).editor);
 const r=c.executeCommand(e.project,u.uturnBridgePlan(e.project,d,'U1').cmd);assert.match(r.error,/ใกล้ทางแยก/);}

// 4. U-turn under a bridge: a median U-turn opening on the lower road, centred under the structure.
{const P=project([{x:-600,y:0},{x:600,y:0}]);P.roads.push({id:'B',name:'ถนนบน',alignment:'arc',points:[{x:0,y:-500},{x:0,y:500}],section:sec});
 const cid=dv.detectCandidates(P.roads)[0].id;let e=c.createEditor(P);e=c.endGesture(c.runCommand(e,gs.overCommand(e.project,cid,'B').cmd).editor);
 let C=rp.compileRoadFirstProject(e.project);const span=C.crossings[0].clearance.spanUnder;
 const p=u.uturnUnderPlan(e.project,C,cid);assert.ok(!p.error,p.error);assert.equal(p.roadId,'M');assert.equal(p.opening.type,'uturn');
 assert.ok(p.opening.station>=span[0]&&p.opening.station+p.opening.length<=span[1],'opening under the structure');
 assert.ok(near(p.opening.station+p.opening.length/2,(span[0]+span[1])/2,.5),'centred');
 const x=c.runCommand(e,p.cmd);assert.equal(x.result.error,null,x.result.error);e=c.endGesture(x.editor);
 C=rp.compileRoadFirstProject(e.project);assert.ok(C.project.links.some(l=>(l.medianOpenings??[]).some(o=>o.type==='uturn')),'compiled into the link (plan / 3D / export)');
 assert.ok(!C.issues.some(i=>/ช่องเปิด/.test(i)),'placed, not reported as dropped');
 assert.match(u.uturnUnderPlan(e.project,C,cid).error,/มีช่องเปิดเกาะกลาง/,'one per structure');
 e=c.undo(e).editor;assert.equal(e.project.roads.find(r=>r.id==='M').openings,undefined,'one undo');
 const nomed=JSON.parse(JSON.stringify(e.project));nomed.roads.find(r=>r.id==='M').section.median=0;
 assert.match(u.uturnUnderPlan(nomed,rp.compileRoadFirstProject(nomed),cid).error,/ไม่มีเกาะกลาง/);
 assert.match(u.uturnUnderPlan(P,rp.compileRoadFirstProject(P),cid).error,/ทางต่างระดับ/,'only at a grade-separated crossing');}
console.log('PASS U-turn structures: bridge matrix (both traffic directions × road drawn either way), right turn in left-hand traffic, ramp over the road with clearance, profile within ramp grade, one undo / remove set / saved file, refusals; U-turn opening under a bridge centred under the structure, compiled, one per structure, refusals');
