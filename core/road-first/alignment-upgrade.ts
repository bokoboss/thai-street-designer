/** Explicit, previewable conversion. Loading an older file never calls this function. */
import {chordStations,resolveAlignment} from '../common/resolved-alignment';
import {lengthOf,station as sampledPoint} from '../common/alignment';
import {linkPoints,validateNetworkProject} from '../network/network-project';
import {compileRoadFirstProject,validateRoadFirstProject,type RoadFirstProject} from './project';
import {detectCandidates,type Road} from './derive';
import {anchorPoint} from './ramps';
import {profileError} from './elevation';

export type AlignmentUpgrade={project:RoadFirstProject;changes:string[];errors:string[]};
/** Preserve control-span fractions when an attached endpoint moves, then map onto the solved arc. */
function stationMap(before:Road,after:Road){
  const old=chordStations(before.points),next=chordStations(after.points),solved=resolveAlignment(after.points);
  return(s:number)=>{
    if(!Number.isFinite(s)||s<0)throw Error(`${before.name}: ค่าระยะตามแนวถนนไม่ถูกต้อง`);
    if(before.alignment==='arc')return s;
    for(let i=1;i<old.length;i++)if(s<=old[i]){
      if(old[i]<=old[i-1])throw Error(`${before.name}: จุดแนวถนนซ้ำ จับคู่ระยะไม่ได้`);
      return solved.mapChordStation(next[i-1]+(s-old[i-1])/(old[i]-old[i-1])*(next[i]-next[i-1]));
    }
    return solved.length+s-old.at(-1)!;
  };
}
export function previewAlignmentUpgrade(source:RoadFirstProject):AlignmentUpgrade{
  const p=structuredClone(source),changes:string[]=[],errors:string[]=[];
  const invalid=validateRoadFirstProject(source);if(invalid)return{project:p,changes,errors:[invalid]};
  const old=new Map(source.roads.map(r=>[r.id,r])),byId=new Map(p.roads.map(r=>[r.id,r]));
  const oldCompiled=compileRoadFirstProject(source),oldCandidates=detectCandidates(source.roads);
  const done=new Set<string>(),visiting=new Set<string>();
  const prepare=(r:Road)=>{
    if(done.has(r.id))return;
    if(visiting.has(r.id))throw Error(`${r.name}: จุดเชื่อมทางลาดอ้างกันเป็นวง จับคู่ระยะไม่ได้`);
    visiting.add(r.id);
    for(const end of ['start','end'] as const){
      const a=r.anchors?.[end];if(!a)continue;
      const main=byId.get(a.roadId),was=old.get(a.roadId);
      if(!main||!was)throw Error(`${r.name}: ไม่พบถนนที่จุดเชื่อมอ้างถึง`);
      prepare(main);
      const previous=a.station;
      a.station=stationMap(was,main)(a.station);
      if(Math.abs(a.station-previous)>1e-6)changes.push(`${r.name}: จุดเชื่อม${end==='start'?'ต้นทาง':'ปลายทาง'} ${previous.toFixed(3)} → ${a.station.toFixed(3)} ม. บน ${main.name}`);
      r.points[end==='start'?0:r.points.length-1]={...r.points[end==='start'?0:r.points.length-1],...anchorPoint(main,a)};
    }
    if(r.alignment!=='arc'){
      const was=old.get(r.id)!,map=stationMap(was,r);
      r.profile=r.profile?.map(q=>({...q,station:map(q.station)}));
      r.openings=r.openings?.map(o=>({...o,station:map(o.station),length:map(o.station+o.length)-map(o.station)}));
      // Do not introduce empty optional fields into unchanged records.
      if(!was.profile)delete r.profile;if(!was.openings)delete r.openings;
      for(const [i,q] of (r.profile??[]).entries())if(Math.abs(q.station-was.profile![i].station)>1e-6)changes.push(`${r.name}: จุดระดับ ${i+1} ระยะ ${was.profile![i].station.toFixed(3)} → ${q.station.toFixed(3)} ม.; ระดับ ${q.z} ม. คงเดิม`);
      for(const [i,o] of (r.openings??[]).entries())changes.push(`${r.name}: ช่องเปิด ${o.id} ระยะ ${was.openings![i].station.toFixed(3)} → ${o.station.toFixed(3)} ม.; ยาว ${was.openings![i].length.toFixed(3)} → ${o.length.toFixed(3)} ม.`);
      const error=profileError(r.profile);if(error)throw Error(`${r.name}: ${error}`);
      r.alignment='arc';
      const previous=chordStations(was.points).at(-1)!,total=resolveAlignment(r.points).length;
      changes.push(`${r.name}: ระยะ ${previous.toFixed(3)} → ${total.toFixed(3)} ม.; จุดระดับ ${r.profile?.length??0}, ช่องเปิดเกาะกลาง ${r.openings?.length??0}`);
    }
    visiting.delete(r.id);done.add(r.id);
  };
  try{for(const r of p.roads)prepare(r);}catch(e){errors.push(e instanceof Error?e.message:'แปลงระยะไม่ได้');return{project:p,changes,errors};}
  p.schemaVersion=2;
  const fresh=detectCandidates(p.roads),used=new Set<string>();
  p.decisions=p.decisions.map((d,i)=>{
    const was=oldCandidates.find(c=>c.id===d.candidateId),ids=was?.roads.map(r=>r.roadId)??d.roads;
    if(!was||!ids)return d;
    const matches=fresh.filter(c=>c.roads.length===ids.length&&c.roads.every(r=>ids.includes(r.roadId)));
    // Identity is certain only when exactly one crossing of this pair survives; multiple matches require review.
    if(matches.length>1){errors.push(`${d.name??d.candidateId}: มีจุดตัดใหม่หลายตำแหน่ง จับคู่การตั้งค่าทางแยกไม่ได้แน่นอน`);return d;}
    const match=matches[0];
    if(!match){changes.push(`${d.name??d.candidateId}: เส้นโค้งจริงไม่ตัดกัน เก็บการตั้งค่าทางแยกไว้โดยไม่สร้างทางแยก`);return{...d,candidateId:`dormant:arc:${i}:${d.candidateId}`,roads:ids,at:was.point};}
    if(used.has(match.id)){errors.push(`${d.name??d.candidateId}: การตั้งค่าหลายทางแยกอ้างจุดตัดเดียวกัน`);return d;}
    used.add(match.id);
    if(Math.hypot(match.point.x-was.point.x,match.point.y-was.point.y)>1e-6)changes.push(`${d.name??d.candidateId}: จุดตัดย้าย (${was.point.x.toFixed(2)}, ${was.point.y.toFixed(2)}) → (${match.point.x.toFixed(2)}, ${match.point.y.toFixed(2)})`);
    return{...d,candidateId:match.id,roads:ids,at:match.point};
  });
  for(const c of fresh)if(!p.decisions.some(d=>d.candidateId===c.id))changes.push(`พบจุดตัด ${c.id} เพิ่ม — รอเลือกการเชื่อมต่อ`);
  const compiled=compileRoadFirstProject(p);
  for(const road of p.roads){
    const prev=old.get(road.id)!;if(prev.alignment==='arc'||!prev.links?.length)continue;
    const was=oldCompiled.linkRanges.filter(x=>x.roadId===road.id),now=compiled.linkRanges.filter(x=>x.roadId===road.id);
    if(was.length!==now.length||prev.links.length>was.length){errors.push(`${road.name}: จำนวนช่วงถนนเปลี่ยน จับคู่การตั้งค่าช่วงถนนไม่ได้`);continue;}
    const solved=resolveAlignment(road.points);
    road.links=prev.links.map((data,i)=>{
      const oldLink=oldCompiled.project.links.find(l=>l.id===was[i].id)!,points=linkPoints(oldCompiled.project,oldLink);
      const map=(s:number)=>{if(s<0||s>lengthOf(points))throw Error(`${road.name}: รายการตามระยะเลยช่วงถนนเดิม`);const q=sampledPoint(points,s),v=solved.project(q).station-now[i].from;
        if(v< -1e-6||v>now[i].to-now[i].from+1e-6)throw Error(`${road.name}: รายการตามระยะหลุดจากช่วงถนนใหม่`);return Math.max(0,v);};
      const out=structuredClone(data);
      try{
        out.components=data.components?.map(c=>{const start=map(c.start),end=map(c.end);if(end<=start)throw Error(`${road.name}: ลำดับระยะของช่องจราจรเปลี่ยน`);
          return{...c,start,end,taperIn:map(c.start+c.taperIn)-start,taperOut:end-map(c.end-c.taperOut)};});
        for(const key of ['forwardLaneTransition','backwardLaneTransition'] as const){const t=out.sectionProfile?.[key];if(t){const a=map(t.center-t.length/2),b=map(t.center+t.length/2);t.center=(a+b)/2;t.length=b-a;}}
        if(!data.components)delete out.components;
      }catch(e){errors.push(e instanceof Error?e.message:'จับคู่ช่วงถนนไม่ได้');}
      for(const [k,c] of (out.components??[]).entries()){const was=data.components![k];changes.push(`${road.name}: รายการ ${c.id} ช่วง ${was.start.toFixed(3)}–${was.end.toFixed(3)} → ${c.start.toFixed(3)}–${c.end.toFixed(3)} ม. ของช่วงถนน ${i+1}`);}
      return out;
    });
  }
  const structural=validateRoadFirstProject(p);if(structural)errors.push(structural);
  const final=compileRoadFirstProject(p),engine=validateNetworkProject(final.project);if(engine)errors.push(engine);
  for(const s of final.shortfalls)if(byId.get(s.roadId)?.alignment==='arc'&&byId.get(s.roadId)!.points.some(q=>(q.radius??0)>=.25))errors.push(`${byId.get(s.roadId)!.name}: ช่วงตรงสำหรับปากทางแยกไม่พอหลังแปลง ต้องปรับจุดตัดก่อน`);
  return{project:p,changes,errors:[...new Set(errors)]};
}
