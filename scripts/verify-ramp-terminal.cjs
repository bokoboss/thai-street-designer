// Ramp terminals: tangent tie-in and gore from the same lines as the roads (docs/spec/RAMP_TERMINALS.md).
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const c=T('core/road-first/commands.cjs'),rp=T('core/road-first/project.cjs'),rm=T('core/road-first/ramps.cjs'),n=T('core/network/network-project.cjs'),sg=T('core/network/network-scene-geometry.cjs');
const sec={forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:3,walk:0};
const ramp=(id,points)=>({id,name:id,role:'ramp',points,section:{...rm.RAMP_SECTION}});
const edge=1.5+2*3.25,h=rm.RAMP_SECTION.laneWidth/2,deg=Math.PI/180;
const angle=(a,b)=>{const d=Math.atan2(b.y,b.x)-Math.atan2(a.y,a.x);return Math.abs(Math.atan2(Math.sin(d),Math.cos(d)));};
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});

// Matrix: diverge / merge × eastbound (top) / westbound (bottom) × main road drawn either way.
for(const reversed of [false,true]){
  const main=reversed?[{x:400,y:0},{x:-400,y:0}]:[{x:-400,y:0},{x:400,y:0}];
  const cases=[['diverge eastbound',[{x:-100,y:0},{x:0,y:-40}],'start',-1,1],['merge eastbound',[{x:0,y:-40},{x:100,y:0}],'end',-1,1],
    ['diverge westbound',[{x:100,y:0},{x:0,y:40}],'start',1,-1],['merge westbound',[{x:0,y:40},{x:-100,y:0}],'end',1,-1]];
  for(const [name,points,end,ySide,travel] of cases){
    const label=`${name}${reversed?' (road drawn westward)':''}`;
    const e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[{id:'M',name:'ถนนหลัก',alignment:'arc',points:main,section:sec}]});
    const x=c.runCommand(e,{type:'road.add',road:ramp('X',points)});assert.equal(x.result.error,null,label);
    const C=rp.compileRoadFirstProject(x.editor.project);assert.equal(n.validateNetworkProject(C.project),null);
    assert.equal(C.project.rampTapers.length,1,label);const t=C.project.rampTapers[0],ti=t.points,r=x.editor.project.roads.find(q=>q.id==='X');
    const p=r.points[end==='start'?0:r.points.length-1],q=r.points[end==='start'?1:r.points.length-2],u={x:(q.x-p.x)/Math.hypot(q.x-p.x,q.y-p.y),y:(q.y-p.y)/Math.hypot(q.x-p.x,q.y-p.y)};
    // Starts on the main road edge of the ramp's own traffic side, tangent to it, a taper length from the attachment.
    assert.ok(Math.abs(Math.abs(ti[0].y)-edge)<1e-3&&Math.sign(ti[0].y)===ySide,`${label}: tie-in starts on the edge`);
    assert.ok(angle(sub(ti[1],ti[0]),{x:1,y:0})<2*deg||angle(sub(ti[1],ti[0]),{x:-1,y:0})<2*deg,`${label}: tangent to the main road`);
    const upstream=end==='start'?-travel:travel;assert.ok(Math.sign(ti[0].x-p.x)===upstream,`${label}: tie-in ${end==='start'?'before the diverge':'after the merge'}`);
    // Ends at the ramp end's outer corner, arriving along the ramp (C1), then the ramp end point.
    const O=ti[ti.length-2];assert.ok(Math.abs(Math.hypot(O.x-p.x,O.y-p.y)-h)<1e-3,`${label}: ramp end corner`);assert.ok(Math.abs(O.y)>Math.abs(p.y),`${label}: outer corner off the road`);
    assert.ok(angle(sub(O,ti[ti.length-3]),u)<2*deg,`${label}: arrives along the ramp`);
    assert.deepEqual(ti.at(-1),{x:Math.round(p.x*1000)/1000,y:Math.round(p.y*1000)/1000});
    // Gore: outside the travelled way, on the edge at two corners, GORE_WIDTH out at the nose, beyond the attachment.
    assert.equal(t.gore.length,3,`${label}: gore`);const [G,N,E]=t.gore,off=v=>Math.abs(v.y)-edge;
    assert.ok(Math.abs(off(G))<1e-3&&Math.abs(off(E))<1e-3,`${label}: gore corners on the edge`);assert.ok(Math.abs(off(N)-rm.GORE_WIDTH)<1e-3,`${label}: nose ${rm.GORE_WIDTH} m out`);
    assert.ok(Math.sign(N.x-p.x)===-upstream&&Math.sign(G.x-p.x)===-upstream,`${label}: gore on the ramp side of the attachment`);
    assert.ok(t.gore.every(v=>Math.sign(v.y)===ySide),`${label}: gore on the same side`);
    // 3D: tie-in and gore as road surfaces at the main road level.
    const s=sg.resolveRoadLinkSceneSurfaces(C.project);assert.ok(s.some(v=>v.id===`taper:${t.id}`)&&s.some(v=>v.id===`gore:${t.id}`),`${label}: 3D surfaces`);
  }
}

// Follows the main road deterministically; detaching removes the terminal.
{let e=c.createEditor({kind:'road-first',schemaVersion:3,title:'t',decisions:[],options:{},roads:[{id:'M',name:'ถนนหลัก',alignment:'arc',points:[{x:-400,y:0},{x:400,y:0}],section:sec}]});
 const run=cmd=>{const x=c.runCommand(e,cmd);assert.equal(x.result.error,null,x.result.error);e=c.endGesture(x.editor);};
 run({type:'road.add',road:ramp('X',[{x:-100,y:0},{x:0,y:-40}])});
 run({type:'road.movePoint',roadId:'M',index:0,point:{x:-400,y:-10}});run({type:'road.movePoint',roadId:'M',index:1,point:{x:400,y:-10}});
 const t=rp.compileRoadFirstProject(e.project).project.rampTapers[0];assert.ok(Math.abs(t.points[0].y+10+edge)<1e-3,'tie-in follows the moved road');
 assert.equal(JSON.stringify(rp.compileRoadFirstProject(e.project)),JSON.stringify(rp.compileRoadFirstProject(e.project)),'deterministic');
 run({type:'ramp.detach',roadId:'X',end:'start'});assert.equal(rp.compileRoadFirstProject(e.project).project.rampTapers,undefined,'detached: no terminal');}

// Older compiled data (4-point taper, no gore) still validates and draws.
{const P={schemaVersion:5,title:'t',junctions:[],links:[],parallelCorridors:[],roadEnds:[],rampTapers:[{id:'a',points:[{x:0,y:0},{x:1,y:1},{x:2,y:0},{x:1,y:-1}],z:0}]};
 assert.equal(n.validateNetworkProject(P),null);assert.equal(sg.resolveRoadLinkSceneSurfaces(P).filter(s=>s.id.startsWith('taper:')).length,1);
 assert.match(n.validateNetworkProject({...P,rampTapers:[{...P.rampTapers[0],gore:[{x:0,y:0}]}]}),/ทางลาด/);}
console.log('PASS ramp terminals: tie-in tangent to the main road edge and to the ramp (C1) for diverge / merge × both sides × road drawn either way, gore from the same lines outside the travelled way, 3D surfaces, follows the main road, detach, older data');
