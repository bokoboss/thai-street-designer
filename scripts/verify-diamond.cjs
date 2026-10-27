// Phase 4B-3 — diamond interchange template (docs/spec/PHASE_4B_DIAMOND.md): ordinary pieces, one undo step.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),dm=T('core/road-first/diamond.cjs'),n=T('core/network/network-project.cjs'),lc=T('core/road-first/level-criteria.cjs'),gs=T('core/road-first/grade-separation.cjs'),ra=T('core/common/resolved-alignment.cjs'),elevation=T('core/road-first/elevation.cjs');
const main={id:'M',name:'ทางหลวง',points:[{x:-700,y:0},{x:700,y:0}],section:{forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:4,walk:0}};
const cross={id:'C',name:'ถนนตัด',points:[{x:0,y:-500},{x:0,y:500}],section:{forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:2}};
const start=()=>{let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[main]});e=c.endGesture(c.runCommand(e,{type:'road.add',road:cross}).editor);return e;};
const ids=['D1','D2','D3','D4'];
// 1. Defaults: main road over, ramps outside its rise; all four ramps.
let e=start();const cid=e.project.decisions[0].candidateId;assert.equal(e.project.decisions[0].decision,'junction');
const P=dm.diamondDefaults(e.project,cid,'M');assert.equal(P.over,'main');assert.ok(Object.values(P.ramps).every(Boolean));
const K=lc.levelCriteria();assert.ok(P.length>=lc.bridgeRise(K)/lc.gradeFor(K,main),'ramps start beyond the climb of the main road');
const plan=dm.diamondPlan(e.project,cid,P,ids);assert.ok(!plan.error,plan.error);assert.equal(plan.ramps.length,4);
const x=c.runCommand(e,plan.cmd);assert.equal(x.result.error,null,x.result.error);assert.match(x.result.label,/ข้าวหลามตัด/);
const p1=x.editor.project,C1=rp.compileRoadFirstProject(p1);
// Grade separation: main road over the crossroad by the level criteria.
assert.equal(C1.crossings.length,1);assert.equal(C1.crossings[0].over,'M');assert.ok(Math.abs(C1.crossings[0].gap-lc.bridgeRise(K))<.01);
// Ramps: ordinary ramps with origin; attached on their traffic side; two terminal junctions with four legs each.
const ramps=p1.roads.filter(r=>r.origin?.template==='diamond');assert.equal(ramps.length,4);assert.ok(ramps.every(r=>r.role==='ramp'&&r.origin.group===ramps[0].origin.group));
const by=k=>ramps.find(r=>r.name.includes(dm.DIAMOND_RAMP_LABEL[k]));
assert.ok(by('forwardOff').anchors?.start&&by('forwardOn').anchors?.end&&by('backwardOff').anchors?.start&&by('backwardOn').anchors?.end,'diverges and merges attached');
assert.ok(by('forwardOff').points[1].y<0&&by('backwardOff').points[1].y>0,'forward ramps on the forward-lane side (left of travel)');
assert.equal(C1.project.junctions.length,2,'one terminal junction each side');assert.ok(C1.project.junctions.every(j=>j.design.enabled.filter(Boolean).length===4));
assert.equal(n.validateNetworkProject(C1.project),null);
assert.ok(!C1.issues.some(i=>/ต้องตรวจตามเกณฑ์|ระดับถนนต่างกัน|สวนทิศ|ต้องยาวอย่างน้อย/.test(i)),'no level, grade, direction or arm-room flags: '+C1.issues.join(' | '));
// 2. One undo: back to the junction and two roads.
const u=c.undo(c.endGesture(x.editor)).editor;assert.equal(u.project.roads.length,2);assert.equal(u.project.decisions[0].decision,'junction');
// 3. Pieces stay editable; removing the group is one step and leaves the grade separation.
const e2=c.endGesture(x.editor),rm=c.runCommand(e2,dm.removeTemplateCommand(p1.roads,ramps[0].origin.group,'ลบทางลาดชุดนี้'));
assert.equal(rm.result.error,null);assert.equal(rm.editor.project.roads.length,2);assert.equal(rp.compileRoadFirstProject(rm.editor.project).crossings[0].over,'M');
// 4. Crossroad over instead: ramps climb to its level; terminals at the crossroad level; flags only if too steep.
{const e3=start(),cid3=e3.project.decisions[0].candidateId,plan3=dm.diamondPlan(e3.project,cid3,{...P,over:'cross'},ids);assert.ok(!plan3.error,plan3.error);
 const r3=c.runCommand(e3,plan3.cmd);assert.equal(r3.result.error,null,r3.result.error);const C3=rp.compileRoadFirstProject(r3.editor.project);
 assert.equal(C3.crossings[0].over,'C');assert.ok(!C3.issues.some(i=>/ระดับถนนต่างกัน/.test(i)),'terminals meet the crossroad at its level: '+C3.issues.join(' | '));}
// 5. Half diamond (forward ramps only): two ramps, one four-leg terminal.
{const e4=start(),cid4=e4.project.decisions[0].candidateId,plan4=dm.diamondPlan(e4.project,cid4,{...P,ramps:{forwardOff:true,forwardOn:true,backwardOff:false,backwardOn:false}},ids);
 const r4=c.runCommand(e4,plan4.cmd);assert.equal(r4.result.error,null);const C4=rp.compileRoadFirstProject(r4.editor.project);
 assert.equal(r4.editor.project.roads.filter(r=>r.origin).length,2);assert.equal(C4.project.junctions.length,1);assert.equal(C4.project.junctions[0].design.enabled.filter(Boolean).length,4,'off and on ramp meet the crossroad at one terminal');}
