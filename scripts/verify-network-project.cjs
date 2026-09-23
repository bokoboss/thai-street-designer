const ts=require('typescript'),fs=require('fs'),assert=require('node:assert/strict');

for(const file of ['allocation.ts','planting.ts','cross-section.ts','roundabout.ts','slip-model.ts','model.ts','geometry.ts','slip-geometry.ts','design-validation.ts','lane-configuration.ts','arrow-layout.ts']){
  const code=ts.transpileModule(fs.readFileSync('app/junction/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}})
    .outputText.replace(/require\("\.\/([a-z-]+)"\)/g,'require("./$1.cjs")');
  fs.writeFileSync('.sites-runtime/'+file.replace(/\.ts$/,'.cjs'),code);
}
const projectCode=ts.transpileModule(fs.readFileSync('lib/network-project.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}})
  .outputText.replace(/require\("\.\.\/app\/junction\/([a-z-]+)"\)/g,'require("./$1.cjs")').replace(/require\("\.\/alignment"\)/g,'require("./network-alignment.cjs")');
fs.writeFileSync('.sites-runtime/network-project.cjs',projectCode);

const n=require('../.sites-runtime/network-project.cjs');

let p=n.createNetworkProject();
assert.equal(p.schemaVersion,1);
assert.equal(p.junctions.length,2);
assert.equal(p.links.length,1);
assert.equal(n.validateNetworkProject(p),null);
const link=p.links[0],a=p.junctions[0],b=p.junctions[1],points=n.linkPoints(p,link);
assert.deepEqual(points[0],n.portPoint(a,0));
assert.deepEqual(points.at(-1),n.portPoint(b,2));
assert.equal(n.linkIssues(p,link).length,0,'default linked junctions must be section-compatible');
assert.equal(n.portDistance(a,0),a.design.arms[0].length,'Network port must use the actual semantic Arm length');
const directBefore=n.linkPoints(p,link)[0],direct=n.updateJunctionArmGeometry(p,a.id,0,a.design.arms[0].angle,120);
assert.equal(direct.error,null);assert.equal(direct.project.junctions[0].design.arms[0].length,120);
const directAfter=n.linkPoints(direct.project,direct.project.links[0])[0];assert(Math.hypot(directAfter.x-directBefore.x,directAfter.y-directBefore.y)>20,'stretching an Arm must move the attached Road Link endpoint');
const laneEdit=n.updateJunctionArmBasics(p,a.id,0,{incoming:3});assert.equal(laneEdit.error,null);assert.equal(laneEdit.project.junctions[0].design.arms[0].incoming,3);assert(n.linkIssues(laneEdit.project,laneEdit.project.links[0]).some(v=>v.kind==='lane-count'),'direct lane editing must reuse Road Link semantic mismatch review');
const controlEdit=n.updateJunctionArmBasics(p,a.id,0,{crossing:false,signal:false,stop:true});assert.equal(controlEdit.error,null);assert.equal(controlEdit.project.junctions[0].design.arms[0].crossing,false);assert.equal(controlEdit.project.junctions[0].design.arms[0].signal,false);
const linkedLegOff=n.setJunctionArmEnabled(p,a.id,0,false);assert(linkedLegOff.error&&/Road Link/.test(linkedLegOff.error),'a linked Arm must not be disabled from Network quick editing');
const threeLeg=n.setJunctionArmEnabled(p,a.id,1,false);assert.equal(threeLeg.error,null);assert.equal(threeLeg.project.junctions[0].design.enabled.filter(Boolean).length,3);
const tooFew=n.setJunctionArmEnabled(threeLeg.project,a.id,3,false);assert(tooFew.error&&/อย่างน้อย 3 ขา/.test(tooFew.error));
const fourLeg=n.setJunctionArmEnabled(threeLeg.project,a.id,1,true);assert.equal(fourLeg.error,null);assert.equal(fourLeg.project.junctions[0].design.enabled.filter(Boolean).length,4);
const sectionEdit=n.updateJunctionArmSection(p,a.id,0,'incoming',{width:3.5,walk:2.5,bands:[{id:'quick-bike',type:'bike',width:1.5},{id:'quick-buffer',type:'buffer',width:.5}]});assert.equal(sectionEdit.error,null);const sectionArm=sectionEdit.project.junctions[0].design.arms[0];assert.equal(sectionArm.incomingSection.width,3.5);assert.equal(sectionArm.incomingSection.walk,2.5);assert.deepEqual(sectionArm.incomingSection.bands.map(v=>v.type),['bike','buffer']);
const pocketEdit=n.updateJunctionArmPocket(p,a.id,0,'incoming','right',{lanes:1,length:25,taper:15});assert.equal(pocketEdit.error,null);const pocketArm=pocketEdit.project.junctions[0].design.arms[0];assert.equal(pocketArm.incomingPockets.right.lanes,1);assert.equal(pocketArm.laneMarkings.incomingAux.right.length,1);assert.equal(pocketArm.laneMarkings.incomingAux.right[0],'right');
const directional=structuredClone(p),dirA=directional.junctions[0].design.arms[0],dirB=directional.junctions[1].design.arms[2];
dirA.outgoingSection={width:3.5,walk:2,bands:[]};dirB.incomingSection={width:3.5,walk:2,bands:[]};
assert.equal(n.linkEndSection(directional,directional.links[0],'from').forwardLaneWidth,3.5);
assert.equal(n.linkEndSection(directional,directional.links[0],'to').forwardLaneWidth,3.5);
assert(!n.linkIssues(directional,directional.links[0]).some(v=>v.kind==='lane-width'),'matching directional section widths must remain compatible');
dirB.incomingSection={width:3.25,walk:2,bands:[]};
assert(n.linkIssues(directional,directional.links[0]).some(v=>v.kind==='lane-width'),'Road Link width review must use directional Junction sections, not Arm.width');
const edgeSections=structuredClone(p),edgeA=edgeSections.junctions[0].design.arms[0],edgeB=edgeSections.junctions[1].design.arms[2];
edgeA.outgoingSection={width:3.25,walk:2.5,bands:[{id:'bike-a',type:'bike',width:1.5},{id:'buf-a',type:'buffer',width:.5}]};
edgeB.incomingSection={width:3.25,walk:2.5,bands:[{id:'bike-b',type:'bike',width:1.5},{id:'buf-b',type:'buffer',width:.5}]};
assert(!n.linkIssues(edgeSections,edgeSections.links[0]).some(v=>v.kind==='edge-section'),'matching semantic edge zones must continue across a Road Link');
assert.equal(n.linkEndSection(edgeSections,edgeSections.links[0],'from').forwardBands[0].type,'bike');
edgeB.incomingSection={...edgeB.incomingSection,walk:3};
assert(n.linkIssues(edgeSections,edgeSections.links[0]).some(v=>v.kind==='edge-section'),'edge-zone mismatch must be explicit rather than silently reflowed');
const overview1=n.junctionDisplayDesign(a),overview2=n.junctionDisplayDesign(a);
assert.equal(overview1,overview2,'unchanged Junction instance should reuse cached overview Design');
assert.equal(overview1.showNames,false);assert.equal(overview1.showScale,false);assert.equal(overview1.trees,false);assert.equal(overview1.lights,false);
assert.equal(overview1.display.trees,false);assert.equal(overview1.display.lights,false);
const cacheMove=n.moveJunction(p,a.id,{x:a.x+1,y:a.y+1}),cacheMovedJunction=cacheMove.junctions.find(j=>j.id===a.id);
assert.equal(n.junctionDisplayDesign(cacheMovedJunction),overview1,'moving/rotating an instance must reuse overview geometry when its Design is unchanged');

const originalDesign=structuredClone(a.design),oldEnd=points[0],beforeMove=structuredClone(p);
p=n.moveJunction(p,a.id,{x:a.x+20,y:a.y+15});
assert.deepEqual(p.junctions.find(j=>j.id===a.id).design,originalDesign,'moving an instance must not mutate Design v6');
const movedEnd=n.linkPoints(p,p.links[0])[0];
assert(Math.abs(movedEnd.x-oldEnd.x-20)<1e-8&&Math.abs(movedEnd.y-oldEnd.y-15)<1e-8,'Road Link endpoint must follow moved Junction port');
assert.deepEqual(beforeMove.junctions[0].design,p.junctions[0].design);

const beforeRotate=n.linkPoints(p,p.links[0])[0];
p=n.rotateJunction(p,a.id,90);
const afterRotate=n.linkPoints(p,p.links[0])[0],movedA=p.junctions.find(j=>j.id===a.id);
assert.equal(movedA.rotation,90);
assert(Math.hypot(afterRotate.x-movedA.x,afterRotate.y-movedA.y)>40);
assert.notDeepEqual(afterRotate,beforeRotate,'rotating the Junction instance must move its port and attached Link endpoint');
const collapseLink=p.links[0],collapseFrom=n.worldPort(p,collapseLink.from),collapseTo=n.worldPort(p,collapseLink.to),currentB=p.junctions.find(j=>j.id===b.id);
const collapsed=n.moveJunction(p,b.id,{x:currentB.x+(collapseFrom.x-collapseTo.x),y:currentB.y+(collapseFrom.y-collapseTo.y)});
assert(n.linkIssues(collapsed,collapsed.links[0]).some(v=>v.kind==='alignment'),'moving Junctions into an invalid Link alignment must be surfaced explicitly');

const display=n.junctionDisplayDesign(movedA);
assert.equal(display.rotation,0);
assert(display.arms.every((arm,i)=>arm.length===n.portDistance(movedA,i)));
assert.deepEqual(display.arms.map(arm=>arm.length),movedA.design.arms.map(arm=>arm.length),'Network overview must render the same Arm lengths as the Junction engine');

let result=n.addJunction(p,{x:0,y:140});
p=result.project;const c=result.junction;
assert.equal(p.junctions.length,3);
let connect=n.connectPorts(p,{junctionId:c.id,armId:3},{junctionId:a.id,armId:1});
assert.equal(connect.error,null);p=connect.project;
assert.equal(p.links.length,2);
const occupied=n.connectPorts(p,{junctionId:c.id,armId:3},{junctionId:b.id,armId:1});
assert(occupied.error&&/เชื่อมอยู่แล้ว/.test(occupied.error));

const mismatched=structuredClone(p),target=mismatched.junctions.find(j=>j.id===b.id);
target.design.arms[2].incoming=3;
assert(n.linkIssues(mismatched,mismatched.links[0]).some(v=>v.kind==='lane-count'),'lane mismatch must be explicit rather than auto-guessed');

const removed=n.removeJunction(p,c.id);
assert.equal(removed.junctions.length,2);
assert.equal(removed.links.length,1,'removing a Junction must remove owned Link connections');
assert.equal(n.validateNetworkProject(removed),null);

const editedDesign=structuredClone(removed.junctions[0].design);editedDesign.title='Network detail round-trip';const edited=n.updateJunctionDesign(removed,removed.junctions[0].id,editedDesign);assert.equal(edited.junctions[0].design.title,'Network detail round-trip');assert.notEqual(edited.junctions[0].design,editedDesign,'network must own a copy of detail-editor design state');assert.equal(removed.junctions[0].design.title!==edited.junctions[0].design.title,true);
const linkedId=removed.junctions[0].id,linkedArm=n.linkedArmIds(removed,linkedId)[0],invalidDetail=structuredClone(removed.junctions[0].design);invalidDetail.enabled[linkedArm]=false;
assert(n.junctionDesignLinkIssue(removed,linkedId,invalidDetail)?.includes('ยังมี Road Link เชื่อมอยู่'),'detail editing must explain why a linked arm cannot be disabled');
assert.equal(n.updateJunctionDesign(removed,linkedId,invalidDetail),removed,'invalid detail edit must not replace the Network project or create dangling Link refs');
const editable=structuredClone(removed),editLink=editable.links[0],editPoints=n.linkPoints(editable,editLink),mid={x:(editPoints[0].x+editPoints.at(-1).x)/2,y:(editPoints[0].y+editPoints.at(-1).y)/2+18};const bent=n.insertLinkVia(editable,editLink.id,0,mid);assert.equal(bent.links[0].via.length,1);assert(n.linkLength(bent,bent.links[0])>n.linkLength(editable,editLink));const movedVia=n.moveLinkVia(bent,editLink.id,0,{x:mid.x,y:mid.y+8});assert.equal(movedVia.links[0].via[0].y,mid.y+8);const straightAgain=n.removeLinkVia(movedVia,editLink.id,0);assert.equal(straightAgain.links[0].via.length,0);
const saved=JSON.stringify(removed),restored=n.restoreNetworkProject(saved);
assert.deepEqual(restored,removed);
const oldNetwork=structuredClone(removed);oldNetwork.junctions[0].design.schemaVersion=5;const migratedNetwork=n.normalizeNetworkProject(oldNetwork);assert.equal(migratedNetwork.junctions[0].design.schemaVersion,6,'Network restore must migrate embedded Junction Designs');
const duplicatePort=structuredClone(removed);duplicatePort.links.push({...duplicatePort.links[0],id:'L-duplicate'});assert.throws(()=>n.normalizeNetworkProject(duplicatePort),/port ซ้ำ/,'duplicate semantic port ownership must be rejected');
const badTitle=structuredClone(removed);badTitle.title='x'.repeat(121);assert.throws(()=>n.normalizeNetworkProject(badTitle),/ชื่อ Network/);
assert.equal(n.restoreNetworkProject('{bad').schemaVersion,1);

const bounds=n.projectBounds(removed);
assert(bounds.w>100&&bounds.h>=100);
const wideBoundsProject=structuredClone(removed),wideJ=wideBoundsProject.junctions[0];wideJ.design.arms[1].incomingSection={width:4.5,walk:5,bands:[{id:'wide-bike',type:'bike',width:3},{id:'wide-shoulder',type:'shoulder',width:4}]};const wideBounds=n.projectBounds(wideBoundsProject);assert(wideBounds.w>=bounds.w&&wideBounds.h>=bounds.h,'fit bounds must include resolved carriageway/edge-zone footprint, not only Junction centers and ports');
console.log('PASS network project: instances, direct Arm stretch/rotate/basic/section/pocket/topology edits, semantic ports, directional section widths, Complete Streets edge continuity, cached lightweight overview, alignment review, embedded Design migration, persistence, Free Draw link alignment, linked-arm topology guard, detail round-trip and cleanup');
