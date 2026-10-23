// One-shot drawing guides: extension of a road beyond its end, parallel / perpendicular to the road last hovered,
// and the temporary distance to it (docs/spec/SELECT_HUB.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const sn=T('core/road-first/snap.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.5,median:0,walk:0};
const roads=[{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:0,y:0},{x:100,y:0}],section:sec},{id:'D',name:'ถนนดี',alignment:'arc',points:[{x:0,y:200},{x:100,y:300}],section:sec}];
const o={pxPerMetre:1};

// Extension: beyond A's end, along its end straight; the end itself still ranks first right at the end.
{const c=sn.snapCandidates({x:160,y:4},roads,o);assert.equal(c[0].kind,'guide');assert.equal(c[0].guide,'extension');assert.deepEqual(c[0].point,{x:160,y:0});
 assert.deepEqual(c[0].guideFrom,{x:100,y:0});assert.equal(c[0].roadId,'A');
 assert.equal(sn.snapCandidates({x:104,y:3},roads,o)[0].kind,'end','at the end: the end');
 assert.ok(!sn.snapCandidates({x:160,y:30},roads,o).some(x=>x.guide==='extension'),'too far off the line');
 assert.ok(sn.snapCandidates({x:-50,y:2},roads,o).some(x=>x.guide==='extension'&&x.end==='start'),'before the start too');
 assert.equal(sn.snapCandidates({x:160,y:4},roads,{...o,off:true})[0].kind,'none','Shift suspends guides');}

// Parallel / perpendicular to the reference road from the last drawn point (D runs at 45°).
{const from={x:300,y:0};
 const par=sn.snapCandidates({x:300+70,y:72},roads,{...o,from,reference:'D'});assert.equal(par[0].guide,'parallel');assert.equal(par[0].angle,45);
 assert.ok(Math.abs(par[0].point.x-par[0].point.y-300)<.02,'on the 45° line through the last point');
 const per=sn.snapCandidates({x:300-70,y:71},roads,{...o,from,reference:'D'});assert.equal(per[0].guide,'perpendicular');assert.equal(per[0].angle,135);
 assert.ok(!sn.snapCandidates({x:300+70,y:72},roads,{...o,from}).some(x=>x.kind==='guide'),'no reference: no parallel guide');
 // The closer of an axis step and a road guide wins (here the road is exactly at 45°, the axis step too): both offered.
 const both=sn.snapCandidates({x:300+70,y:72},roads,{...o,from,reference:'D'});assert.ok(both.some(x=>x.kind==='angle'),'axis step still offered (Tab)');}

// Distance to the reference road for whatever target is used (not for a point on that road itself).
{const c=sn.snapCandidates({x:50,y:-40},roads,{...o,reference:'A'});assert.equal(c[0].kind,'none');assert.equal(c[0].refDistance,40);
 const on=sn.snapCandidates({x:50,y:3},roads,{...o,reference:'A'});assert.equal(on[0].kind,'road');assert.equal(on[0].refDistance,undefined);}
console.log('PASS draw guides: extension beyond a road end (ends first, off-line ignored, Shift suspends), parallel / perpendicular to the last hovered road, distance to it');
