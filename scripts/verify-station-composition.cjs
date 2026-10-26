// Regression first: combined station components must not invalidate the entire compiled network.
// The six individually valid stretches each create five components on the same Road Link (>24 total).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const cmd=T('core/road-first/commands.cjs'),project=T('core/road-first/project.cjs');
const net=T('core/network/network-project.cjs');
const section={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:2,bands:[{id:'b1',type:'shoulder',width:1}]};
const original={kind:'road-first',schemaVersion:3,title:'Component overflow',decisions:[],options:{},roads:[
  {id:'A',name:'ถนนหลัก',points:[{x:0,y:0},{x:1000,y:0}],section}
]};
const stretch=i=>({id:'S'+i,start:50+i*100,end:160+i*100,taperIn:20,taperOut:20,
  forwardLanes:3,backwardLanes:2,walk:1,bands:[{type:'shoulder',width:2}]});
const tooMany={...original,roads:[{...original.roads[0],sectionStretches:Array.from({length:6},(_,i)=>stretch(i))}]};
const compiled=project.compileRoadFirstProject(tooMany);
assert.ok(compiled.project.links[0].components.length>24,'fixture genuinely exceeds the per-link component limit');
// Previously this failed network validation, making a legacy authored project impossible to open.
assert.equal(net.validateNetworkProject(compiled.project),null,'legacy over-cap link must be reviewable, not invalidate the entire network');
assert.deepEqual(project.normalizeRoadFirstProject(JSON.parse(JSON.stringify(tooMany))),tooMany,'old file opens without changing authored values');
// New edits must not introduce the over-cap state; report a meaningful reason and preserve the original.
let editor=cmd.createEditor(original);
for(let i=0;i<5;i++){
  const current=editor.project.roads[0].sectionStretches??[];
  const out=cmd.runCommand(editor,{type:'road.setSectionStretches',roadId:'A',stretches:[...current,stretch(i)]});
  assert.equal(out.result.error,null,'valid new stretch '+i);
  editor=cmd.endGesture(out.editor);
}
const before=JSON.stringify(editor.project);
const denied=cmd.runCommand(editor,{type:'road.setSectionStretches',roadId:'A',stretches:[...editor.project.roads[0].sectionStretches,stretch(5)]});
assert.match(denied.result.error??'',/24|รายการ|ซ้อน|component/i,'reason explains component budget');
assert.equal(JSON.stringify(denied.editor.project),before,'refused edit is atomic');
console.log('PASS station composition: over-cap legacy opens, new overflow refused without mutation');
