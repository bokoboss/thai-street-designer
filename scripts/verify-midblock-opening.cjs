// Mid-block median opening / U-turn on a road (UX closure before Phase 4A, GW-04): authored in road stations,
// compiled onto the link it falls in (link-local stations), drawn as a cut in the median island in 2D, 3D and export.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),ro=T('core/road-first/road-openings.cjs'),lg=T('core/network/network-link-geometry.cjs'),sg=T('core/network/network-scene-geometry.cjs'),cmp=T('core/road-first/compare.cjs'),n=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'R1',name:'ถนนหลัก',points:[{x:0,y:0},{x:400,y:0}],section:sec}]});
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const comp=()=>rp.compileRoadFirstProject(e.project);
// A road with no junction is one link from station 0.
const road=()=>e.project.roads.find(r=>r.id==='R1');
const made=ro.newRoadOpening(road(),comp(),'uturn');assert.ok(made.opening,made.error);
assert.equal(made.opening.type,'uturn');assert.equal(made.opening.length,8);
assert.ok(Math.abs(made.opening.station+made.opening.length/2-200)<1,'placed at the middle of the free stretch');
const r=run({type:'road.setOpenings',roadId:'R1',openings:[made.opening]});assert.match(r.label,/ช่องเปิดเกาะกลาง ถนนหลัก/);
let link=comp().project.links[0];assert.equal(link.medianOpenings.length,1);
assert.ok(Math.abs(link.medianOpenings[0].start-made.opening.station)<.01,'link-local station = road station on a single-link road');
let g=lg.resolveLinkSectionGeometry(comp().project,link),strips=lg.medianIslandStrips(g);
assert.equal(strips.length,2,'median island cut in two');
assert.ok(Math.abs(strips[0].points.at(-1).x-made.opening.station)<.01&&Math.abs(strips[1].points[0].x-(made.opening.station+8))<.01,'cut exactly at the opening ends');
assert.equal(sg.resolveRoadLinkSceneSurfaces(comp().project).filter(s=>s.kind==='median').length,2,'3D median in two pieces');
assert.equal(n.validateNetworkProject(comp().project),null);
// Handle ↔ station round trip; drag clamps inside the road.
const h=ro.roadOpeningHandle(road(),road().openings[0]);assert.equal(ro.roadOpeningStationFromPoint(road(),road().openings[0],h),road().openings[0].station);
assert.equal(ro.roadOpeningStationFromPoint(road(),road().openings[0],{x:-50,y:0}),0);
// A crossing road makes two links; the opening is carried to the link it falls in with link-local station.
run({type:'road.add',road:{id:'R2',name:'ถนนรอง',points:[{x:100,y:-150},{x:100,y:150}],section:sec}});
const links=comp().project.links.filter(l=>comp().sources.links[l.id]==='R1');assert.equal(links.length,2);
const carrying=links.find(l=>l.medianOpenings?.length);assert.ok(carrying,'opening still compiled');
const start=n.linkPoints(comp().project,carrying)[0];
assert.ok(Math.abs(start.x+carrying.medianOpenings[0].start-made.opening.station)<.5,'link-local start measured from the link start');
assert.equal(comp().issues.filter(i=>/ช่องเปิด/.test(i)).length,0);
// Moved into the junction approach: reported, not drawn.
const near={...road().openings[0],station:95};
run({type:'road.setOpenings',roadId:'R1',openings:[near]});
assert.ok(comp().issues.some(i=>/ช่องเปิดเกาะกลาง.*ช่วงเข้าทางแยก/.test(i)),'opening in an approach is reported');
assert.ok(comp().project.links.every(l=>!l.medianOpenings?.length));
// No median: reported.
run({type:'road.setOpenings',roadId:'R1',openings:[{...near,station:250}]});
run({type:'road.setSection',roadId:'R1',patch:{median:0}});
assert.ok(comp().issues.some(i=>/ไม่มีเกาะกลาง/.test(i)));
run({type:'road.setSection',roadId:'R1',patch:{median:3}});
// Overlap refused by the engine; file round trip; validation; comparison; undo.
const two=[{id:'o1',station:250,length:6},{id:'o2',station:253,length:6}];
assert.match(c.runCommand(e,{type:'road.setOpenings',roadId:'R1',openings:two}).result.error??'',/ซ้อน/);
const stored=rp.normalizeRoadFirstProject(JSON.parse(JSON.stringify(e.project)));assert.equal(stored.roads.find(x=>x.id==='R1').openings.length,1);
assert.match(rp.validateRoadFirstProject({...e.project,roads:e.project.roads.map(x=>x.id==='R1'?{...x,openings:[{id:'x',station:-1,length:6}]}:x)}),/ช่องเปิด/);
const before=structuredClone(e.project);run({type:'road.setOpenings',roadId:'R1',openings:[]});
assert.ok(cmp.compareScenarios(before,e.project).deltas.find(d=>d.target.id==='R1').changes.includes('ช่องเปิดเกาะกลาง'));
e=c.undo(e).editor;assert.equal(road().openings.length,1);
// Extending the road at its start keeps the opening where it was on the ground.
{
  const at=()=>{const r=road(),o=r.openings[0];return T('core/road-first/derive.cjs').pointAt(r.points,o.station);};
  const before=at();run({type:'road.extend',roadId:'R1',atStart:true,points:[{x:0,y:0},{x:-60,y:0}]});
  const after=at();assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<.01,'opening stays put when the start is extended');
}
// Joining roads drawn end to end keeps every opening in place (ids stay unique).
{
  let j=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[
    {id:'A',name:'A',points:[{x:0,y:0},{x:200,y:0}],section:sec,openings:[{id:'m1',station:50,length:6}]},
    {id:'B',name:'B',points:[{x:400,y:0},{x:200,y:0}],section:sec,openings:[{id:'m1',station:50,length:6}]}]});
  const x=c.runCommand(j,{type:'road.join',roadId:'A',otherId:'B'});assert.equal(x.result.error,null,x.result.error);
  const o=x.editor.project.roads[0].openings;assert.deepEqual(o.map(v=>v.id),['m1','m1-2']);
  assert.ok(Math.abs(o[0].station-50)<.01&&Math.abs(o[1].station-344)<.01,JSON.stringify(o));
}
console.log('PASS mid-block median opening: placed in the free stretch, link-local compile, median cut in 2D/3D, approach and no-median reported, overlap refused, file, comparison, undo');
