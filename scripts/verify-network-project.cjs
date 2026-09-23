const ts=require('typescript'),fs=require('fs'),assert=require('node:assert/strict');

for(const name of ['slip-model','model']){
  const code=ts.transpileModule(fs.readFileSync('app/junction/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}})
    .outputText.replace(/require\("\.\/([a-z-]+)"\)/g,'require("./$1.cjs")');
  fs.writeFileSync('.sites-runtime/'+name+'.cjs',code);
}
const projectCode=ts.transpileModule(fs.readFileSync('lib/network-project.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}})
  .outputText.replace(/require\("\.\.\/app\/junction\/model"\)/g,'require("./model.cjs")').replace(/require\("\.\/alignment"\)/g,'require("./network-alignment.cjs")');
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

const display=n.junctionDisplayDesign(movedA);
assert.equal(display.rotation,0);
assert(display.arms.every((arm,i)=>arm.length===n.portDistance(movedA,i)));
assert(movedA.design.arms.some(arm=>arm.length>45),'network clipping must remain display-only');

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
const editable=structuredClone(removed),editLink=editable.links[0],editPoints=n.linkPoints(editable,editLink),mid={x:(editPoints[0].x+editPoints.at(-1).x)/2,y:(editPoints[0].y+editPoints.at(-1).y)/2+18};const bent=n.insertLinkVia(editable,editLink.id,0,mid);assert.equal(bent.links[0].via.length,1);assert(n.linkLength(bent,bent.links[0])>n.linkLength(editable,editLink));const movedVia=n.moveLinkVia(bent,editLink.id,0,{x:mid.x,y:mid.y+8});assert.equal(movedVia.links[0].via[0].y,mid.y+8);const straightAgain=n.removeLinkVia(movedVia,editLink.id,0);assert.equal(straightAgain.links[0].via.length,0);
const saved=JSON.stringify(removed),restored=n.restoreNetworkProject(saved);
assert.deepEqual(restored,removed);
assert.equal(n.restoreNetworkProject('{bad').schemaVersion,1);

const bounds=n.projectBounds(removed);
assert(bounds.w>100&&bounds.h>=100);
console.log('PASS network project: instances, move/rotate transforms, semantic ports, linked corridor ownership, mismatch review, persistence, Free Draw link alignment, detail round-trip and cleanup');
