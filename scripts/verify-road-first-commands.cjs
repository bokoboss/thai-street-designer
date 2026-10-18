// Phase 2 — typed command layer with readable undo history for the road-first model.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),rf=T('core/road-first/derive.cjs'),h=T('core/common/history.cjs'),m=T('core/junction/model.cjs');

const sec=(f=2,b=2)=>({forwardLanes:f,backwardLanes:b,laneWidth:3.25,median:2,walk:2});
const empty={kind:'road-first',schemaVersion:1,title:'ทดสอบคำสั่ง',roads:[],decisions:[],options:{approachLength:60}};
// Commands travel as JSON (UI, file, automation), so every call goes through a JSON round trip.
const run=(ed,cmd)=>c.runCommand(ed,JSON.parse(JSON.stringify(cmd)));
const ok=(ed,cmd)=>{const r=run(ed,cmd);assert.equal(r.result.error,null,`${cmd.type}: ${r.result.error}`);return r.editor;};
const compiled=ed=>rp.compileRoadFirstProject(ed.project).project;

// 1. Draw two roads; the crossing stays a candidate until confirmed.
let ed=c.createEditor(empty);
ed=ok(ed,{type:'road.add',road:{id:'R1',name:'ถนนหลัก',points:[{x:-200,y:0},{x:200,y:0}],section:sec()}});
let r=run(ed,{type:'road.add',road:{id:'R2',name:'ถนนรอง',points:[{x:0,y:-150},{x:0,y:150}],section:sec(1,1)}});
assert(r.result.warnings.some(w=>/ยังไม่ได้ยืนยัน/.test(w)),'unconfirmed crossing is a warning, not an error');ed=r.editor;
assert.equal(compiled(ed).junctions.length,0);
const cand=rf.detectCandidates(ed.project.roads)[0];
assert.equal(cand.id,'C-R1+R2-1','crossing id comes from its roads');
ed=ok(ed,{type:'crossing.decide',candidateId:cand.id,decision:'junction',name:'แยกกลาง'});
assert.equal(compiled(ed).junctions.length,1);

// 2. Junction detail through leg-keyed commands.
const pocket={left:{...m.emptyPockets().left},right:{...m.emptyPockets().right,lanes:1,length:30,taper:15}};
ed=ok(ed,{type:'leg.setTreatment',candidateId:cand.id,leg:'R1:behind',patch:{incomingPockets:pocket}});
ed=ok(ed,{type:'slip.set',candidateId:cand.id,slip:{from:'R2:ahead',to:'R1:behind',width:4.5,radius:28}});
ed=ok(ed,{type:'junction.setCorner',candidateId:cand.id,corner:12});
const j=()=>compiled(ed).junctions[0];
assert.equal(j().design.slips.length,1);assert.equal(j().design.corner,12);

// 3. A drag is one undo step; ending the gesture starts a new one.
const steps=h.historyLabels(ed.history).length;
for(const y of [160,170,180])ed=ok(ed,{type:'road.movePoint',roadId:'R2',index:1,point:{x:0,y}});
assert.equal(h.historyLabels(ed.history).length,steps+1,'three drag moves = one step');
ed=c.endGesture(ed);
ed=ok(ed,{type:'road.movePoint',roadId:'R2',index:1,point:{x:0,y:190}});
assert.equal(h.historyLabels(ed.history).length,steps+2,'next drag is its own step');
// Typed numbers on the same field also merge.
ed=c.endGesture(ed);
for(const w of [3.3,3.4,3.5])ed=ok(ed,{type:'road.setSection',roadId:'R1',patch:{laneWidth:w}});
assert.equal(h.undoLabel(ed.history),'ปรับหน้าตัด ถนนหลัก: ความกว้างช่อง 3.5');
assert.equal(h.historyLabels(ed.history).length,steps+3);

// 4. Readable history.
assert.deepEqual(h.historyLabels(ed.history).slice(0,6),[
  'เพิ่มถนน ถนนหลัก','เพิ่มถนน ถนนรอง','ยืนยันทางแยก แยกกลาง','แก้ขา ถนนหลัก ← ที่ แยกกลาง','ตั้ง Slip lane จาก ถนนรอง → ที่ แยกกลาง','ปรับรัศมีมุม แยกกลาง เป็น 12 ม.',
]);
assert(h.historyLabels(ed.history).includes('ย้ายจุดแนวถนน ถนนรอง'));

