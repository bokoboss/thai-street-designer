// Run verify-junction.cjs first to compile the pure modules.
const assert=require('node:assert/strict');
const {buildVisibility,visibleOrder,cameraDirection}=require('../.sites-runtime/visibility3d.cjs');
const {initial}=require('../.sites-runtime/model.cjs');
const {edges,rotate,armTurn}=require('../.sites-runtime/geometry.cjs');
const {furnitureFaces}=require('../.sites-runtime/furniture3d.cjs');
const d=initial();d.trees=true;d.lights=true;
const faces=furnitureFaces(d);
for(const e of edges(d)){const p=[...e.outer,...e.walk.slice().reverse()].map(p=>rotate(p,armTurn(d,e.i)));faces.push({points:p.map(p=>({...p,z:.18})),color:'#bdc9ce'});for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];faces.push({points:[{...p[i],z:0},{...q,z:0},{...q,z:.18},{...p[i],z:.18}],color:'#8d9ca4'});}}
const start=performance.now(),tree=buildVisibility(faces);console.log('Visibility build ms:',Math.round(performance.now()-start),'input faces:',faces.length,'split faces:',visibleOrder(tree,cameraDirection(0,52)).length);
function projected(f,yaw,pitch){const a=yaw*Math.PI/180,p=pitch*Math.PI/180;return f.points.map(v=>{const x=v.x*Math.cos(a)-v.y*Math.sin(a),y=v.x*Math.sin(a)+v.y*Math.cos(a);return {x,y:y*Math.cos(p)-v.z*Math.sin(p),z:y*Math.sin(p)+v.z*Math.cos(p)};});}
function depthAt(ps,x,y){let inside=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}if(!inside)return null;const a=ps[0];for(let i=1;i<ps.length-1;i++){const b=ps[i],c=ps[i+1],det=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(Math.abs(det)<1e-9)continue;const u=((x-a.x)*(c.y-a.y)-(y-a.y)*(c.x-a.x))/det,v=((b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x))/det;return a.z+u*(b.z-a.z)+v*(c.z-a.z);}return null;}
let comparisons=0;
for(const pitch of [10,52,78])for(let yaw=0;yaw<360;yaw+=30){const ordered=visibleOrder(tree,cameraDirection(yaw,pitch)).map(f=>({f,ps:projected(f,yaw,pitch)})),original=faces.map(f=>({f,ps:projected(f,yaw,pitch)}));
// Sample the center of each furniture face, slightly off exact polygon boundaries.
for(let k=0;k<original.length;k+=13){const ps=original[k].ps,x=ps.reduce((s,p)=>s+p.x,0)/ps.length+.0013,y=ps.reduce((s,p)=>s+p.y,0)/ps.length+.0021;let expected=-Infinity,actual=-Infinity;for(const o of original){const z=depthAt(o.ps,x,y);if(z!==null)expected=Math.max(expected,z);}for(const o of ordered){const z=depthAt(o.ps,x,y);if(z!==null)actual=z;}if(expected===-Infinity)continue;assert(Math.abs(expected-actual)<1e-5,`Occlusion mismatch yaw=${yaw} pitch=${pitch} depth ${actual} vs ${expected}`);comparisons++;}}
console.log('PASS actual nearest-surface visibility across 36 camera angles:',comparisons,'overlap probes');
