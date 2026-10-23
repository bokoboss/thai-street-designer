// Structure envelope and measured clearance at grade-separated crossings (docs/spec/STRUCTURE_CLEARANCE.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const lc=T('core/road-first/level-criteria.cjs'),K=lc.levelCriteria();
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),gs=T('core/road-first/grade-separation.cjs'),sc=T('core/road-first/structure-clearance.cjs');
const sg=T('core/network/network-scene-geometry.cjs'),rep=T('core/network/network-design-report.cjs'),n=T('core/network/network-project.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:2};
const near=(a,b,eps=.02)=>Math.abs(a-b)<=eps;
const editor=(roads,decisions=[],options={})=>c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions,options,roads});
let e;
const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,cmd.type+' → '+x.result.error);e=c.endGesture(x.editor);return x.result;};
const comp=()=>rp.compileRoadFirstProject(e.project);
const travelHalf=s=>s.median/2+2*s.laneWidth; // one side of the travelled way (no footway)
const fullHalf=s=>travelHalf(s)+s.walk;

// 1. Level bridge made by the tool: clearance = rise − structure depth = the project clearance, measured over the overlap.
e=editor([{id:'L',name:'ถนนล่าง',points:[{x:-400,y:0},{x:400,y:0}],section:sec},{id:'U',name:'ถนนบน',points:[{x:0,y:-400},{x:0,y:400}],section:sec}]);
{const cand=T('core/road-first/derive.cjs').detectCandidates(e.project.roads)[0];
 run(gs.overCommand(e.project,cand.id,'U').cmd);}
{const x=comp().crossings[0],m=x.clearance;
 assert.equal(x.over,'U');assert.equal(m.structure,'deck');assert.equal(m.depth,K.deckDepth.value);
 assert.ok(near(m.min,K.clearance.value),`flat bridge: measured ${m.min} = clearance ${K.clearance.value}`);
 // The overlap: the upper road's full width along the lower road, the lower travelled way along the upper road.
 assert.ok(near(m.spanUnder[1]-m.spanUnder[0],2*fullHalf(sec),.6),'span on the lower road = upper road width');
 assert.ok(near(m.spanOver[1]-m.spanOver[0],2*travelHalf(sec),.6),'span on the upper road = lower travelled way');
 assert.ok(!comp().issues.some(i=>/ช่องลอด/.test(i)),'no clearance flag at the set value');
 // Network carries it for 3D / export; the same span drives the plan deck (overlap + display margin).
 const nc=comp().project.crossings[0];assert.ok(near(nc.clearance.min,m.min,1e-9));assert.equal(nc.clearance.structure,'deck');
 const d=Math.hypot(nc.deck.b.x-nc.deck.a.x,nc.deck.b.y-nc.deck.a.y);
 assert.ok(near(d,m.spanOver[1]-m.spanOver[0]+2*T('core/road-first/derive.cjs').STRUCTURE_MARGIN,.01),'plan deck = measured span + margin');
 assert.deepEqual(comp().project.structure,{deckDepth:K.deckDepth.value,tunnelRoof:K.tunnelRoof.value});
 // 3D deck sides go down by the project's structure depth, not a picture constant.
 const faces=sg.resolveElevatedLinkScene(comp().project).faces.filter(f=>f.layer==='deck');
 assert.ok(faces.length&&faces.every(f=>near(f.points[0].z-.03-Math.max(f.points[3].z,0),Math.min(f.points[0].z-.03,K.deckDepth.value),1e-6)),'3D deck depth from the criteria');
 // Report shows the measured value next to the centre-line gap.
 const report=rep.buildNetworkDesignReport(comp().project,'ปัจจุบัน');
 assert.ok(near(report.crossings[0].clearance,m.min,1e-9));assert.equal(report.crossings[0].structure,'deck');
 assert.match(rep.networkDesignReportHtml(report),/ช่องลอดที่วัดได้/);
 // Deterministic.
 assert.equal(JSON.stringify(comp()),JSON.stringify(comp()));}

