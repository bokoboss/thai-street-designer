const assert=require('node:assert/strict'),path=require('path');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const pr=T('core/road-first/project.cjs'),up=T('core/road-first/alignment-upgrade.cjs'),cmd=T('core/road-first/commands.cjs'),a=T('core/common/resolved-alignment.cjs');
const d=T('core/road-first/derive.cjs'),net=T('core/network/network-project.cjs'),ramps=T('core/road-first/ramps.cjs');
const geo=T('core/road-first/geometry-digest.cjs'),sc=T('core/road-first/scenarios.cjs'),snap=T('core/road-first/snap.cjs');
const section={forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:4,walk:2};
const base={kind:'road-first',schemaVersion:1,title:'migration',roads:[{id:'A',name:'A',points:[{x:0,y:0},{x:1000,y:0,radius:200},{x:1000,y:1000}],section,profile:[{station:0,z:0},{station:1000,z:10},{station:2000,z:0}],openings:[{id:'M',station:1200,length:10}],origin:{template:'diamond',version:1,group:'g',params:{keep:'authored'}}}],decisions:[],options:{}};
const golden=require('./fixtures/alignment-legacy.json'),crypto=require('crypto');
assert.equal(crypto.createHash('sha256').update(JSON.stringify(geo.networkDigest(pr.compileRoadFirstProject(pr.normalizeRoadFirstProject(golden.project)).project))).digest('hex'),golden.digestSha256,'actual base SHA geometry golden');
const original=JSON.stringify(base),before=pr.compileRoadFirstProject(base);
const loaded=pr.normalizeRoadFirstProject(JSON.parse(original));assert.deepEqual(pr.compileRoadFirstProject(loaded),before,'legacy compile is unchanged');assert.equal(loaded.schemaVersion,1);
const preview=up.previewAlignmentUpgrade(base);assert.deepEqual(preview.errors,[]);assert.equal(JSON.stringify(base),original,'preview never mutates source');
assert.equal(preview.project.roads[0].profile.length,3);assert.deepEqual(preview.project.roads[0].origin,base.roads[0].origin,'no template regeneration');
assert.ok(preview.project.roads[0].profile[2].station<2000);assert.equal(preview.project.roads[0].profile[1].z,10);
const upgraded=pr.normalizeRoadFirstProject(JSON.parse(JSON.stringify(preview.project)));
assert.deepEqual(geo.networkDigest(pr.compileRoadFirstProject(upgraded).project),geo.networkDigest(pr.compileRoadFirstProject(preview.project).project));
const link=pr.compileRoadFirstProject(upgraded).project.links[0],compiled=pr.compileRoadFirstProject(upgraded).project;
assert.ok(Math.abs(net.linkLength(compiled,link)-a.resolveAlignment(upgraded.roads[0].points).length)<1e-6);
const exported=net.normalizeNetworkProject(JSON.parse(JSON.stringify(compiled)));
assert.deepEqual(net.linkPoints(exported,exported.links[0]),net.linkPoints(compiled,link),'compiled network round trip retains exact alignment');
const malformed=structuredClone(compiled);malformed.links[0].alignment.from=-1;
assert.throws(()=>net.normalizeNetworkProject(malformed),'invalid alignment slice is rejected');
let editor=cmd.createEditor(base),result=cmd.runCommand(editor,{type:'project.upgradeAlignment'});assert.equal(result.result.error,null);editor=cmd.endGesture(result.editor);
assert.deepEqual(cmd.undo(editor).editor.project,base);assert.deepEqual(cmd.redo(cmd.undo(editor).editor).editor.project,editor.project);
const workspace=sc.createWorkspace(base),alt=sc.duplicateScenario(workspace).workspace;
const changed=sc.replaceScenarioProject(alt,alt.activeScenarioId,upgraded),roundTrip=sc.normalizeWorkspace(JSON.parse(JSON.stringify(changed)));
assert.deepEqual(roundTrip.scenarios[0].project,base);assert.deepEqual(roundTrip.scenarios[1].project,upgraded);
// Same-level phantom crossing vanishes but its complete authored decision survives dormant.
const phantom=structuredClone(base);phantom.roads[0].points=[{x:0,y:0},{x:100,y:0,radius:40},{x:100,y:100}];delete phantom.roads[0].profile;delete phantom.roads[0].openings;
phantom.roads.push({id:'B',name:'B',section,points:[{x:95,y:-100},{x:95,y:5}]});
phantom.decisions=[{candidateId:'C-A+B-1',decision:'grade-separated',over:'A',name:'keep me',treatments:{corner:12}}];
const ph=up.previewAlignmentUpgrade(phantom);assert.deepEqual(ph.errors,[]);assert.ok(ph.project.decisions[0].candidateId.startsWith('dormant:'));assert.equal(ph.project.decisions[0].treatments.corner,12);
// Arc-only crossing appears and remains unresolved, never silently creates a junction.
phantom.roads[1].points=[{x:80,y:2},{x:80,y:100}];phantom.decisions=[];
const ar=up.previewAlignmentUpgrade(phantom);assert.deepEqual(ar.errors,[]);assert.equal(d.detectCandidates(ar.project.roads).length,1);assert.equal(ar.project.decisions.length,0);
const road=ar.project.roads[0],at=a.resolveAlignment(road.points).pointAt(90),sn=snap.snapPoint(at,[road],{pxPerMetre:1});
assert.equal(sn.kind,'road');assert.ok(Math.hypot(sn.point.x-at.x,sn.point.y-at.y)<1e-7);
// Anchor stations and geometry are remapped together; both traffic sides follow the same exact tangent.
const anchored=structuredClone(base);delete anchored.roads[0].origin;
for(const side of [1,-1]){const main=anchored.roads[0],anchor={roadId:'A',station:1000,side},p=ramps.anchorPoint(main,anchor);
 anchored.roads.push({id:'R'+side,name:'ramp',role:'ramp',section:ramps.RAMP_SECTION,points:[p,{x:p.x+100*side,y:p.y+50}],anchors:{start:anchor}});}