// 6. Refusals with reasons (red preview).
assert.match(dm.diamondPlan(e.project,cid,{...P,length:2000},ids).error,/สั้นเกินไป/);
assert.match(dm.diamondPlan(e.project,cid,{...P,length:100},ids).error,/ช่วงแยกออก/);
assert.match(dm.diamondPlan(e.project,cid,{...P,offset:5},ids).error,/ใกล้เกินไป/);
assert.match(dm.diamondPlan(e.project,cid,{...P,ramps:{forwardOff:false,forwardOn:false,backwardOff:false,backwardOn:false}},ids).error,/อย่างน้อยหนึ่ง/);
// 7. A main road that bends beyond the crossing: ramps follow its alignment and still attach on their sides.
{const bent={...main,points:[{x:-700,y:-120},{x:-150,y:0},{x:150,y:0},{x:700,y:120}]};
 let e5=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[bent]});e5=c.endGesture(c.runCommand(e5,{type:'road.add',road:cross}).editor);
 const cid5=e5.project.decisions[0].candidateId,P5=dm.diamondDefaults(e5.project,cid5,'M'),plan5=dm.diamondPlan(e5.project,cid5,P5,ids);assert.ok(!plan5.error,plan5.error);
 const r5=c.runCommand(e5,plan5.cmd);assert.equal(r5.result.error,null,r5.result.error);
 const rs=r5.editor.project.roads.filter(r=>r.origin);assert.equal(rs.filter(r=>r.anchors?.start||r.anchors?.end).length,4,'all four attached on a bent main road');}
// 8. A crossroad too short for the terminals is refused with the reason.
{const shortCross={...cross,points:[{x:0,y:-20},{x:0,y:20}]};let e6=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[main]});
 e6=c.endGesture(c.runCommand(e6,{type:'road.add',road:shortCross}).editor);const cid6=e6.project.decisions[0].candidateId;
 assert.match(dm.diamondPlan(e6.project,cid6,dm.diamondDefaults(e6.project,cid6,'M'),ids).error,/ถนนตัด สั้นเกินไป/);}
// 9. Diamond v2 foundation: a curved crossroad must use resolved arc-length stations
// for terminal elevations. A tangent projection is only an approximation and gives
// a nonzero elevation step even though the terminal lies exactly on the crossroad.
{
 const curved={...cross,alignment:'arc',points:[
   {x:0,y:-550},{x:0,y:-180},{x:0,y:0,radius:250},{x:90,y:180},{x:300,y:550}
 ]};
 let ed=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[main]});
 ed=c.endGesture(c.runCommand(ed,{type:'road.add',road:curved}).editor);
 const cid=ed.project.decisions[0]?.candidateId;
 assert.ok(cid,'curved-crossroad crossing detected');
 const params=dm.diamondDefaults(ed.project,cid,'M');
 assert.ok(params,'curved-crossroad defaults');
 const planned=dm.diamondPlan(ed.project,cid,{...params,over:'cross'},ids);
 assert.ok(!planned.error,planned.error);
 const sep=gs.overCommand(ed.project,cid,'C');assert.ok(!sep.error,sep.error);
 const profile=sep.cmd.profiles.C,alignment=ra.resolveAlignment(curved.points,'arc');
 assert.ok(profile&&profile.length>=4,'crossroad has a non-flat grade-separated vertical profile');
 const endpoints=[];
 for(const piece of planned.ramps){
   const off=piece.key.endsWith('Off'),terminal=off?piece.road.points.at(-1):piece.road.points[0];
   const actual=off?piece.road.profile?.at(-1)?.z:piece.road.profile?.[0]?.z;
   const projection=alignment.project(terminal);
   assert.ok(projection.distance<.025,'terminal is on the curved crossroad alignment');
   const expected=elevation.levelAt(profile,projection.station);
   assert.ok(Number.isFinite(actual),'ramp terminal has a defined elevation');
   assert.ok(Math.abs(actual-expected)<=.011,
     piece.key+' must meet curved crossroad at its actual station; expected '+expected+' got '+actual);
   const hit=ra.alignmentIntersections(ra.resolveAlignment(main.points,'chord'),alignment)[0];
   assert.ok(hit);
   const tangent=alignment.tangentAt(hit.stationB),
     approximate=hit.stationB+(terminal.x-hit.point.x)*tangent.x+(terminal.y-hit.point.y)*tangent.y;
   endpoints.push(Math.abs(elevation.levelAt(profile,approximate)-expected));
   assert.equal(piece.road.origin.version,1,'existing generated shape/provenance stays v1');
 }
 assert.ok(endpoints.some(delta=>delta>.011),'regression exercises a real curved-station elevation discrepancy');
}

console.log('PASS 4B-3 diamond: bent main road, short crossroad refused, defaults from level criteria, one batch step, bridge by criteria, ramps attached on traffic sides, 4-leg terminals, undo, remove group, crossroad over, half diamond, refusals');
