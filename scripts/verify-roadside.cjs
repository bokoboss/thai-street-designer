// Trees and street lights along a road (owner review 2026-10-21, P1-02): one road setting drives the junction arms and the
// links between junctions; the same object list feeds 2D and 3D. Spacing and sizes are the engine's tool defaults.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),lg=T('core/network/network-link-geometry.cjs'),sg=T('core/network/network-scene-geometry.cjs'),ob=T('core/junction/objects.cjs'),cmp=T('core/road-first/compare.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2.5};
let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[
  {id:'R1',name:'ถนนหลัก',points:[{x:-300,y:0},{x:300,y:0}],section:sec},{id:'R2',name:'ถนนรอง',points:[{x:0,y:-200},{x:0,y:200}],section:sec}]});
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
run({type:'road.add',road:{id:'R3',name:'tmp',points:[{x:900,y:900},{x:950,y:900}],section:sec}});run({type:'road.remove',roadId:'R3'});
const comp=()=>rp.compileRoadFirstProject(e.project),r1Links=()=>comp().project.links.filter(l=>comp().sources.links[l.id]==='R1');
// Nothing by default.
assert.ok(r1Links().every(l=>!lg.resolveLinkSectionGeometry(comp().project,l).objects.length));
const r=run({type:'road.setRoadside',roadId:'R1',roadside:{trees:true,lights:true}});assert.match(r.label,/ต้นไม้และเสาไฟ ถนนหลัก/);
// Links: trees and lights on both sidewalks, inside the link, alternating with the default spacing.
const g=lg.resolveLinkSectionGeometry(comp().project,r1Links()[0]),objs=g.objects;
assert.ok(objs.some(o=>o.kind==='tree')&&objs.some(o=>o.kind==='light'),'trees and lights on the link');
assert.ok(objs.some(o=>o.side===1)&&objs.some(o=>o.side===-1),'both sides');
const trees=objs.filter(o=>o.kind==='tree'&&o.side===1).map(o=>o.station).sort((a,b)=>a-b);
assert.ok(trees.slice(1).every((s,i)=>Math.abs(s-trees[i]-15)<.01),'default spacing 15 m');
assert.ok(objs.every(o=>Math.abs(Math.abs(o.offset)-(sec.median/2+2*sec.laneWidth+.5))<.01),'on the sidewalk, 0.5 m from its inner edge');
// Junction arms of R1 carry the same setting; R2 arms stay bare.
const j=comp().project.junctions[0],legs=comp().legs;
const objsOf=road=>ob.roadObjects(j.design).filter(o=>legs.some(l=>l.roadId===road&&l.armId===o.arm));
assert.ok(objsOf('R1').length>0,'junction arms of the road have objects');assert.equal(objsOf('R2').length,0,'other road unchanged');
// 3D: furniture faces include the link objects.
const before=sg.resolveJunctionSceneFaces(comp().project).length;assert.ok(sg.resolveRoadLinkSceneFaces(comp().project).length>0,'link furniture in 3D');
assert.ok(before>0,'junction furniture in 3D');
// No sidewalk: nothing on links (as at junctions).
run({type:'road.setSection',roadId:'R1',patch:{walk:.5}});assert.ok(r1Links().every(l=>!lg.resolveLinkSectionGeometry(comp().project,l).objects.length));
run({type:'road.setSection',roadId:'R1',patch:{walk:2.5}});
// File round trip, validation, comparison, undo.
assert.deepEqual(rp.normalizeRoadFirstProject(JSON.parse(JSON.stringify(e.project))).roads[0].roadside,{trees:true,lights:true});
assert.match(rp.validateRoadFirstProject({...e.project,roads:e.project.roads.map(x=>x.id==='R1'?{...x,roadside:{trees:'yes'}}:x)}),/ต้นไม้/);
const prev=structuredClone(e.project);run({type:'road.setRoadside',roadId:'R1',roadside:null});
assert.ok(cmp.compareScenarios(prev,e.project).deltas.find(d=>d.target.id==='R1').changes.includes('ต้นไม้และเสาไฟ'));
e=c.undo(e).editor;assert.deepEqual(e.project.roads[0].roadside,{trees:true,lights:true});
console.log('PASS roadside trees and lights: road setting → links and junction arms, both sides, default spacing, 3D faces, no sidewalk, file, comparison, undo');
