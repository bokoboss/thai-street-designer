// Phase 2 slice 1 — road end nodes (ADR-0002, limit L1).
// A road can now end without a junction: RoadLinks may run junction-port → road end
// or road end → road end. Network schema v5; v1–v4 files migrate with no road ends.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const n=T('core/network/network-project.cjs'),rf=T('core/road-first/derive.cjs');

const section=(incoming=2,outgoing=2)=>({incoming,outgoing,median:2,width:3.25,walk:2,bands:[],
  incomingSection:{width:3.25,walk:2,bands:[]},outgoingSection:{width:3.25,walk:2,bands:[]}});
const close=(a,b,msg)=>assert(Math.abs(a-b)<1e-6,`${msg}: ${a} ≠ ${b}`);

// 1. New projects use schema v5 with an empty road-end list.
const demo=n.createNetworkProject();
assert.equal(demo.schemaVersion,5);assert.deepEqual(demo.roadEnds,[]);
assert.equal(n.validateNetworkProject(demo),null);

// 2. v4 files migrate one way with identical geometry.
const v4=structuredClone(demo);v4.schemaVersion=4;delete v4.roadEnds;
const migrated=n.normalizeNetworkProject(JSON.parse(JSON.stringify(v4)));
assert.equal(migrated.schemaVersion,5);assert.deepEqual(migrated.roadEnds,[]);
assert.deepEqual(n.linkPoints(migrated,migrated.links[0]),n.linkPoints(demo,demo.links[0]));
assert.throws(()=>n.normalizeNetworkProject({...JSON.parse(JSON.stringify(demo)),schemaVersion:6}),/ไม่รองรับ/,'future versions are rejected');

// 3. Junction port → road end, with a bend in between.
let p=n.createNetworkProject();
const east={junctionId:'J-2',armId:0},eastPort=n.worldPort(p,east);
const added=n.addRoadEnd(p,{x:eastPort.x+160,y:eastPort.y-90},180,section());
assert.equal(added.error,null);p=added.project;
const end={endId:added.roadEnd.id};
assert.equal(n.isJunctionPort(end),false);assert.equal(n.isJunctionPort(east),true);
assert.equal(n.portKey(end),'end:'+added.roadEnd.id);
const linked=n.connectPorts(p,east,end);
assert.equal(linked.error,null);p=n.setLinkVia(linked.project,linked.link.id,[{x:eastPort.x+80,y:eastPort.y,radius:40}]);
assert.equal(n.validateNetworkProject(p),null);
const tail=p.links.find(l=>l.id===linked.link.id),pts=n.linkPoints(p,tail);
close(pts[0].x,eastPort.x,'link starts at the junction port');close(pts.at(-1).x,eastPort.x+160,'link ends at the road end');close(pts.at(-1).y,eastPort.y-90,'link ends at the road end (y)');
const toSection=n.linkEndSection(p,tail,'to');
assert.deepEqual([toSection.forwardLanes,toSection.backwardLanes,toSection.median],[2,2,2],'road end supplies the section at its end');
assert.deepEqual(n.linkIssues(p,tail).filter(i=>['port-facing','missing-port','alignment'].includes(i.kind)),[]);
const bounds=n.projectBounds(p);assert(bounds.x+bounds.w>eastPort.x+160,'bounds include the road end');

// 4. A road end serves one link only; a road end facing away is rejected.
const second=n.connectPorts(p,{junctionId:'J-2',armId:1},end);
assert(second.error,'road end already used');
const away=n.addRoadEnd(p,{x:eastPort.x+300,y:eastPort.y},0,section());
assert(n.connectPorts(away.project,{junctionId:'J-2',armId:1},{endId:away.roadEnd.id}).error,'road end facing away is rejected');

