import {type Design,sectionFor} from './model';
import {roadObjects} from './objects';
import {activeIds,innerEdge,bounds,carBounds,armMouth,stopPosition,rotate} from './geometry';
export type V={x:number;y:number;z:number};
export type Face={points:V[];color:string};
export function cylinder(x:number,y:number,base:number,height:number,r0:number,r1:number,colors:string[]):Face[]{return Array.from({length:12},(_,i)=>{const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;return {points:[{x:x+r0*Math.cos(a),y:y+r0*Math.sin(a),z:base},{x:x+r0*Math.cos(b),y:y+r0*Math.sin(b),z:base},{x:x+r1*Math.cos(b),y:y+r1*Math.sin(b),z:base+height},{x:x+r1*Math.cos(a),y:y+r1*Math.sin(a),z:base+height}],color:colors[i%colors.length]};});}
function box(x:number,y:number,z:number,dx:number,dy:number,dz:number,color:string):Face[]{const p=[{x,y,z},{x:x+dx,y,z},{x:x+dx,y:y+dy,z},{x,y:y+dy,z},{x,y,z:z+dz},{x:x+dx,y,z:z+dz},{x:x+dx,y:y+dy,z:z+dz},{x,y:y+dy,z:z+dz}];return [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]].map(ids=>({points:ids.map(i=>p[i]),color}));}
function transform(fs:Face[],angle:number,x=0,y=0):Face[]{return fs.map(f=>({...f,points:f.points.map(p=>{const q=rotate(p,angle/90);return {x:q.x+x,y:q.y+y,z:p.z};})}));}
export function furnitureFaces(d:Design):Face[]{const fs:Face[]=[];
 for(const o of roadObjects(d)){
  if(o.kind==='tree'){const h=o.height,r=o.size/2;fs.push(...cylinder(o.x,o.y,.18,h*.55,Math.min(.35,o.size*.055),.09,['#826954','#6f5a46']),...cylinder(o.x,o.y,.18+h*.32,h*.4,r*.45,r,['#4c8b65','#54996c','#69a67b','#43845d']),...cylinder(o.x,o.y,.18+h*.72,h*.28,r,0,['#65a377','#579669','#72ad82','#4d8a63']));}
  else {const h=o.height+.18,t=o.size,end=-o.side*o.reach;const local=[...cylinder(0,0,.18,o.height,t/2,t*.32,['#536673','#728895']),...box(-t/2,Math.min(0,end),h-t/2,t,Math.abs(end),t,'#718895'),...box(-.24,end-.45,h-.16,.48,.9,.2,'#c3cdd1'),...box(-.2,end-.38,h-.17,.4,.76,.025,'#fff2ba')];fs.push(...transform(local,o.angle,o.x,o.y));}
 }
 for(const i of activeIds(d)){const core=armMouth(d,i),a=d.arms[i];if(!a.signal||!a.incoming)continue;const x=d.type==='roundabout'?core+5:stopPosition(a,core),post=bounds(a)[1]+Math.min(.5,sectionFor(a,'incoming').walk/2),center=(innerEdge(a,1,x,stopPosition(a,core))+carBounds(a,x,stopPosition(a,core))[1])/2,h=6;
 const local=[...cylinder(x,post,.18,h,.16,.11,['#465b67','#71838d']),...box(x-.1,center-1.2,h,.2,post-center+1.2,.2,'#647a87'),...box(x-.2,center-1.25,h-.95,.4,2.5,.9,'#17262e')];
 // Incoming drivers face local -X: increasing local Y is their left.
 ['#ef5149','#f5c34b','#50c98c'].forEach((color,k)=>{const y=center+.8-k*.8,z=h-.5;local.push({points:Array.from({length:16},(_,j)=>({x:x+.205,y:y+.27*Math.cos(j/16*Math.PI*2),z:z+.27*Math.sin(j/16*Math.PI*2)})),color});local.push(...box(x+.2,y-.32,z+.28,.25,.64,.06,'#101c23'));});fs.push(...transform(local,a.angle));
 }
 return fs;
}