// 2. A lower road on a grade under a level deck: the smallest clearance is where the lower road is highest under the
//    deck, not at the centre lines; it falls below the set value and is flagged to check.
{const g=.04,U={id:'U',name:'ถนนบน',points:[{x:0,y:-400},{x:0,y:400}],section:sec,profile:[{station:0,z:6.5},{station:800,z:6.5}]};
 const L={id:'L',name:'ถนนล่าง',points:[{x:-400,y:0},{x:400,y:0}],section:sec,profile:[{station:0,z:-16},{station:800,z:16}]};
 e=editor([L]);run({type:'road.add',road:U});const x=comp().crossings[0],m=x.clearance;
 assert.equal(x.over,'U');assert.ok(near(x.gap,6.5),'centre-line gap still 6.5');
 const expected=6.5-K.deckDepth.value-g*fullHalf(sec);
 assert.ok(near(m.min,expected,.03),`sloped lower road: ${m.min} ≈ ${expected}`);
 assert.ok(m.min<K.clearance.value,'below the centre-line figure');assert.ok(m.atUnder>400,'lowest clearance on the high side');
 assert.ok(comp().issues.some(i=>/ช่องลอดที่วัดได้ .* น้อยกว่าที่ตั้งไว้ 5 ม\. · ค่ายังไม่มีแหล่งอ้างอิง — ต้องตรวจตามเกณฑ์/.test(i)),'flagged to check, TO_VERIFY');
 // 3. Changing what it depends on re-measures: a lower project value clears the flag; a wider upper road lowers the minimum.
 run({type:'project.setLevelCriteria',patch:{clearance:{value:4,source:'ทดสอบ'}}});
 assert.ok(!comp().issues.some(i=>/ช่องลอดที่วัดได้/.test(i)),'criterion lowered: no flag');
 const before=comp().crossings[0].clearance.min;
 run({type:'road.setSection',roadId:'U',patch:{walk:4}});
 assert.ok(near(comp().crossings[0].clearance.min,before-g*2,.03),'wider deck: clearance re-measured lower');}

// 4. Skewed crossing: still the whole overlap; longer span on the lower road.
{const U={id:'U',name:'ถนนบน',points:[{x:-300,y:-300},{x:300,y:300}],section:sec,profile:[{station:0,z:6.5},{station:900,z:6.5}]};
 e=editor([{id:'L',name:'ถนนล่าง',points:[{x:-400,y:0},{x:400,y:0}],section:sec}]);run({type:'road.add',road:U});
 const m=comp().crossings[0].clearance;assert.ok(near(m.min,5),'skew, flat: clearance 5');
 assert.ok(m.spanUnder[1]-m.spanUnder[0]>2*fullHalf(sec)*1.3,'skew: longer structure along the lower road');}

// 5. Tunnel: the lower road dips below ground; measured under the roof; portals open from the road up to the roof underside.
e=editor([{id:'L',name:'ถนนล่าง',points:[{x:-400,y:0},{x:400,y:0}],section:sec},{id:'U',name:'ถนนบน',points:[{x:0,y:-400},{x:0,y:400}],section:sec}]);
{const cand=T('core/road-first/derive.cjs').detectCandidates(e.project.roads)[0];run(gs.underCommand(e.project,cand.id,'L').cmd);
 const x=comp().crossings[0],m=x.clearance;assert.equal(x.under,'L');assert.equal(m.structure,'tunnel');assert.equal(m.depth,K.tunnelRoof.value);
 assert.ok(near(m.min,K.clearance.value),'tunnel: clearance under the roof');
 const t=comp().project.crossings[0].tunnel;assert.ok(near(t.soffit,-K.tunnelRoof.value,1e-6),'roof underside');
 const portals=sg.resolveElevatedLinkScene(comp().project).faces.filter(f=>/:portal:/.test(f.id));
 assert.equal(portals.length,2);assert.ok(portals.every(f=>near(Math.max(...f.points.map(p=>p.z)),t.soffit,1e-6)),'3D portal top = roof underside');}

// 6. Not measurable is "unknown", never 0: roads that do not overlap give null and the text says so.
{const far={points:[{x:-50,y:500},{x:50,y:500}],section:sec,profile:[{station:0,z:7}]},road={points:[{x:-400,y:0},{x:400,y:0}],section:sec};
 const m=sc.measureClearance(far,road,50,400,K);assert.equal(m.min,null);assert.equal(sc.clearanceText(m),'ยังวัดไม่ได้');assert.equal(sc.clearanceText(null),'ยังวัดไม่ได้');
 assert.equal(sc.clearanceText({min:0}),'0.00 ม.','a real zero is shown as zero');}

// 7. Older compiled data (no structure depths, tunnel with z only) still draws with the display values.
{const P={schemaVersion:5,title:'t',junctions:[],links:[],parallelCorridors:[],roadEnds:[],crossings:[{id:'X',name:'x',point:{x:0,y:0},relation:'over',gap:7,tunnel:{a:{x:-10,y:0},b:{x:10,y:0},half:5,z:-7}}]};
 const portals=sg.resolveElevatedLinkScene(P).faces.filter(f=>/:portal:/.test(f.id));
 assert.equal(portals.length,2);assert.ok(portals.every(f=>near(Math.max(...f.points.map(p=>p.z)),-7+sg.STRUCTURE_DISPLAY.tunnelOpening,1e-6)));
 assert.equal(n.validateNetworkProject(P),null);}
console.log('PASS structure clearance: measured over the overlap (flat, sloped, skew, tunnel), criteria depth, flag to check with TO_VERIFY, re-measure on change, unknown ≠ 0, same span in plan / 3D / report, older data');
