// Roads whose ends touch (independent review 2026-10-20): drawn end to end they look continuous but are two
// separate roads. endJoins() finds such pairs so the plan can show them; joinRoads() makes one road of them,
// keeping every junction setting by re-keying the legs of the road that is absorbed.
import type {WorldPoint} from '../network/network-project';
import {pointAt,type Decision,type Road} from './derive';
import {projectAlignment} from '../common/alignment';
import {parseLegKey,legKey,type LegKey,type LegSlip} from './leg-binding';

export type RoadEnd='start'|'end';
export type EndJoin={a:string;aEnd:RoadEnd;b:string;bEnd:RoadEnd;point:WorldPoint};

const dist=(p:WorldPoint,q:WorldPoint)=>Math.hypot(p.x-q.x,p.y-q.y);
const endOf=(r:Road,e:RoadEnd)=>e==='start'?r.points[0]:r.points[r.points.length-1];
function nearBody(r:Road,p:WorldPoint,tol:number){
  for(let i=1;i<r.points.length;i++){
    const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));
    if(dist(p,{x:a.x+dx*t,y:a.y+dy*t})<=tol)return true;
  }
  return false;
}

/** Pairs of road ends that touch and are not also on a third road (that would be a junction, not a continuation). */
export function endJoins(roads:Road[],tolerance=1):EndJoin[]{
  const out:EndJoin[]=[];
  for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++)for(const ae of ['start','end'] as const)for(const be of ['start','end'] as const){
    const A=roads[i],B=roads[j],p=endOf(A,ae),q=endOf(B,be);
    if(dist(p,q)>tolerance)continue;
    if(roads.some(r=>r!==A&&r!==B&&nearBody(r,p,tolerance)))continue;
    if(out.some(o=>dist(o.point,p)<=tolerance))continue;
    out.push({a:A.id,aEnd:ae,b:B.id,bEnd:be,point:{x:p.x,y:p.y}});
  }
  return out;
}

export type JoinOutcome={roads:Road[];decisions:Decision[];notes:string[]}|{error:string};

/**
 * Join road `bId` onto road `aId` at their touching ends. A keeps its id, name and section; B's points are appended
 * (reversed when needed) and every junction setting on B is moved to A, flipping leg sides when B was reversed.
 */
export function joinRoads(roads:Road[],decisions:Decision[],aId:string,bId:string,tolerance=1):JoinOutcome{
  const A=roads.find(r=>r.id===aId),B=roads.find(r=>r.id===bId);
  if(!A||!B||A===B)return{error:'ไม่พบถนนที่จะเชื่อม'};
  const pair=endJoins(roads,tolerance).find(j=>(j.a===aId&&j.b===bId)||(j.a===bId&&j.b===aId));
  if(!pair)return{error:'ปลายถนนสองเส้นนี้ไม่ได้ชนกัน หรือมีถนนอื่นอยู่ที่จุดนั้น'};
  const aEnd=pair.a===aId?pair.aEnd:pair.bEnd,bEnd=pair.a===aId?pair.bEnd:pair.aEnd;
  // Orient so that A runs into B: A ends at the joint, B starts at it.
  let aPts=A.points.map(p=>({...p})),bPts=B.points.map(p=>({...p})),flipA=false,flipB=false;
  if(aEnd==='start'){aPts=aPts.reverse();flipA=true;}
  if(bEnd==='end'){bPts=bPts.reverse();flipB=true;}
  const points=[...aPts,...bPts.slice(1)];
  if(points.length>200)return{error:'ถนนที่เชื่อมแล้วจะมีจุดแนวเกิน 200 จุด'};
  const notes:string[]=[];
  // A reversed means its own legs flip too; then the whole result is flipped back so A keeps its drawing direction.
  const backToA=flipA;
  const finalPoints=backToA?points.reverse():points;
  const sideFor=(roadId:string,side:'ahead'|'behind'):'ahead'|'behind'=>{
    const flip=roadId===aId?false:(flipB!==backToA);
    return flip?(side==='ahead'?'behind':'ahead'):side;
  };
  const remap=(key:LegKey):LegKey=>{const l=parseLegKey(key);if(!l||(l.roadId!==aId&&l.roadId!==bId))return key;return legKey(aId,sideFor(l.roadId,l.side));};
  const remapRecord=<T>(r?:Partial<Record<LegKey,T>>)=>r&&Object.fromEntries(Object.entries(r).map(([k,v])=>[remap(k as LegKey),v])) as Partial<Record<LegKey,T>>;
  const nextDecisions=decisions.map(d=>{
    const swap=(ids?:string[])=>ids&&[...new Set(ids.map(id=>id===bId?aId:id))];
    const t=d.treatments;
    return{...d,...(d.roads?{roads:swap(d.roads)}:{}),...(d.excluded?{excluded:swap(d.excluded)}:{}),
      treatments:t&&{...t,legs:remapRecord(t.legs),approaches:remapRecord(t.approaches),slips:t.slips?.map((s:LegSlip)=>({...s,from:remap(s.from),...(s.to?{to:remap(s.to)}:{})}))}};
  });
  if(JSON.stringify(A.section)!==JSON.stringify(B.section))notes.push(`ใช้หน้าตัดของ ${A.name} ตลอดเส้น`);
  if(A.links?.length||B.links?.length)notes.push('ล้างช่วงเปลี่ยนหน้าตัดของสองเส้นเดิม');
  const farEnd=bEnd==='end'?B.ends?.start:B.ends?.end,ownEnd=aEnd==='end'?A.ends?.start:A.ends?.end;
  const ends=backToA?{start:farEnd,end:ownEnd}:{start:ownEnd,end:farEnd};
  // Openings keep their place on the ground: re-measured on the joined road from their centre point.
  const centres=[A,B].flatMap(r=>(r.openings??[]).map(o=>({o,c:pointAt(r.points,o.station+o.length/2)})));
  const used=new Set<string>();
  const openings=centres.map(({o,c})=>{let id=o.id,k=2;while(used.has(id))id=`${o.id}-${k++}`;used.add(id);
    return{...o,id,station:Math.max(0,Math.round((projectAlignment(finalPoints,c).station-o.length/2)*1000)/1000)};});
  const joined:Road={id:A.id,name:A.name,...(A.role?{role:A.role}:{}),...(openings.length?{openings}:{}),section:structuredClone(A.section),points:finalPoints,...(ends.start||ends.end?{ends:JSON.parse(JSON.stringify(ends))}:{})};
  return{roads:roads.filter(r=>r.id!==bId).map(r=>r.id===aId?joined:r),decisions:nextDecisions,notes};
}
