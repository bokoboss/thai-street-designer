// Road curves in the design workspace: radius at a road point (typed or dragged), back to a sharp corner, delete a point;
// arcs capped by the straights are reported, arms keep clear of arcs, a crossing inside an arc is reported.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),cv=T('core/road-first/curves.cjs'),al=T('core/common/alignment.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:2};
let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'L',name:'ถนนโค้ง',points:[{x:0,y:0},{x:100,y:0},{x:100,y:100}],section:sec}]});
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const L=()=>e.project.roads.find(r=>r.id==='L');
// 1. Radius at an inner point: 90° bend, tangent = radius.
assert.match(run({type:'road.setPointRadius',roadId:'L',index:1,radius:30}).label,/ปรับรัศมีโค้ง ถนนโค้ง เป็น 30 ม\./);
let k=cv.vertexCurve(L().points,1);assert.ok(Math.abs(k.deflection-90)<1e-6&&k.radius===30&&Math.abs(k.tangent-30)<1e-6);
// The drawn alignment is the same arc (smoothAlignment): its midpoint is radius × (k − 1) from the vertex.
{const s=al.smoothAlignment(L().points),h=cv.curveHandle(L().points,1,0),near=Math.min(...s.map(p=>Math.hypot(p.x-h.x,p.y-h.y)));assert.ok(near<.5,'handle on the drawn arc');
 assert.equal(cv.radiusFromPoint(L().points,1,h),30,'dragging the handle where it is keeps the radius');}
// 2. Too large for the straights: capped and said so.
assert.match(run({type:'road.setPointRadius',roadId:'L',index:1,radius:80}).label,/ช่วงตรงรับได้ 45 ม\./);
assert.ok(Math.abs(cv.vertexCurve(L().points,1).radius-45)<1e-6,'drawn radius capped');
assert.equal(cv.radiusFromPoint(L().points,1,{x:0,y:200}),45,'dragged handle capped');
// 3. Back to a sharp corner.
assert.match(run({type:'road.setPointRadius',roadId:'L',index:1,radius:0}).label,/ทำมุมตรง/);assert.equal(L().points[1].radius,undefined);
// 4. Ends cannot curve; out-of-range radius refused.
assert.match(c.runCommand(e,{type:'road.setPointRadius',roadId:'L',index:0,radius:20}).result.error,/ปลายถนน/);
assert.match(c.runCommand(e,{type:'road.setPointRadius',roadId:'L',index:1,radius:500}).result.error,/0–200/);
// 5. Delete a point, one undo brings it back.
run({type:'road.removePoint',roadId:'L',index:1});assert.equal(L().points.length,2);e=c.undo(e).editor;assert.equal(L().points.length,3);
// 6. Arms keep clear of an arc; a crossing inside an arc is reported.
let j=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ถนนโค้ง',points:[{x:-200,y:0},{x:100,y:0},{x:100,y:200}],section:sec}]});
j=c.endGesture(c.runCommand(j,{type:'road.setPointRadius',roadId:'A',index:1,radius:60}).editor);
const added=c.runCommand(j,{type:'road.add',road:{id:'B',name:'ถนนตัด',points:[{x:50,y:-150},{x:50,y:150}],section:sec}});assert.equal(added.result.error,null);
const C=rp.compileRoadFirstProject(added.editor.project),leg=C.legs.find(l=>l.roadId==='A'&&l.side==='ahead'),arm=C.project.junctions[0].design.arms[leg.armId];
assert.ok(arm.length<=25+1e-6||C.shortfalls.some(s=>s.roadId==='A'),'arm stops before the arc (or is reported)');
assert.ok(C.issues.some(i=>/ช่วงโค้ง/.test(i)),'crossing inside an arc reported');
console.log('PASS road curves: radius at a point, capped and reported, handle round trip, sharp corner, ends refused, delete point + undo, arms clear of arcs, crossing in an arc reported');
