// Phase 2 slice 2 — fit-based arm length (ADR-0002 L2) and length-aware divider (L4).
// An arm only has to be long enough for what it carries; the solid divider is drawn
// up to the arm end instead of forcing the arm to be long.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const m=T('core/junction/model.cjs'),g=T('core/junction/geometry.cjs'),v=T('core/junction/design-validation.cjs');
const fit=T('core/junction/arm-fit.cjs'),rv=T('core/junction/reviews.cjs'),n=T('core/network/network-project.cjs');

const withArm=(d,i,patch)=>({...d,arms:d.arms.map((a,k)=>k===i?{...a,...patch}:a)});
const lengthError=e=>!!e&&/สั้นเกินไป|ไม่พอ|ยาวเกินขาถนน|เริ่มหลัง/.test(e);

// 1. The fixed 45 m floor is gone; the floor is what the arm carries.
const base=m.initial(),mouth=g.armMouth(base,0),req=fit.requiredArmLength(base,0);
assert(req<45,`plain four-leg arm needs less than 45 m (got ${req.toFixed(2)})`);
assert(req>=mouth+fit.ARM_MOUTH_CLEARANCE-1e-9,'arm still extends past the junction mouth');
const short=withArm(base,0,{length:req});
assert.equal(v.designError(short),null,'arm at its required length is valid');
assert(lengthError(v.designError(withArm(base,0,{length:req-.5}))),'shorter than required is rejected with a length message');
assert.equal(m.valid(withArm(base,0,{length:fit.ARM_LENGTH_MIN})),true,'schema floor is the data floor, not 45 m');
assert.equal(m.valid(withArm(base,0,{length:fit.ARM_LENGTH_MIN-1})),false);

// 2. Requirement follows content: pockets and median openings lengthen it.
const pocket=withArm(base,0,{incomingPockets:{left:{...m.emptyPockets().left},right:{...m.emptyPockets().right,lanes:1,length:40,taper:20}}});
const reqPocket=fit.requiredArmLength(pocket,0);
assert(reqPocket>req+40,'pocket storage + taper raise the requirement');
assert.equal(v.designError(withArm(pocket,0,{length:reqPocket})),null);
assert(lengthError(v.designError(withArm(pocket,0,{length:reqPocket-.5}))));
const opening=withArm(base,0,{medianOpenings:[{id:'o1',start:30,length:12}]});
const reqOpen=fit.requiredArmLength(opening,0);
assert(Math.abs(reqOpen-(g.armMouth(opening,0)+30+12+1))<1e-6,'median opening end + 1 m');
assert.equal(v.designError(withArm(opening,0,{length:reqOpen+.01})),null);
assert(lengthError(v.designError(withArm(opening,0,{length:reqOpen-.5}))));

// 3. Roundabout splitter remains part of the fit.
const ra={...m.initial(),type:'roundabout'},reqRa=fit.requiredArmLength(ra,0);
assert.equal(v.designError(withArm(ra,0,{length:reqRa})),null,'roundabout arm at required length');
assert(v.designError(withArm(ra,0,{length:reqRa-.5})),'roundabout arm shorter than splitter fit');

// 4. Requirement does not depend on the arm's own length (safe for drag clamps).
for(const L of [req,60,92,200])assert(Math.abs(fit.requiredArmLength(withArm(base,0,{length:L}),0)-req)<1e-6,`requirement stable at ${L} m`);
assert.equal(fit.fitArmLength(base,0,10),req);assert.equal(fit.fitArmLength(base,0,999),fit.ARM_LENGTH_MAX);assert.equal(fit.fitArmLength(base,0,70),70);

// 5. Length-aware divider: the configured solid length is kept as intent and the drawn line stops at the arm end.
const r=g.dividerRange(short.arms[0],mouth,false,1);
assert(r.mode==='solid'&&Math.abs(r.end-req)<1e-6,'solid divider is drawn to the arm end');
assert.equal(short.arms[0].solidLength,36,'configured solid length is not rewritten');
const shown=fit.dividerFit(short,0);
assert(shown.incoming&&shown.incoming.shown<shown.incoming.requested,'incoming divider reports shortened length');
const notes=rv.designReviews(short).filter(x=>x.selection.kind==='approach'&&x.selection.arm===0&&/เส้นทึบ/.test(x.message));
assert.equal(notes.length,1,'one note for the shortened solid divider');assert.equal(notes[0].level,'note');
assert(!/มาตรฐาน|กรมทางหลวง/.test(notes[0].message),'note does not claim a standard');
assert.equal(rv.designReviews(base).filter(x=>/เส้นทึบ/.test(x.message)).length,0,'long arms get no divider note');

// 6. Network arm edit clamps to the fit, not to 45 m.
const p=n.createNetworkProject(),J=p.junctions[0],a0=J.design.arms[0];
const edited=n.updateJunctionArmGeometry(p,J.id,0,a0.angle,1);
assert.equal(edited.error,null);
const got=edited.project.junctions[0].design.arms[0].length,need=fit.requiredArmLength(J.design,0);
assert(Math.abs(got-+need.toFixed(2))<.011&&got<45,`arm clamps to its fit (${got} m)`);

// 7. Road-first: junctions 70 m apart now compile on the alignment (the 45 m floor needed ~90 m).
const rf=T('core/road-first/derive.cjs');
const sec=(f=2,b=2)=>({forwardLanes:f,backwardLanes:b,laneWidth:3.25,median:2,walk:2});
const pair=gap=>{const roads=[{id:'R1',name:'หลัก',points:[{x:-150,y:0},{x:gap+150,y:0}],section:sec()},
  {id:'R2',name:'ซอย 1',points:[{x:0,y:-120},{x:0,y:120}],section:sec(1,1)},{id:'R3',name:'ซอย 2',points:[{x:gap,y:-120},{x:gap,y:120}],section:sec(1,1)}];
  return rf.compileRoadNetwork(roads,rf.detectCandidates(roads).map(c=>({candidateId:c.id,decision:'junction'})),{approachLength:60});};
const close70=pair(70);
assert.deepEqual(close70.issues,[],'70 m spacing fits without stretching');
assert.equal(n.validateNetworkProject(close70.project),null);
for(const j of close70.project.junctions)assert.equal(v.designError(j.design),null);
const between=close70.project.links.find(l=>n.isJunctionPort(l.from)&&n.isJunctionPort(l.to));
assert(between&&n.linkLength(close70.project,between)>=5-1e-6,'a short link is kept between the two junctions');
const tooClose=pair(40);
assert(tooClose.issues.some(s=>/ต้องยาวอย่างน้อย/.test(s)),'junctions closer than their arms need are reported');

console.log(`PASS arm fit: requirement ${req.toFixed(1)} m for a plain arm (was 45 m), pockets/openings/splitter raise it, divider drawn to arm end with a review note, network edit clamps to fit, road-first junctions 70 m apart compile`);