// 5. Standalone road: road end → road end, no junction.
let s={schemaVersion:5,title:'Standalone',junctions:[],links:[],parallelCorridors:[],roadEnds:[]};
const a=n.addRoadEnd(s,{x:0,y:0},0,section());s=a.project;
const b=n.addRoadEnd(s,{x:200,y:0},180,section(2,2));s=b.project;
const road=n.connectPorts(s,{endId:a.roadEnd.id},{endId:b.roadEnd.id});
assert.equal(road.error,null);s=road.project;
assert.equal(n.validateNetworkProject(s),null);
close(n.linkLength(s,road.link),200,'straight standalone road length');
const fromSection=n.linkEndSection(s,road.link,'from');
assert.deepEqual([fromSection.forwardLanes,fromSection.backwardLanes],[2,2]);

// 6. Round trip, invalid road ends, and deletion.
const restored=n.normalizeNetworkProject(JSON.parse(JSON.stringify(p)));
assert.deepEqual(restored,p,'v5 project round-trips');
const bad=structuredClone(p);bad.roadEnds[0].section.incoming=0;bad.roadEnds[0].section.outgoing=0;
assert(n.validateNetworkProject(bad),'road end needs at least one lane');
const orphan=structuredClone(p);orphan.links[1].to={endId:'E-404'};
assert(n.validateNetworkProject(orphan),'link to a missing road end is invalid');
const withoutEnd=n.removeRoadEnd(p,added.roadEnd.id);
assert.equal(withoutEnd.roadEnds.length,0);assert(!withoutEnd.links.some(l=>l.id===linked.link.id),'removing a road end removes its link');
const withoutJunction=n.removeJunction(p,'J-2');
assert(!withoutJunction.links.some(l=>l.id===linked.link.id),'removing a junction removes links to its ports');
assert.equal(withoutJunction.roadEnds.length,1,'road end itself remains');

// 7. Road-first compile uses road ends: curved tails and unjunctioned roads are drawn.
const sec=(f=2,bk=2)=>({forwardLanes:f,backwardLanes:bk,laneWidth:3.25,median:2,walk:2});
const curved=[
  {id:'R1',name:'ถนนหลัก',points:[{x:-150,y:0},{x:150,y:0}],section:sec()},
  {id:'R2',name:'ถนนโค้งปลายตัน',points:[{x:0,y:-120},{x:0,y:80},{x:90,y:200}],section:sec()},
];
const cc=rf.detectCandidates(curved);
const compiled=rf.compileRoadNetwork(curved,cc.map(c=>({candidateId:c.id,decision:'junction'})),{approachLength:60});
assert.deepEqual(compiled.issues,[],'curved tail no longer dropped');
assert.equal(n.validateNetworkProject(compiled.project),null);
const tailLink=compiled.project.links.find(l=>!n.isJunctionPort(l.to)||!n.isJunctionPort(l.from)&&l.name.includes('โค้ง'));
assert(tailLink,'tail link to a road end exists');
const tailEnd=n.linkPoints(compiled.project,compiled.project.links.find(l=>l.name.startsWith('ถนนโค้งปลายตัน')&&!n.isJunctionPort(l.to)));
close(tailEnd.at(-1).x,90,'tail reaches the road end x');close(tailEnd.at(-1).y,200,'tail reaches the road end y');
const separated=[
  {id:'R1',name:'ถนนบน',points:[{x:-150,y:0},{x:150,y:0}],section:sec()},
  {id:'R2',name:'ถนนล่าง',points:[{x:0,y:-150},{x:0,y:150}],section:sec(1,1)},
];
const gs=rf.compileRoadNetwork(separated,rf.detectCandidates(separated).map(c=>({candidateId:c.id,decision:'grade-separated'})));
assert.deepEqual(gs.issues,[],'grade-separated roads are drawn as standalone roads');
assert.equal(gs.project.junctions.length,0);assert.equal(gs.project.links.length,2);assert.equal(gs.project.roadEnds.length,4);
assert.equal(n.validateNetworkProject(gs.project),null);

console.log('PASS road ends: schema v5 + v4 migration, port→end and end→end links, end sections, facing check, single use, round trip, deletion, road-first curved tails and standalone roads');