const an=up.previewAlignmentUpgrade(anchored);assert.deepEqual(an.errors,[]);
for(const ramp of an.project.roads.slice(1)){assert.deepEqual(ramp.points[0],ramps.anchorPoint(an.project.roads[0],ramp.anchors.start));assert.equal(ramp.anchors.start.side,anchored.roads.find(r=>r.id===ramp.id).anchors.start.side);}
// Link-local lane/width state is retained and remapped, including transition bounds.
const linked=structuredClone(base);linked.roads[0].links=[{sectionProfile:{mode:'linear',forwardLaneTransition:{side:'curb',center:400,length:100}},components:[{id:'walk',kind:'width',direction:'forward',target:'walk',start:100,end:1500,taperIn:20,taperOut:30,delta:1}]}];
const lu=up.previewAlignmentUpgrade(linked);assert.deepEqual(lu.errors,[]);assert.equal(lu.project.roads[0].links[0].components.length,1);
const lc=lu.project.roads[0].links[0].components[0];assert.equal(lc.id,'walk');assert.ok(lc.end>lc.start&&lc.taperIn>0&&lc.taperOut>0);assert.equal(lc.delta,1);assert.ok(lu.project.roads[0].links[0].sectionProfile.forwardLaneTransition.length>0);
assert.deepEqual(pr.compileRoadFirstProject(pr.normalizeRoadFirstProject(JSON.parse(JSON.stringify(lu.project)))),pr.compileRoadFirstProject(lu.project));
// Reversing the road reference and traffic-side sign preserves the physical attachment.
const forward=an.project.roads[0],length=a.resolveAlignment(forward.points).length;
const reversed={...forward,points:[...forward.points].reverse()};
for(const side of [1,-1]){const anchor={roadId:forward.id,station:900,side};const p=ramps.anchorPoint(forward,anchor),q=ramps.anchorPoint(reversed,{...anchor,station:length-900,side:-side});assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<1e-6);}
// Plan/section/3D consume the same points; the analytic crossing lies on the rendered slice within 1 mm.
const geom=T('core/network/network-link-geometry.cjs');
const check=structuredClone(ar.project);check.roads[0].profile=[{station:0,z:6}];check.decisions=[{candidateId:d.detectCandidates(check.roads)[0].id,decision:'grade-separated',over:'A'}];
const cross=pr.compileRoadFirstProject(check),hit=cross.crossings[0].point,lk=cross.project.links.find(l=>cross.sources.links[l.id]==='A');
const points=net.linkPoints(cross.project,lk),proj=T('core/common/alignment.cjs').projectAlignment(points,hit);assert.ok(proj.distance<.0011);
const sectionGeometry=geom.resolveLinkSectionGeometry(cross.project,lk);assert.deepEqual(sectionGeometry.points,points);assert.ok(sectionGeometry.z.every(z=>z===6));
// Failed migration is atomic and reports the affected object.
const bad=structuredClone(base);bad.roads[0].profile=[{station:999.99,z:0},{station:1000,z:1}];
const blocked=up.previewAlignmentUpgrade(bad);assert.ok(blocked.errors.length);const fail=cmd.runCommand(cmd.createEditor(bad),{type:'project.upgradeAlignment'});assert.ok(fail.result.error);assert.deepEqual(fail.editor.project,bad);
// New road projects use exact curves, older projects keep their previous editing behaviour.
const fresh=cmd.runCommand(cmd.createEditor({kind:'road-first',schemaVersion:2,title:'new',roads:[],decisions:[],options:{}}),{type:'road.add',road:{id:'L',name:'L',section,points:[{x:0,y:0},{x:1000,y:0,radius:300},{x:1000,y:1000}]}});
assert.equal(fresh.result.error,null);assert.equal(fresh.editor.project.roads[0].alignment,'arc');
const curves=T('core/road-first/curves.cjs'),freshRoad=fresh.editor.project.roads[0];
assert.equal(curves.radiusFromPoint(freshRoad.points,1,curves.curveHandle(freshRoad.points,1,0),'arc'),300,'radius handle agrees with numeric radius above 200 m');
console.log('PASS alignment upgrade: legacy fidelity, stations/PVI/openings/anchors, dormant crossings, scenarios, save/reopen, one undo, failed conversion atomic, new project curves');
