// Connect two roads with a tangent curve ("เชื่อมด้วยโค้งสัมผัส"): the end straights of the two roads are lengthened to
// where they meet, the roads are joined there into one, and that point gets the largest radius that fits (or the one
// asked for). Built from ordinary commands in one batch, so it is one undo step and every check of those commands applies.
import type {WorldPoint} from '../network/network-project';
import {executeCommand,type RoadFirstCommand} from './commands';
import type {Road} from './derive';
import {vertexCurve} from './curves';
import type {RoadFirstProject} from './project';

type End='start'|'end';
export type TangentPlan={cmd:RoadFirstCommand;radius:number;maxRadius:number;vertex:WorldPoint;ends:[End,End]};

/** End point of a road and the direction it points out of the road there. */
function endRay(r:Road,end:End){
  const p=end==='end'?r.points.at(-1)!:r.points[0],q=end==='end'?r.points.at(-2)!:r.points[1],l=Math.hypot(p.x-q.x,p.y-q.y)||1;
  return{p,d:{x:(p.x-q.x)/l,y:(p.y-q.y)/l}};
}

export function tangentConnectPlan(project:RoadFirstProject,aId:string,bId:string,radius?:number):TangentPlan|{error:string}{
  const A=project.roads.find(r=>r.id===aId),B=project.roads.find(r=>r.id===bId);
  if(!A||!B||A===B)return{error:'เลือกถนนสองเส้นเพื่อเชื่อมด้วยโค้ง'};
  // The pair of ends whose straights meet ahead of both ends, the closest such pair.
  let best:{ea:End;eb:End;v:WorldPoint;t:number;u:number}|null=null;
  for(const ea of ['start','end'] as const)for(const eb of ['start','end'] as const){
    const a=endRay(A,ea),b=endRay(B,eb),den=a.d.x*b.d.y-a.d.y*b.d.x;if(Math.abs(den)<1e-6)continue;
    const w={x:b.p.x-a.p.x,y:b.p.y-a.p.y},t=(w.x*b.d.y-w.y*b.d.x)/den,u=(w.x*a.d.y-w.y*a.d.x)/den;
    if(t<.5||u<.5)continue;
    if(!best||t+u<best.t+best.u)best={ea,eb,v:{x:Math.round((a.p.x+a.d.x*t)*1000)/1000,y:Math.round((a.p.y+a.d.y*t)*1000)/1000},t,u};
  }
  if(!best)return{error:'แนวปลายถนนสองเส้นไม่ตัดกันข้างหน้าปลายทั้งสอง (ขนานกันหรือชี้ออกจากกัน) — ใช้ต่อปลายหรือวาดแนวใหม่'};
  const steps:RoadFirstCommand[]=[
    // The end points slide along their own straights to the meeting point (no extra point on the straight).
    {type:'road.movePoint',roadId:aId,index:best.ea==='start'?0:A.points.length-1,point:best.v},
    {type:'road.movePoint',roadId:bId,index:best.eb==='start'?0:B.points.length-1,point:best.v},
    {type:'road.join',roadId:aId,otherId:bId},
  ];
  const joined=executeCommand(project,{type:'batch',label:'',commands:steps});
  if(joined.error)return{error:joined.error};
  const road=joined.project.roads.find(r=>r.id===aId)!,i=road.points.findIndex(p=>Math.hypot(p.x-best!.v.x,p.y-best!.v.y)<1e-3);
  const curve=i>0?vertexCurve(road.points,i):null;
  if(!curve)return{error:'มุมที่ถนนสองเส้นมาบรรจบตรงเกินไปหรือช่วงตรงสั้นเกินไปสำหรับโค้ง'};
  const max=Math.floor(curve.maxRadius+1e-6),R=radius===undefined?max:radius;
  if(!(R>0))return{error:'ช่วงตรงสั้นเกินไปสำหรับโค้ง'};
  if(R>max+1e-9)return{error:`รัศมี ${R} ม. ใหญ่เกินช่วงตรงที่มี — สูงสุด ${max} ม.`};
  return{radius:R,maxRadius:max,vertex:best.v,ends:[best.ea,best.eb],
    cmd:{type:'batch',label:`เชื่อม ${A.name} กับ ${B.name} ด้วยโค้งสัมผัส รัศมี ${R} ม.`,commands:[...steps,{type:'road.setPointRadius',roadId:aId,index:i,radius:R}]}};
}
