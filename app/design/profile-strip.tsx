'use client';
// Long section of the selected road (Phase 4B-2): its levels along the road, the ground, the roads it crosses (at
// their levels) and its junctions. Drag a level point to change station and level; double-click the line to add a
// point, double-click a point to remove it. Each drag is one undo step; the typed list in the inspector edits the same points.
import {useLayoutEffect,useRef,useState} from 'react';
import type {Road} from '@/core/road-first/derive';
import {detectCandidates,stations} from '@/core/road-first/derive';
import type {RoadFirstProject} from '@/core/road-first/project';
import type {RoadFirstCommand} from '@/core/road-first/commands';
import {levelAt,sortedProfile,type Profile} from '@/core/road-first/elevation';
import {gradeFor,levelCriteria} from '@/core/road-first/level-criteria';
import type {CommandOutcome} from './use-road-editor';

type Run=(cmd:RoadFirstCommand,opts?:{gesture?:boolean})=>CommandOutcome;
const H=150,PAD={l:44,r:14,t:14,b:22};
const fmt=(z:number)=>`${z>0?'+':z<0?'−':''}${Math.abs(z).toFixed(1)}`;

export function ProfileStrip({road,project,run,finishGesture}:{road:Road;project:RoadFirstProject;run:Run;finishGesture:()=>void}){
  const box=useRef<HTMLDivElement>(null),[w,setW]=useState(800),drag=useRef<number|null>(null);
  // The level scale holds still while a point is dragged, so the point stays under the pointer.
  const [frozen,setFrozen]=useState<{zMin:number;zMax:number}|null>(null);
  // Measured before the first paint, so points do not jump after the strip opens.
  useLayoutEffect(()=>{const el=box.current;if(!el)return;setW(Math.max(320,el.getBoundingClientRect().width));const o=new ResizeObserver(([e])=>setW(Math.max(320,e.contentRect.width)));o.observe(el);return()=>o.disconnect();},[]);
  const total=stations(road.points).at(-1)??0,profile=sortedProfile(road.profile);
  // Other roads where this one crosses them: their level there; junctions on this road.
  type Mark={kind:'junction'|'road';station:number;z:number;name:string};
  const marks=detectCandidates(project.roads).flatMap((c):Mark[]=>{
    const me=c.roads.find(r=>r.roadId===road.id);if(!me)return[];
    const d=project.decisions.find(x=>x.candidateId===c.id);
    if(d?.decision==='junction'&&d.roads?.includes(road.id))return[{kind:'junction',station:me.station,z:levelAt(road.profile,me.station),name:d.name??'ทางแยก'}];
    return c.roads.filter(r=>r.roadId!==road.id).map(r=>{const o=project.roads.find(x=>x.id===r.roadId);return{kind:'road',station:me.station,z:levelAt(o?.profile,r.station),name:o?.name??r.roadId};});
  });
  const zs=[0,...profile.map(q=>q.z),...marks.map(m=>m.z)],zMin=frozen?.zMin??Math.min(...zs)-2,zMax=frozen?.zMax??Math.max(...zs)+3;
  const X=(s:number)=>PAD.l+(s/(total||1))*(w-PAD.l-PAD.r),Z=(z:number)=>PAD.t+(zMax-z)/(zMax-zMin)*(H-PAD.t-PAD.b);
  const S=(px:number)=>Math.max(0,Math.min(total,(px-PAD.l)/(w-PAD.l-PAD.r)*total)),ZofPx=(py:number)=>zMax-(py-PAD.t)/(H-PAD.t-PAD.b)*(zMax-zMin);
  const line=(profile.length?[{station:0,z:levelAt(profile,0)},...profile,{station:total,z:levelAt(profile,total)}]:[{station:0,z:0},{station:total,z:0}]).filter((q,i,a)=>i===0||q.station>a[i-1].station+1e-6);
  const local=(e:React.PointerEvent|React.MouseEvent)=>{const r=(e.currentTarget as Element).closest('svg')!.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const set=(next:Profile,gesture=false)=>run({type:'road.setProfile',roadId:road.id,profile:next.length?next:null},gesture?{gesture:true}:undefined);
  const r1=(v:number)=>Math.round(v*10)/10;
  function move(e:React.PointerEvent){
    const i=drag.current;if(i===null)return;const p=local(e),lo=i>0?profile[i-1].station+.5:0,hi=i<profile.length-1?profile[i+1].station-.5:total;
    const next=profile.map((q,k)=>k===i?{station:r1(Math.max(lo,Math.min(hi,S(p.x)))),z:r1(Math.max(-30,Math.min(30,ZofPx(p.y))))}:q);
    if(next[i].station!==profile[i].station||next[i].z!==profile[i].z)set(next,true);
  }
  function addAt(e:React.MouseEvent){
    const s=r1(S(local(e).x));if(profile.some(q=>Math.abs(q.station-s)<1))return;
    set([...profile,{station:s,z:r1(levelAt(profile,s))}].sort((a,b)=>a.station-b.station));
  }
  // Labels placed greedily (crossings, then junctions, then grades); one that would overlap moves up a line or is
  // left to its hover tooltip, so a busy long section stays readable.
  const maxGrade=gradeFor(levelCriteria(project.options.levels),road)*100;
  const crossingText=(m:Mark)=>`${m.name} ${fmt(m.z)} · ต่าง ${Math.abs(levelAt(road.profile,m.station)-m.z).toFixed(1)} ม.`;
  type Label={kind:string;text:string;x:number;y:number;anchor:'start'|'middle';color:string};
  const wanted:Label[]=[
    ...marks.filter(m=>m.kind==='road').map(m=>({kind:'crossing',text:crossingText(m),x:X(m.station)+7,y:Z(m.z)+4,anchor:'start' as const,color:'#4a565b'})),
    ...marks.filter(m=>m.kind==='junction').map(m=>({kind:'junction',text:m.name,x:X(m.station)+3,y:H-PAD.b-4,anchor:'start' as const,color:'#0b6f69'})),
    ...line.slice(1).flatMap((q,i)=>{const a=line[i],g=(q.z-a.z)/((q.station-a.station)||1)*100;
      // Steeper than the project's maximum: marked to check (orange), never judged here.
      const steep=Math.abs(g)>maxGrade+1e-6;
      return Math.abs(g)>.05?[{kind:steep?'grade-steep':'grade',text:`${g.toFixed(1)}%${steep?' !':''}`,x:(X(a.station)+X(q.station))/2,y:(Z(a.z)+Z(q.z))/2-6,anchor:'middle' as const,color:steep?'#b05a00':'#0b6f69'}]:[];}),
  ];
  const boxes:{x0:number;x1:number;y0:number;y1:number}[]=[],labels:Label[]=[];
  for(const l of wanted){
    const w=l.text.length*5.6,x0=l.anchor==='middle'?l.x-w/2:l.x;
    for(const dy of [0,-13,13]){
      const b={x0,x1:x0+w,y0:l.y+dy-10,y1:l.y+dy+2};
      if(b.y0<0||b.y1>H)continue;
      if(boxes.some(o=>b.x0<o.x1&&b.x1>o.x0&&b.y0<o.y1&&b.y1>o.y0))continue;
      boxes.push(b);labels.push({...l,y:l.y+dy});break;
    }
  }
  return <div className="design-profile" ref={box} data-design-profile={road.id} data-design-profile-points={profile.length}>
    <svg width={w} height={H} onPointerMove={move} onPointerUp={()=>{if(drag.current!==null){drag.current=null;setFrozen(null);finishGesture();}}} onDoubleClick={addAt}>
      <rect x={PAD.l} y={PAD.t} width={w-PAD.l-PAD.r} height={H-PAD.t-PAD.b} fill="#f6f8f8"/>
      <line x1={PAD.l} x2={w-PAD.r} y1={Z(0)} y2={Z(0)} stroke="#8a9a8a" strokeDasharray="5 4"/>
      <text x={PAD.l-6} y={Z(0)+4} textAnchor="end" fontSize="11" fill="#5c676b">0</text>
      <text x={PAD.l-6} y={PAD.t+10} textAnchor="end" fontSize="11" fill="#5c676b">{fmt(Math.round(zMax))}</text>
      {marks.map((m,i)=>m.kind==='junction'
        ?<g key={i} data-design-profile-junction={i}><title>{m.name}</title><line x1={X(m.station)} x2={X(m.station)} y1={PAD.t} y2={H-PAD.b} stroke="#0b7f86" strokeDasharray="2 3"/></g>
        :<g key={i} data-design-profile-crossing={m.name}><title>{crossingText(m)}</title><rect x={X(m.station)-5} y={Z(m.z)-3} width="10" height="6" fill="#6f7d84"/></g>)}
      <polyline points={line.map(q=>`${X(q.station)},${Z(q.z)}`).join(' ')} fill="none" stroke="#1f2d33" strokeWidth="2.2"/>
      {labels.map((l,i)=><text key={'l'+i} data-design-profile-label={l.kind} x={l.x} y={l.y} textAnchor={l.anchor} fontSize="10" fill={l.color}>{l.text}</text>)}
      {profile.map((q,i)=><g key={i}>
        <circle data-design-profile-point={i} data-design-profile-z={q.z} cx={X(q.station)} cy={Z(q.z)} r="14" fill="transparent" style={{cursor:'move'}}
          onPointerDown={e=>{e.stopPropagation();(e.currentTarget as Element).closest('svg')!.setPointerCapture(e.pointerId);drag.current=i;setFrozen({zMin,zMax});}}
          onDoubleClick={e=>{e.stopPropagation();set(profile.filter((_,k)=>k!==i));}}>
          <title>{`ระยะ ${q.station.toFixed(1)} ม. · ระดับ ${fmt(q.z)} ม. · ลากเพื่อย้าย · ดับเบิลคลิกเพื่อลบ`}</title></circle>
        <circle cx={X(q.station)} cy={Z(q.z)} r="4.5" fill="#fff" stroke="#0b7f86" strokeWidth="2" pointerEvents="none"/>
      </g>)}
      <text x={w-PAD.r} y={H-6} textAnchor="end" fontSize="10" fill="#5c676b">ระยะ {total.toFixed(0)} ม. · ดับเบิลคลิกเส้นเพื่อเพิ่มจุด</text>
    </svg>
  </div>;
}
