const ts=require('typescript'),fs=require('fs'),assert=require('node:assert/strict');

// Compile the shared junction allocation/model dependencies plus Free Draw modules.
for(const name of ['allocation','slip-model','model','cross-section']){
  const code=ts.transpileModule(fs.readFileSync('app/junction/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}})
    .outputText.replace(/require\("\.\/([a-z-]+)"\)/g,'require("./$1.cjs")');
  fs.writeFileSync('.sites-runtime/'+name+'.cjs',code);
}
for(const name of ['alignment','network','geometry']){
  const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}})
    .outputText
    .replace(/require\("\.\/(alignment|network|geometry)"\)/g,'require("./network-$1.cjs")')
    .replace(/require\("\.\.\/app\/junction\/(allocation|geometry|model|cross-section)"\)/g,'require("./$1.cjs")');
  fs.writeFileSync('.sites-runtime/network-'+name+'.cjs',code);
}

const a=require('../.sites-runtime/network-alignment.cjs'),
      n=require('../.sites-runtime/network-network.cjs'),
      g=require('../.sites-runtime/network-geometry.cjs');

let r={id:'a',name:'A',a:{x:0,y:0},b:{x:40,y:30},vertices:[{x:0,y:0},{x:40,y:0},{x:40,y:30}],config:g.presets['4-Lane Divided']};
assert.equal(g.generateRoad(r).length,70);
assert.equal(a.station(r.vertices,55).angle,90);
assert.deepEqual(a.stationOffsets(r.vertices),[0,40,70]);
const alignmentProjection=a.projectAlignment(r.vertices,{x:42,y:15});assert.equal(alignmentProjection.station,55);assert.equal(alignmentProjection.offset,-2);assert.equal(alignmentProjection.distance,2);
assert.equal(g.project(r,{x:42,y:15}).distance,2);
assert(a.validAlignment(r.vertices));
assert(!a.validAlignment([{x:0,y:0},{x:20,y:0},{x:1,y:1}]));
const rounded=a.smoothAlignment([{x:0,y:0},{x:40,y:0,radius:10},{x:40,y:30}]);
assert(rounded.length>6,'radius point must resolve to sampled tangent-arc-tangent geometry');
assert(!rounded.some(p=>Math.abs(p.x-40)<1e-8&&Math.abs(p.y)<1e-8),'resolved radius must replace the sharp PI with tangent points');
assert.deepEqual(a.smoothAlignment([{x:0,y:0},{x:40,y:0,radius:0},{x:40,y:30}]),[{x:0,y:0},{x:40,y:0},{x:40,y:30}],'R0 must preserve legacy polyline geometry');

const snap=n.snapEndpoint([r],{x:42,y:31});
assert.deepEqual(snap,r.b);
let rs=[r,{...r,id:'b',a:snap,b:{x:80,y:30},vertices:[snap,{x:80,y:30}]}];
assert.equal(n.networkNodes(rs).filter(x=>x.ends.length>1).length,1);
rs=n.moveVertex(rs,'a',2,{x:45,y:35});
assert.deepEqual(rs[0].b,rs[1].a);
assert.equal(n.networkNodes(rs).filter(x=>x.ends.length>1).length,1);

const pocket={id:'p',roadId:'a',type:'pocket',t:.8,width:3.25,storage:22,taper:18,length:10,side:1,arrow:'right'};
assert(n.pocketIssue(r,pocket),'Pocket spanning a bend must be rejected');

const straight={...r,vertices:undefined,b:{x:200,y:0}};
const centered={...pocket,t:.5};
assert.equal(n.pocketIssue(straight,centered),null);

let impact=n.pocketImpact(straight,centered);
assert.equal(impact.features.incoming.right.requested,3.25);
assert.equal(impact.features.incoming.right.medianUsed,3.25);
assert.equal(impact.features.incoming.right.widening,0);

const narrow={...straight,config:{...straight.config,median:2}};
assert.equal(n.pocketIssue(narrow,centered),null,'Median deficit is a widening consequence, not invalid geometry');
impact=n.pocketImpact(narrow,centered);
assert.equal(impact.features.incoming.right.medianUsed,2);
assert.equal(impact.features.incoming.right.widening,1.25);
assert.equal(impact.residual,0);

const customWidth={...centered,width:3};
impact=n.pocketImpact(straight,customWidth);
assert.equal(impact.features.incoming.right.requested,3);

const oppositeSide={...centered,side:-1,t:.5};
assert.equal(n.pocketIssue(straight,oppositeSide),null);

console.log('PASS polyline stations/projection, radius-resolved tangent arcs, bend validation, endpoint snapping, shared node movement and Free Draw shared Auto pocket allocation');
