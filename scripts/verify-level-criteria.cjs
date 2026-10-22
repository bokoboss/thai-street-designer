// Level criteria (before Phase 4B-3, docs/spec/LEVEL_CRITERIA.md): values with sources per project; bridge heights,
// underpass depths and ramp grades come from them; designs short of them are flagged, never "passed".
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),lc=T('core/road-first/level-criteria.cjs'),gs=T('core/road-first/grade-separation.cjs'),el=T('core/road-first/elevation.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:0};
// 1. Starting values: tool values without sources (TO_VERIFY), derived heights and lengths.
const K=lc.levelCriteria();assert.equal(lc.bridgeRise(K),6.5);assert.equal(lc.tunnelDepth(K),6.5);assert.ok(lc.LEVEL_CRITERIA_KEYS.every(k=>!lc.hasSource(K[k])));
assert.equal(lc.rampLength(6.5,.05),130);assert.equal(lc.gradeFor(K,{role:'ramp'}),.05);assert.equal(lc.gradeFor(K,{}),.04);
// 2. Entered criteria (with a source) drive the generated rise; one undo restores them.
let e=c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ถนนล่าง',points:[{x:-400,y:0},{x:400,y:0}],section:sec}]});
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
run({type:'road.add',road:{id:'B',name:'ถนนบน',points:[{x:0,y:-400},{x:0,y:400}],section:sec}});
const r=run({type:'project.setLevelCriteria',patch:{clearance:{value:5.5,source:'  คู่มือโครงการ หน้า 12  '}}});
assert.match(r.label,/ช่องลอดใต้โครงสร้าง \(ม\.\) 5\.5/);assert.deepEqual(e.project.options.levels.clearance,{value:5.5,source:'คู่มือโครงการ หน้า 12'});
assert.equal(c.undo(e).editor.project.options.levels,undefined,'undo restores the starting values');
const cid=e.project.decisions[0].candidateId;run(gs.overCommand(e.project,cid,'B').cmd);
let C=rp.compileRoadFirstProject(e.project);assert.ok(Math.abs(C.crossings[0].gap-7)<.01,'rise = 5.5 + 1.5');
const B=e.project.roads.find(x=>x.id==='B'),p=B.profile;assert.ok(Math.abs((p[1].station-p[0].station)-7/.04)<.01,'ramp up at the main-road grade');
assert.ok(!C.issues.some(i=>/ต้องตรวจตามเกณฑ์/.test(i)),'generated rise meets the entered criteria');
// 3. A design short of the criteria is flagged, with whether the criterion has a source.
run({type:'road.setProfile',roadId:'B',profile:[{station:0,z:5},{station:800,z:5}]});
C=rp.compileRoadFirstProject(e.project);const gapIssue=C.issues.find(i=>/น้อยกว่าที่ตั้งไว้ 7\.00 ม\./.test(i));assert.ok(gapIssue,'clearance short flagged');
assert.ok(!/ยังไม่มีแหล่งอ้างอิง/.test(gapIssue),'clearance has a source');assert.match(gapIssue,/ต้องตรวจตามเกณฑ์/);assert.ok(!/ผ่าน/.test(gapIssue));
// 4. Grades over the maximum: main road against the main maximum, ramps against the ramp maximum.
run({type:'road.setProfile',roadId:'B',profile:[{station:0,z:0},{station:100,z:7},{station:800,z:7}]});
assert.ok(rp.compileRoadFirstProject(e.project).issues.some(i=>/ถนนบน: ความชัน 7\.0% ช่วง 0–100 ม\. เกินที่ตั้งไว้ 4\.0% \(ค่ายังไม่มีแหล่งอ้างอิง\)/.test(i)));
run({type:'road.add',road:{id:'X',name:'ทางลาด',role:'ramp',points:[{x:300,y:-300},{x:300,y:-100}],section:{forwardLanes:1,backwardLanes:0,laneWidth:3.5,median:0,walk:0},profile:[{station:0,z:0},{station:200,z:9}]}});
assert.ok(!rp.compileRoadFirstProject(e.project).issues.some(i=>/^ทางลาด: ความชัน/.test(i)),'4.5% on a ramp is within the ramp maximum');
run({type:'road.setProfile',roadId:'X',profile:[{station:0,z:0},{station:200,z:12}]});
assert.ok(rp.compileRoadFirstProject(e.project).issues.some(i=>/^ทางลาด: ความชัน 6\.0% .*เกินที่ตั้งไว้ 5\.0%/.test(i)),'6% on a ramp flagged');
// 5. Input checks and reset.
assert.match(c.runCommand(e,{type:'project.setLevelCriteria',patch:{mainGrade:{value:40}}}).result.error,/1–15/);
run({type:'project.setLevelCriteria',patch:{clearance:null}});assert.equal(e.project.options.levels,undefined,'back to the starting values');
assert.equal(rp.validateRoadFirstProject({...e.project,options:{levels:{clearance:{value:'x'}}}}),'ช่องลอดใต้โครงสร้าง (ม.) ต้องอยู่ระหว่าง 2–10');
console.log('PASS level criteria: starting values TO_VERIFY, entered values + source drive rises, undo, short clearance and steep grades flagged (never passed), input checks');
