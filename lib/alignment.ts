import {offset,selfIntersects,type P} from '../app/junction/geometry';
export type Alignment={vertices:P[]};
export type RadiusPoint=P&{radius?:number};
export const lengthOf=(ps:P[])=>ps.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-ps[i].x,p.y-ps[i].y),0);
export function station(ps:P[],distance:number){let remain=Math.max(0,distance);for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(remain<=len||i===ps.length-1){const t=Math.min(1,remain/(len||1));return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,index:i-1};}remain-=len;}return{...ps[0],angle:0,index:0};}
export function projectAlignment(ps:P[],p:P){let before=0,best={t:0,distance:Infinity,point:ps[0],index:0};const total=lengthOf(ps);for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len||1))),q={x:a.x+u*dx,y:a.y+u*dy},distance=Math.hypot(q.x-p.x,q.y-p.y);if(distance<best.distance)best={t:(before+u*len)/(total||1),distance,point:q,index:i-1};before+=len;}return best;}
export const parallel=(ps:P[],leftOffset:number)=>offset(ps,-leftOffset,-leftOffset);
export const variableParallel=(ps:P[],leftStart:number,leftEnd:number)=>offset(ps,-leftStart,-leftEnd);

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const unit=(x:number,y:number)=>{const l=Math.hypot(x,y)||1;return{x:x/l,y:y/l};};
const signedTurn=(a:P,b:P,c:P)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);

export function smoothAlignment(vertices:RadiusPoint[],curveSamples=14):P[]{
 if(vertices.length<3)return vertices.map(({x,y})=>({x,y}));
 const out:P[]=[{x:vertices[0].x,y:vertices[0].y}];
 for(let i=1;i<vertices.length-1;i++){
  const a=vertices[i-1],b=vertices[i],c=vertices[i+1],requested=Math.max(0,Number(b.radius)||0),
   ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y);
  if(requested<.25||ab<3||bc<3){out.push({x:b.x,y:b.y});continue;}
  const u=unit(a.x-b.x,a.y-b.y),v=unit(c.x-b.x,c.y-b.y),dot=clamp(u.x*v.x+u.y*v.y,-1,1),theta=Math.acos(dot),
   turn=Math.PI-theta;
  if(turn<.01||theta<.08){out.push({x:b.x,y:b.y});continue;}
  const tanHalf=Math.tan(theta/2),maxTangent=Math.min(ab,bc)*.45,maxRadius=Math.max(0,maxTangent*tanHalf),radius=Math.min(requested,maxRadius),
   tangent=radius/(tanHalf||1);
  if(radius<.25||tangent<.1){out.push({x:b.x,y:b.y});continue;}
  const p1={x:b.x+u.x*tangent,y:b.y+u.y*tangent},p2={x:b.x+v.x*tangent,y:b.y+v.y*tangent},
   bisector=unit(u.x+v.x,u.y+v.y),centerDistance=radius/(Math.sin(theta/2)||1),center={x:b.x+bisector.x*centerDistance,y:b.y+bisector.y*centerDistance},
   a1=Math.atan2(p1.y-center.y,p1.x-center.x),a2=Math.atan2(p2.y-center.y,p2.x-center.x),ccw=signedTurn(a,b,c)>0;
  let sweep=a2-a1;
  if(ccw&&sweep<0)sweep+=Math.PI*2;
  if(!ccw&&sweep>0)sweep-=Math.PI*2;
  const last=out.at(-1)!;
  if(Math.hypot(last.x-p1.x,last.y-p1.y)>.001)out.push(p1);
  for(let j=1;j<=curveSamples;j++){
   const t=j/curveSamples,angle=a1+sweep*t;
   out.push({x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius});
  }
 }
 const end=vertices.at(-1)!;const last=out.at(-1)!;
 if(Math.hypot(last.x-end.x,last.y-end.y)>.001)out.push({x:end.x,y:end.y});
 return out;
}

export function validAlignment(ps:P[]){return !selfIntersects(ps,false)&&ps.slice(1,-1).every((p,i)=>{const a=ps[i],b=ps[i+2],ux=p.x-a.x,uy=p.y-a.y,vx=b.x-p.x,vy=b.y-p.y;return (ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy)||1)>-.76;})&&ps.length>=2&&ps.length<=100&&ps.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&ps.slice(1).every((p,i)=>Math.hypot(p.x-ps[i].x,p.y-ps[i].y)>=3);}
