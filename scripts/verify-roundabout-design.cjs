// Junction ↔ roundabout from /design (UX closure before 4A): engine conversion, road-owned values kept, one undo step,
// back to an ordinary junction restores its defaults; ring settings through junction.setDesign.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),rb=T('core/road-first/roundabout.cjs'),ae=T('core/road-first/approach-edit.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},
  roads:[{id:'R1',name:'ถนนหลัก',points:[{x:-250,y:0},{x:250,y:0}],section:sec},{id:'R2',name:'ถนนรอง',points:[{x:0,y:-250},{x:0,y:250}],section:sec}]});
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
run({type:'road.add',road:{id:'R3',name:'tmp',points:[{x:900,y:900},{x:950,y:900}],section:sec}});run({type:'road.remove',roadId:'R3'});
const id=e.project.decisions[0].candidateId,j=()=>rp.compileRoadFirstProject(e.project).project.junctions[0];
const plain=j();assert.equal(plain.design.type,'junction');
const to=rb.toRoundabout(e.project,id);assert.ok(to.cmd,to.error);
const r=run(to.cmd);assert.match(r.label,/^เปลี่ยนเป็นวงเวียน /);
const round=j();assert.equal(round.design.type,'roundabout');
assert.ok(round.design.enabled.every((on,i)=>!on||(round.design.arms[i].median===plain.design.arms[i].median&&round.design.arms[i].incoming===plain.design.arms[i].incoming)),'road-owned values unchanged');
assert.ok(round.design.arms.every((a,i)=>!round.design.enabled[i]||!a.signal),'no signals at a roundabout');
assert.equal(rp.compileRoadFirstProject(e.project).issues.length,0,rp.compileRoadFirstProject(e.project).issues.join(' | '));
assert.match(rb.toRoundabout(e.project,id).error,/วงเวียนอยู่แล้ว/);
// Ring settings.
run({type:'junction.setDesign',candidateId:id,patch:{radius:20}});assert.equal(j().design.radius,20);
// Back to an ordinary junction: defaults return.
const back=rb.toJunction(e.project,id);run(back.cmd);
const again=j();assert.equal(again.design.type,'junction');
assert.deepEqual(again.design.arms.map(a=>[a.signal,a.crossOffset]),plain.design.arms.map(a=>[a.signal,a.crossOffset]),'ordinary defaults back');
// Undo twice returns to the roundabout with radius 20.
e=c.undo(e).editor;assert.equal(j().design.type,'roundabout');assert.equal(j().design.radius,20);
console.log('PASS roundabout from /design: engine conversion, road values kept, ring settings, back to a junction, undo');
