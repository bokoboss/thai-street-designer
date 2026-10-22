// Phase 4B-1 — ramps drawn by hand: diverge / merge anchors on the side of a road (docs/spec/PHASE_4B_RAMPS.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),rm=T('core/road-first/ramps.cjs'),lg=T('core/network/network-link-geometry.cjs'),n=T('core/network/network-project.cjs'),sg=T('core/network/network-scene-geometry.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:0};
const ramp=(id,points,extra={})=>({id,name:id,role:'ramp',points,section:{...rm.RAMP_SECTION},...extra});
const editor=roads=>c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads});
let e=editor([{id:'M',name:'ถนนหลัก',points:[{x:-300,y:0},{x:300,y:0}],section:sec}]);
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const fails=(cmd,re)=>{const x=c.runCommand(e,cmd);assert.ok(x.result.error,'expected refusal: '+cmd.type);assert.match(x.result.error,re);};
const R=id=>e.project.roads.find(r=>r.id===id);
const comp=()=>rp.compileRoadFirstProject(e.project);
const edge=1.5+2*3.25; // median/2 + two lanes (the side the ramp leaves from)

// Main road eastbound on a y-down plan: its forward lanes (and the ramps leaving with them) are on the top side (y < 0).
// 1. Diverge: a ramp started on the main road at a shallow angle attaches to the edge of the travel side; no junction.
const r1=run({type:'road.add',road:ramp('X1',[{x:-100,y:0},{x:0,y:-40},{x:100,y:-60}])});
assert.equal(r1.autoJunctions.length,0,'no junction at a diverge');assert.match(r1.label,/แยกออกจาก ถนนหลัก/);
assert.deepEqual(R('X1').anchors.start,{roadId:'M',station:200,side:1});
assert.ok(Math.abs(R('X1').points[0].x+100)<1e-6&&Math.abs(R('X1').points[0].y+edge)<1e-6,'start snapped to the edge');
assert.equal(comp().project.junctions.length,0);
// Compiled: the ramp link is flagged, drawn before the main road, and the diverge has a taper.
{const P=comp().project,link=P.links.find(l=>comp().sources.links[l.id]==='X1');assert.equal(link.ramp,true);
 assert.equal(lg.linksInDrawOrder(P)[0].id,link.id,'ramp under the main road at the same level');
 assert.equal(P.rampTapers.length,1);assert.equal(n.validateNetworkProject(P),null);
 assert.ok(sg.resolveRoadLinkSceneSurfaces(P).some(s=>s.id.startsWith('taper:')),'taper in 3D');}
// 2. One undo removes the ramp.
{const u=c.undo(e).editor;assert.equal(u.project.roads.length,1);}
// 3. Main road moved: the ramp end follows the edge deterministically.
run({type:'road.movePoint',roadId:'M',index:0,point:{x:-300,y:-10}});run({type:'road.movePoint',roadId:'M',index:1,point:{x:300,y:-10}});
assert.ok(Math.abs(R('X1').points[0].y+(10+edge))<1e-6,'ramp start follows the main road');assert.ok(Math.abs(R('X1').anchors.start.station-200)<1e-6);
const a=JSON.stringify(rp.compileRoadFirstProject(e.project)),b=JSON.stringify(rp.compileRoadFirstProject(e.project));assert.equal(a,b);
// 4. Main road level: the anchored end takes the main road level.
run({type:'road.setProfile',roadId:'M',profile:[{station:0,z:5},{station:600,z:5}]});
assert.equal(R('X1').profile[0].station,0);assert.equal(R('X1').profile[0].z,5,'diverge at the main road level');
run({type:'road.setProfile',roadId:'M',profile:null});
// 5. Sliding: dragging the anchored end along the main road moves the anchor; dragging it away detaches.
run({type:'road.movePoint',roadId:'X1',index:0,point:{x:-150,y:-12}});assert.ok(Math.abs(R('X1').anchors.start.station-150)<1e-6,'anchor slides');
run({type:'road.movePoint',roadId:'X1',index:0,point:{x:-150,y:-90}});assert.equal(R('X1').anchors,undefined,'dragged away: detached');
run({type:'road.movePoint',roadId:'X1',index:0,point:{x:-100,y:-10}});assert.ok(R('X1').anchors?.start,'dragged back: attached again');
// 6. Merge: the ramp end joins the main road travelling the same way.
const m2=run({type:'road.add',road:ramp('X2',[{x:100,y:-100},{x:150,y:-50},{x:250,y:-10}])});assert.match(m2.label,/เข้าสู่ ถนนหลัก/);
{const x2=R('X2');assert.ok(x2.anchors?.end,'merge attached');assert.equal(x2.anchors.end.side,1);assert.ok(Math.abs(x2.points.at(-1).y+(10+edge))<1e-6);}
// 7. Refusals (red preview reasons).
fails({type:'road.add',road:ramp('W',[{x:100,y:-10},{x:0,y:-50}])},/สวนทิศ/);
fails({type:'road.add',road:ramp('S',[{x:-90,y:-10},{x:0,y:-45}])},/ใกล้จุดเชื่อมทางลาด/);
fails({type:'road.setSection',roadId:'X1',patch:{backwardLanes:1}},/ทางเดียว/);
// 8. A steep end is an ordinary junction (diamond ramp terminal), not a merge.
{const x=c.runCommand(e,{type:'road.add',road:ramp('T',[{x:-250,y:-120},{x:-250,y:-10}])});assert.equal(x.result.error,null);assert.equal(x.result.autoJunctions.length,1);assert.equal(x.editor.project.roads.find(r=>r.id==='T').anchors,undefined);}
// 9. Too close to a junction on the main road.
run({type:'road.add',road:{id:'K',name:'ถนนตัด',points:[{x:-250,y:200},{x:-250,y:-200}],section:sec}});assert.equal(comp().project.junctions.length,1);
fails({type:'road.add',road:ramp('J',[{x:-235,y:-10},{x:-150,y:-40}])},/ใกล้ทางแยก/);
// Extending the main road at its start shifts stations but not the ramp.
{const before={...R('X1').points[0]},st=R('X1').anchors.start.station;run({type:'road.extend',roadId:'M',atStart:true,points:[{x:-400,y:-10}]});
 assert.ok(Math.abs(R('X1').anchors.start.station-(st+100))<1e-3,'station follows the extension');assert.ok(Math.hypot(R('X1').points[0].x-before.x,R('X1').points[0].y-before.y)<1e-3,'ramp stays in place');}
