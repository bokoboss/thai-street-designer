// Left-hand traffic on the plan (y down): a road's forward lanes run on the left of its drawing direction, on the same
// side as the junction arm lanes they connect to. Regression for links drawn mirrored against their junctions (2026-10-22).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const rp=T('core/road-first/project.cjs'),lg=T('core/network/network-link-geometry.cjs'),al=T('core/common/alignment.cjs'),geo=T('core/junction/geometry.cjs');
const sec=(f,b)=>({forwardLanes:f,backwardLanes:b,laneWidth:3,median:2,walk:0});
const p={kind:'road-first',schemaVersion:1,title:'t',options:{},roads:[{id:'A',name:'A',points:[{x:-200,y:0},{x:200,y:0}],section:sec(3,1)},{id:'B',name:'B',points:[{x:0,y:-200},{x:0,y:200}],section:sec(1,1)}],
  decisions:[]};
const cand=T('core/road-first/derive.cjs').detectCandidates(p.roads)[0];p.decisions=[{candidateId:cand.id,decision:'junction',roads:['A','B']}];
const c=rp.compileRoadFirstProject(p),west=c.project.links.find(l=>c.sources.links[l.id]==='A'&&('endId' in l.from)),g=lg.resolveLinkSectionGeometry(c.project,west);
// Eastbound link: forward (3 lanes, wider side) is on top (y < 0) on a y-down plan.
const fwd=al.profiledParallel(g.points,g.left)[0],bwd=al.profiledParallel(g.points,g.right.map(v=>-v))[0];
assert.ok(fwd.y<0&&bwd.y>0,'forward lanes on the left of travel');assert.ok(Math.abs(fwd.y)>Math.abs(bwd.y),'the three forward lanes are the wider side');
// The junction's west arm takes those three lanes as incoming, on the same side: arm-local +y (incoming) rotated by 180° = world -y.
const j=c.project.junctions[0],leg=c.legs.find(l=>l.roadId==='A'&&l.side==='behind'),arm=j.design.arms[leg.armId];
assert.equal(arm.incoming,3);assert.ok(Math.abs(Math.abs(arm.angle)-180)<1e-6);
const incomingY=Math.cos(arm.angle*Math.PI/180)*geo.carriageWidth(arm,1); // y of arm-local (0, width) after rotation
assert.ok(incomingY<0&&Math.abs(Math.abs(incomingY)-(Math.abs(fwd.y)-1))<1.01,'link and junction arm agree on the side of the forward lanes');
console.log('PASS lane side: forward lanes left of travel on the plan, same side as the junction arm');
