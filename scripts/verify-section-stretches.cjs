// Section of a stretch: more lanes, footway and band widths over part of a road (docs/spec/SECTION_STRETCHES.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),ss=T('core/road-first/section-stretches.cjs'),lg=T('core/network/network-link-geometry.cjs'),n=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2,bands:[{id:'b1',type:'shoulder',width:1}]};
const near=(a,b,eps=.01)=>Math.abs(a-b)<=eps;
let e;
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const R=id=>e.project.roads.find(r=>r.id===id);
const comp=()=>rp.compileRoadFirstProject(e.project);
const fresh=()=>{e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[{id:'A',name:'ถนนเอ',alignment:'arc',points:[{x:-300,y:0},{x:300,y:0}],section:sec}]});};
const S1={id:'S1',start:200,end:400,taperIn:30,taperOut:30,forwardLanes:3,backwardLanes:2,walk:.75,bands:[{type:'shoulder',width:2.5}]};
const geo=()=>{const P=comp().project;return lg.resolveLinkSectionGeometry(P,P.links[0]);};
const idx=(g,s)=>g.stations.findIndex(v=>v>=s-1e-6);

// 1. A stretch with one more lane (drawing direction), a narrow footway and a wide shoulder.
fresh();assert.equal(comp().project.links[0].components.length,0,'old files: unchanged');
{const before=JSON.stringify(e.project);run({type:'road.setSectionStretches',roadId:'A',stretches:[S1]});
 const P=comp().project,l=P.links[0];assert.equal(l.sectionProfile.mode,'linear');assert.equal(n.validateNetworkProject(P),null);
 assert.deepEqual(l.components.map(x=>x.id).sort(),['st-S1-f1','st-S1-shoulder-b','st-S1-shoulder-f','st-S1-walk-b','st-S1-walk-f']);
 const g=geo(),i0=idx(g,100),i1=idx(g,300),w=(walk,i)=>Math.abs(walk.outer[i]-walk.inner[i]),sh=(side,i)=>{const b=(side==='f'?g.forwardBands:g.backwardBands).find(x=>x.type==='shoulder');return Math.abs(b.outer[i]-b.inner[i]);};
 assert.ok(near(w(g.forwardWalk,i0),2)&&near(w(g.forwardWalk,i1),.75),'footway 2 → 0.75 m');assert.ok(near(w(g.backwardWalk,i1),.75));
 assert.ok(near(sh('f',i0),1)&&near(sh('f',i1),2.5)&&near(sh('b',i1),2.5),'shoulder 1 → 2.5 m');
 assert.ok(near(g.left[i1]-g.left[i0],3.25),'one more lane in the drawing direction');assert.ok(near(Math.abs(g.right[i1]),Math.abs(g.right[i0])),'the other direction keeps its lanes');
 assert.equal(JSON.stringify(comp()),JSON.stringify(comp()));assert.equal(rp.validateRoadFirstProject(JSON.parse(JSON.stringify(e.project))),null);
 e=c.undo(e).editor;assert.equal(JSON.stringify(e.project),before,'one undo');e=c.redo(e).editor;}

// 2. A footway taken away over a bridge keeps the engine's 5 cm, drawn as nothing to speak of.
{run({type:'road.setSectionStretches',roadId:'A',stretches:[{...S1,walk:0}]});const g=geo(),i=idx(g,300);assert.ok(Math.abs(g.forwardWalk.outer[i]-g.forwardWalk.inner[i])<=.051);}

// 3. Refusals with the reason.
{const f=(x,re)=>assert.match(c.executeCommand(e.project,{type:'road.setSectionStretches',roadId:'A',stretches:[x]}).error,re);
 f({...S1,forwardLanes:0},/อย่างน้อย 1 ช่อง/);f({...S1,forwardLanes:5},/ไม่เกิน 2 ช่อง/);f({...S1,walk:9},/ไม่เกิน 5 ม\./);
 f({...S1,bands:[{type:'bike',width:2}]},/ไม่มีแถบ bike/);f({...S1,taperIn:150,taperOut:100},/ช่วงเปลี่ยน/);f({...S1,end:700},/เลยปลายถนน/);}

// 4. Nothing changed / cut by a junction: items to check.
{run({type:'road.setSectionStretches',roadId:'A',stretches:[{...S1,forwardLanes:2,walk:2,bands:[{type:'shoulder',width:1}]}]});assert.ok(comp().issues.some(i=>/ไม่มีอะไรเปลี่ยน/.test(i)));
 run({type:'road.setSectionStretches',roadId:'A',stretches:[S1]});run({type:'road.add',road:{id:'X',name:'ถนนตัด',points:[{x:0,y:-200},{x:0,y:200}],section:{...sec,bands:[]}}});
 assert.ok(comp().issues.some(i=>/หน้าตัดเฉพาะช่วง 200–400 ม\. ถูกตัดที่ช่วงเข้าทางแยก/.test(i)));run({type:'road.remove',roadId:'X'});}

// 5. Carried on the ground through reverse (lanes swap with the direction), split and join.
{const before=JSON.parse(JSON.stringify(e.project));
 run({type:'road.reverse',roadId:'A'});const x=R('A').sectionStretches[0];assert.deepEqual([x.start,x.end,x.forwardLanes,x.backwardLanes],[200,400,2,3]);
 run({type:'road.reverse',roadId:'A'});assert.deepEqual(e.project.roads,before.roads,'twice: identity');
 run({type:'road.split',roadId:'A',at:{x:0,y:0},newId:'A2'});assert.deepEqual(R('A').sectionStretches.map(y=>[y.start,y.end,y.taperOut]),[[200,300,0]]);assert.deepEqual(R('A2').sectionStretches.map(y=>[y.start,y.end,y.taperIn]),[[0,100,0]]);
 run({type:'road.join',roadId:'A',otherId:'A2'});assert.deepEqual(R('A').sectionStretches.map(y=>[y.start,y.end]),[[200,300],[300,400]]);}

// 6. A new stretch: the road's section plus one lane each way, on the longest free stretch.
{const r=ss.newStretch({...R('A'),sectionStretches:[]},[{start:0,end:600}]).stretch;assert.deepEqual([r.start,r.end,r.forwardLanes,r.backwardLanes,r.walk,r.taperIn],[200,400,3,3,2,30]);}
console.log('PASS section stretches: old files unchanged, add lanes or reduce one curb lane / footway / shoulder over a stretch (plan geometry, deterministic, save / reopen, one undo), footway to 5 cm, refusals, items to check, carried through reverse / split / join, new stretch');