// 5. Rejected edits change nothing and add no step.
const before=ed;
for(const bad of [
  {type:'road.setSection',roadId:'R1',patch:{laneWidth:9}},
  {type:'road.removePoint',roadId:'R1',index:0},
  {type:'slip.remove',candidateId:cand.id,from:'R1:ahead'},
  {type:'leg.setTreatment',candidateId:'C-none',leg:'R1:ahead',patch:{crossing:false}},
  {type:'road.add',road:{id:'R1',name:'ซ้ำ',points:[{x:0,y:0},{x:1,y:1}],section:sec()}},
  {type:'nonsense'},
]){const x=run(ed,bad);assert(x.result.error,`${bad.type} rejected`);assert.equal(x.editor,before,`${bad.type} leaves the editor untouched`);}

// A sharp crossing (35° between roads) is rejected by the junction engine.
const tall=ok(c.endGesture(ed),{type:'road.movePoint',roadId:'R2',index:0,point:{x:0,y:-600}});
const sharp=run(tall,{type:'road.movePoint',roadId:'R1',index:0,point:{x:-200,y:-560}});
assert(sharp.result.error&&/40°/.test(sharp.result.error),`sharp crossing rejected: ${sharp.result.error}`);assert.equal(sharp.editor,tall);

// 6. Undo / redo walk the labels and restore exact states.
const states=[ed.project];let u=c.undo(ed);
assert.equal(u.label,'ปรับหน้าตัด ถนนหลัก: ความกว้างช่อง 3.5');
assert.equal(u.editor.project.roads[0].section.laneWidth,3.25,'typed sequence undone in one step');
const back=c.redo(u.editor);assert.deepEqual(back.editor.project,states[0]);assert.equal(back.label,u.label);
assert.equal(c.redo(back.editor),null,'nothing left to redo');

// 7. Removing a road removes its junction and leg settings; undo brings them back.
const removed=ok(ed,{type:'road.remove',roadId:'R2'});
assert.equal(removed.project.decisions.length,0);assert.equal(compiled(removed).junctions.length,0);
assert.equal(h.undoLabel(removed.history),'ลบถนน ถนนรอง');
assert.deepEqual(c.undo(removed).editor.project,ed.project);

// 8. Decisions follow their crossing: moving a road away keeps the junction dormant, moving back restores it.
let away=ok(c.endGesture(ed),{type:'road.movePoint',roadId:'R2',index:0,point:{x:0,y:20}});
assert.equal(compiled(away).junctions.length,0,'roads no longer cross');
assert.equal(away.project.decisions.length,1,'decision kept while dormant');
away=ok(away,{type:'road.movePoint',roadId:'R2',index:0,point:{x:0,y:-150}});
assert.equal(compiled(away).junctions.length,1);assert.equal(compiled(away).junctions[0].name,'แยกกลาง');
assert.equal(compiled(away).junctions[0].design.slips.length,1,'treatments come back with the crossing');

// 9. When a crossing's order along the road shifts, the decision stays on the same physical crossing.
let u2=c.createEditor(empty);
u2=ok(u2,{type:'road.add',road:{id:'A',name:'ถนน ก',points:[{x:-200,y:0},{x:200,y:0}],section:sec()}});
u2=ok(u2,{type:'road.add',road:{id:'B',name:'ถนน ข',points:[{x:-60,y:-100},{x:-60,y:100},{x:60,y:100},{x:60,y:-100}],section:sec(1,1)}});
const east=rf.detectCandidates(u2.project.roads).find(x=>x.point.x>0);assert.equal(east.id,'C-A+B-2');
u2=ok(u2,{type:'crossing.decide',candidateId:east.id,decision:'junction',name:'แยกตะวันออก'});
u2=ok(u2,{type:'road.movePoint',roadId:'B',index:0,point:{x:-60,y:50}});   // west crossing disappears
const moved=compiled(u2);
assert.equal(moved.junctions.length,1);assert(moved.junctions[0].x>0&&moved.junctions[0].name==='แยกตะวันออก','decision re-attached to the east crossing');
assert.equal(u2.project.decisions[0].candidateId,'C-A+B-1');

console.log(`PASS road-first commands: JSON commands for roads, crossings, junction legs and Slip; drag/typing merge into one step; readable labels; rejected edits leave no trace; undo/redo exact; road removal; decisions follow their crossing`);
