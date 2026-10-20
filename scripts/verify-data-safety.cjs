// P0 (independent review 2026-10-20): object identity and undo steps.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const ids=T('core/road-first/ids.cjs'),cmp=T('core/road-first/compare.cjs'),c=T('core/road-first/commands.cjs'),h=T('core/common/history.cjs');
const sec={forwardLanes:1,backwardLanes:1,laneWidth:3.25,median:0,walk:2};

// Road ids are opaque and never collide; names stay "ถนน n".
const roads=[{id:'R-1',name:'ถนน 1',points:[{x:0,y:0},{x:100,y:0}],section:sec}];
const many=new Set(Array.from({length:500},()=>ids.newRoadId(roads)));assert.equal(many.size,500);assert.ok(![...many].includes('R-1'));
assert.match(ids.newRoadId([]),/^R-[0-9a-z]{8}$/);assert.equal(ids.nextRoadName(roads),'ถนน 2');

// Delete a road and draw a new one: the comparison shows removed + added, not "changed".
const base={kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads};
const alt={...base,roads:[{id:ids.newRoadId(roads),name:'ถนน 1',points:[{x:0,y:50},{x:100,y:50}],section:sec}]};
assert.deepEqual(cmp.compareScenarios(base,alt).counts,{added:1,removed:1,changed:0});

// Typed values are separate undo steps once the gesture is closed (the workspace closes it after every typed commit).
let ed=c.createEditor(base);
ed=c.endGesture(c.runCommand(ed,{type:'road.setSection',roadId:'R-1',patch:{walk:2.5}}).editor);
ed=c.endGesture(c.runCommand(ed,{type:'road.setSection',roadId:'R-1',patch:{walk:3}}).editor);
assert.equal(c.undo(ed).editor.project.roads[0].section.walk,2.5,'one undo per typed value');
// A drag (same group, gesture still open) stays one step.
let dr=c.createEditor(base);
for(const x of [10,20,30])dr=c.runCommand(dr,{type:'road.movePoint',roadId:'R-1',index:0,point:{x,y:0}}).editor;
assert.equal(c.undo(dr).editor.project.roads[0].points[0].x,0,'a drag is one step');
console.log('PASS data safety: road ids never reused (comparison shows removed + added), one undo step per typed value, one per drag');
