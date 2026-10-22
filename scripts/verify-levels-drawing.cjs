// Phase 4B-2 — levels while drawing and stacked levels (docs/spec/PHASE_4B_LEVELS.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),el=T('core/road-first/elevation.cjs'),lg=T('core/network/network-link-geometry.cjs'),n=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:0};
const editor=roads=>c.createEditor({kind:'road-first',schemaVersion:1,title:'t',decisions:[],options:{},roads});
const runner=box=>cmd=>{const x=c.runCommand(box.e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);box.e=c.endGesture(x.editor);return x.result;};
// 1. A road drawn at levels gets a profile through its points; at level 0 it has none.
const pts=[{x:0,y:0},{x:100,y:0},{x:200,y:0}];
assert.deepEqual(el.drawnProfile(pts,[0,6,6]),[{station:0,z:0},{station:100,z:6},{station:200,z:6}]);
assert.equal(el.drawnProfile(pts,[0,0,0]),undefined);
// 2. Drawing at a level gives the same design as typing the levels afterwards.
{const base=[{id:'A',name:'ถนน 1',points:[{x:-200,y:0},{x:200,y:0}],section:sec}],line=[{x:0,y:-300},{x:0,y:-100},{x:0,y:100},{x:0,y:300}],levels=[0,7,7,0];
 const a={e:editor(base)},b={e:editor(base)};
 const ra=runner(a)({type:'road.add',road:{id:'B',name:'ถนน 2',points:line,section:sec,profile:el.drawnProfile(line,levels)}});
 assert.equal(ra.autoJunctions.length,0);assert.equal(ra.autoSeparated.length,1,'drawn high: grade separation at once');
 runner(b)({type:'road.add',road:{id:'B',name:'ถนน 2',points:line,section:sec}});const j=b.e.project.decisions[0].candidateId;
 runner(b)({type:'road.setProfile',roadId:'B',profile:el.drawnProfile(line,levels)});runner(b)({type:'crossing.decide',candidateId:j,decision:'grade-separated'});
 const strip=p=>JSON.stringify({links:p.project.links,crossings:p.crossings.map(x=>({...x}))});
 assert.equal(strip(rp.compileRoadFirstProject(a.e.project)),strip(rp.compileRoadFirstProject(b.e.project)),'same compiled design');
 assert.equal(c.undo(a.e).editor.project.roads.length,1,'one undo removes the drawn road');}
// 3. Continuing a road at a level extends its profile; continuing at its start shifts the profile.
{const box={e:editor([{id:'R',name:'ถนน',points:[{x:0,y:0},{x:100,y:0}],section:sec}])},run=runner(box),R=()=>box.e.project.roads[0];
 run({type:'road.extend',roadId:'R',atStart:false,points:[{x:200,y:0}],levels:[6]});
 assert.deepEqual(R().profile,[{station:0,z:0},{station:100,z:0},{station:200,z:6}]);
 run({type:'road.extend',roadId:'R',atStart:true,points:[{x:-50,y:0}],levels:[3]});
 assert.deepEqual(R().profile,[{station:0,z:3},{station:50,z:0},{station:150,z:0},{station:250,z:6}]);
 run({type:'road.extend',roadId:'R',atStart:true,points:[{x:-80,y:0}]});
 assert.equal(el.levelAt(R().profile,30),3,'continued without a level: the old start level is kept');}
// 4. Stack: three roads at one point at 0, 7 and 14 m — no junction, one crossing per pair, drawn in level order.
{const box={e:editor([{id:'A',name:'ล่าง',points:[{x:-200,y:0},{x:200,y:0}],section:sec}])},run=runner(box);
 run({type:'road.add',road:{id:'B',name:'กลาง',points:[{x:0,y:-200},{x:0,y:200}],section:sec,profile:[{station:0,z:7},{station:400,z:7}]}});
 run({type:'road.add',road:{id:'C',name:'บน',points:[{x:-150,y:-150},{x:150,y:150}],section:sec,profile:[{station:0,z:14},{station:500,z:14}]}});
 const C=rp.compileRoadFirstProject(box.e.project);assert.equal(C.project.junctions.length,0);
 assert.equal(C.crossings.length,3,'one crossing per pair');assert.ok(C.crossings.every(x=>x.relation==='over'));
 assert.deepEqual(C.crossings.map(x=>x.over+'>'+x.under).sort(),['B>A','C>A','C>B']);
 assert.equal(new Set(C.project.crossings.map(x=>x.id)).size,3,'unique network crossing ids');assert.equal(n.validateNetworkProject(C.project),null);
 assert.deepEqual(lg.linksInDrawOrder(C.project).map(l=>C.sources.links[l.id]),['A','B','C'],'drawn bottom to top');}
// 5. A road at another level through an existing junction passes over it; the junction keeps its roads.
{const box={e:editor([{id:'A',name:'ถนน 1',points:[{x:-200,y:0},{x:200,y:0}],section:sec}])},run=runner(box);
 run({type:'road.add',road:{id:'B',name:'ถนน 2',points:[{x:0,y:-200},{x:0,y:200}],section:sec}});
 const r=run({type:'road.add',road:{id:'C',name:'ถนนยก',points:[{x:-150,y:-150},{x:150,y:150}],section:sec,profile:[{station:0,z:7},{station:500,z:7}]}});
 assert.match(r.label,/ถนนยก ผ่านต่างระดับที่ทางแยก/);
 const C=rp.compileRoadFirstProject(box.e.project);assert.equal(C.project.junctions.length,1);assert.equal(C.project.junctions[0].design.enabled.filter(Boolean).length,4,'junction keeps its four legs');
 assert.equal(C.crossings.length,2,'passes over both roads of the junction');assert.ok(C.crossings.every(x=>x.over==='C'));
 assert.ok(!C.issues.some(i=>/ไม่ได้เชื่อมเข้าทางแยก/.test(i)),'not reported as left out');}
console.log('PASS 4B-2 levels: drawn profile, drawing = typing, extend with levels, stack of three, pass over a junction');