// 10. Detach command keeps the point and drops the anchor; removing the main road drops its anchors.
run({type:'ramp.detach',roadId:'X2',end:'end'});assert.equal(R('X2').anchors,undefined);
run({type:'road.remove',roadId:'M'});assert.equal(R('X1').anchors,undefined,'main road removed: anchor dropped');
// 11. Old files and validation.
assert.equal(rp.validateRoadFirstProject({...e.project,roads:[...e.project.roads,ramp('Q',[{x:0,y:0},{x:1,y:-1}],{anchors:{start:{roadId:'none',station:0,side:1}}})]}),'จุดเชื่อมทางลาด Q ไม่ถูกต้อง');
// 12. Draw order: a road below ground is drawn before the road at grade that passes over it.
{const P={schemaVersion:5,title:'t',junctions:[],parallelCorridors:[],roadEnds:[],links:[{id:'A',levels:[{station:0,z:0}]},{id:'B',levels:[{station:0,z:-6}]}]};assert.deepEqual(lg.linksInDrawOrder(P).map(l=>l.id),['B','A']);}
// 13. Attachment matrix (research review 2026-10-22): diverge / merge × both sides × main road drawn either way.
// Left-hand traffic on a y-down plan: eastbound on top (y < 0), westbound on the bottom (y > 0).
for(const reversed of [false,true]){
  const main=reversed?[{x:300,y:0},{x:-300,y:0}]:[{x:-300,y:0},{x:300,y:0}];
  const cases=[['diverge eastbound',[{x:-100,y:0},{x:0,y:-40}],'start',-1],['merge eastbound',[{x:0,y:-40},{x:100,y:0}],'end',-1],
    ['diverge westbound',[{x:100,y:0},{x:0,y:40}],'start',1],['merge westbound',[{x:0,y:40},{x:-100,y:0}],'end',1]];
  for(const [name,points,end,ySign] of cases){
    const x=c.runCommand(editor([{id:'M',name:'ถนนหลัก',points:main,section:sec}]),{type:'road.add',road:ramp('X',points)});
    assert.equal(x.result.error,null,`${name} (${reversed?'reversed':'forward'})`);assert.equal(x.result.autoJunctions.length,0);
    const r=x.editor.project.roads.find(q=>q.id==='X'),i=end==='start'?0:r.points.length-1;
    assert.ok(r.anchors?.[end],`${name}: attached`);assert.equal(Math.sign(r.points[i].y),ySign,`${name}: on its traffic side`);
  }
  const wrong=c.runCommand(editor([{id:'M',name:'ถนนหลัก',points:main,section:sec}]),{type:'road.add',road:ramp('X',[{x:-100,y:0},{x:0,y:40}])});
  assert.match(wrong.result.error,/สวนทิศ/,'eastbound ramp on the westbound side refused');
}
console.log('PASS 4B-1 ramps: attachment matrix (both sides, both directions), diverge/merge anchors, no junction, follows the main road, level, slide/detach, refusals, steep end = junction, taper, draw order');
