// Lane runs: lanes added along a stretch, in road stations, compiled into the network lane model (docs/spec/LANE_RUNS.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),lr=T('core/road-first/lane-runs.cjs'),lg=T('core/network/network-link-geometry.cjs'),n=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
const near=(a,b,eps=1e-3)=>Math.abs(a-b)<=eps;
let e;
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const R=id=>e.project.roads.find(r=>r.id===id);
const comp=()=>rp.compileRoadFirstProject(e.project);
const fresh=()=>{e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-300,y:0},{x:300,y:0}],section:sec}]});};
const widen=[{id:'F',direction:'forward',side:'curb',start:200,end:400,taperIn:30,taperOut:30},{id:'B',direction:'backward',side:'curb',start:200,end:400,taperIn:30,taperOut:30}];
const edges=P=>{const l=P.links[0],g=lg.resolveLinkSectionGeometry(P,l),s=g.stations;return{s,left:g.left,right:g.right};};
const at=(E,station,key)=>{const i=E.s.findIndex(v=>v>=station-1e-6);return E[key][i];};

// 1. Old files: no runs, unchanged compile (plain section, no components).
fresh();
{const P=comp().project;assert.equal(P.links[0].components.length,0);assert.equal(P.links[0].sectionProfile.mode,'review');}

// 2. 4 → 6 lanes over 200–400 m: one lane each way on the curb side, with tapers; continuous edges; deterministic.
{const before=JSON.stringify(e.project);run({type:'road.setLaneRuns',roadId:'A',runs:widen});
 const P=comp().project,l=P.links[0];assert.equal(l.sectionProfile.mode,'linear');assert.deepEqual(l.components.map(x=>x.id).sort(),['run-B','run-F']);
 assert.equal(n.validateNetworkProject(P),null);
 const E=edges(P),base=1.5+2*3.25;
 assert.ok(near(at(E,100,'left'),base,.01)&&near(at(E,300,'left'),base+3.25,.01),'forward edge widens by one lane');
 assert.ok(near(Math.abs(at(E,100,'right')),base,.01)&&near(Math.abs(at(E,300,'right')),base+3.25,.01),'backward edge widens by one lane');
 for(let i=1;i<E.s.length;i++)assert.ok(Math.abs(E.left[i]-E.left[i-1])<=2*3.25*(E.s[i]-E.s[i-1])/30+1e-6,`no jump in the edge (taper) at ${E.s[i]}: ${E.left[i-1]} → ${E.left[i]}`);
 assert.equal(JSON.stringify(comp()),JSON.stringify(comp()),'deterministic');
 const saved=JSON.parse(JSON.stringify(e.project));assert.equal(rp.validateRoadFirstProject(saved),null,'save / reopen');
 assert.equal(JSON.stringify(rp.compileRoadFirstProject(saved)),JSON.stringify(comp()));
 e=c.undo(e).editor;assert.equal(JSON.stringify(e.project),before,'one undo');e=c.redo(e).editor;}

// 3. Refusals with a reason.
{const f=(runs,re)=>assert.match(c.executeCommand(e.project,{type:'road.setLaneRuns',roadId:'A',runs}).error,re);
 f([{...widen[0],end:700}],/เลยปลายถนน/);f([{...widen[0],taperIn:150,taperOut:100}],/ช่วงเปลี่ยน/);
 f([{...widen[0],id:'a'},{...widen[0],id:'b'},{...widen[0],id:'c'}],/ซ้อนกันเกิน 2/);f([{...widen[0],start:-5}],/ไม่ถูกต้อง/);
 const ramp=JSON.parse(JSON.stringify(e.project));ramp.roads[0].section={...sec,backwardLanes:0};ramp.roads[0].laneRuns=[widen[1]];
 assert.match(rp.validateRoadFirstProject(ramp),/ไม่มีช่องจราจรทิศสวน/);}

// 4. A junction added later: the run is kept in road stations and clipped around it, with an item to check.
run({type:'road.add',road:{id:'X',name:'ถนนตัด',points:[{x:0,y:-200},{x:0,y:200}],section:sec}});
{const C=comp(),ls=C.project.links.filter(l=>C.sources.links[l.id]==='A');assert.equal(ls.length,2);
 assert.ok(ls.every(l=>l.components.some(x=>x.id==='run-F')),'both sides of the junction get their part');
 assert.ok(C.issues.some(i=>/ช่องเพิ่ม 200–400 ม\. ถูกตัดที่ช่วงเข้าทางแยก/.test(i)));
 run({type:'road.setLaneRuns',roadId:'A',runs:[{...widen[0],start:285,end:315,taperIn:5,taperOut:5}]});
 assert.ok(comp().issues.some(i=>/อยู่ในช่วงเข้าทางแยก.*จึงไม่ได้สร้าง/.test(i)),'inside the approach: not built, reported');
 run({type:'road.remove',roadId:'X'});}

// 5. Edits that change stations carry the runs on the ground.
fresh();run({type:'road.setLaneRuns',roadId:'A',runs:[{id:'F',direction:'forward',side:'curb',start:200,end:400,taperIn:30,taperOut:20}]});
{const before=JSON.parse(JSON.stringify(e.project));
 run({type:'road.reverse',roadId:'A'});assert.deepEqual(R('A').laneRuns,[{id:'F',direction:'backward',side:'curb',start:200,end:400,taperIn:20,taperOut:30}],'reverse: same traffic, other way round');
 run({type:'road.reverse',roadId:'A'});assert.deepEqual(e.project.roads,before.roads,'reverse twice: identity');
 run({type:'road.extend',roadId:'A',atStart:true,points:[{x:-400,y:0}]});assert.ok(near(R('A').laneRuns[0].start,300)&&near(R('A').laneRuns[0].end,500),'extend at the start shifts them');
 run({type:'road.split',roadId:'A',at:{x:0,y:0},newId:'A2'});
 assert.deepEqual(R('A').laneRuns.map(x=>[x.start,x.end,x.taperIn,x.taperOut]),[[300,400,30,0]]);assert.deepEqual(R('A2').laneRuns.map(x=>[x.start,x.end,x.taperIn,x.taperOut]),[[0,100,0,20]]);
 run({type:'road.join',roadId:'A',otherId:'A2'});assert.deepEqual(R('A').laneRuns.map(x=>[x.start,x.end]),[[300,400],[400,500]],'joined back: both parts on the ground');
 assert.equal(rp.validateRoadFirstProject(JSON.parse(JSON.stringify(e.project))),null);}

// 6. Helpers.
{assert.deepEqual(lr.clipRun(widen[0],250,600).component,{id:'run-F',kind:'lane',direction:'forward',side:'curb',start:0,end:150,taperIn:30,taperOut:30});assert.equal(lr.clipRun(widen[0],400,600),null);
 const r=lr.newLaneRun({laneRuns:[]},[{start:0,end:600}],'forward','curb').run;assert.deepEqual([r.start,r.end,r.taperIn],[225,375,30]);
 assert.match(lr.newLaneRun({laneRuns:[]},[{start:0,end:10}],'forward','curb').error,/สั้นเกิน/);}
console.log('PASS lane runs: old files unchanged, 4 → 6 lanes over a stretch with tapers (continuous, deterministic, save / reopen, one undo), refusals, clipped around a later junction with an item to check, carried through reverse / extend / split / join');
