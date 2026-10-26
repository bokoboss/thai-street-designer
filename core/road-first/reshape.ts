// Reshaping a road from Select: reverse its drawing direction, straighten it between two of its points.
// Both keep everything attached to the road on the ground: levels, median openings, junction settings (leg keys) and,
// through the ramp re-attachment with remapping, the ramps attached to it.
import {resolveAlignment} from '../common/resolved-alignment';
import {stations,type Decision,type Road} from './derive';
import {profileError} from './elevation';
import {remapRanges,remapRuns} from './lane-runs';
import {remapStretches} from './section-stretches';
import {reverseStructureSection} from './structure-sections';
import {parseLegKey,legKey,type LegKey,type LegSlip} from './leg-binding';

const r3=(v:number)=>Math.round(v*1000)/1000;
type Out={roads:Road[];decisions:Decision[];notes:string[]}|{error:string};

/** Junction settings of one road with its leg sides swapped (the same arms on the ground after a reversal). */
function flipLegs(decisions:Decision[],roadId:string):Decision[]{
  const flip=(key:LegKey):LegKey=>{const l=parseLegKey(key);return l&&l.roadId===roadId?legKey(roadId,l.side==='ahead'?'behind':'ahead'):key;};
  const rec=<T>(r?:Partial<Record<LegKey,T>>)=>r&&Object.fromEntries(Object.entries(r).map(([k,v])=>[flip(k as LegKey),v])) as Partial<Record<LegKey,T>>;
  return decisions.map(d=>{const t=d.treatments;if(!t)return d;
    return{...d,treatments:{...t,...(t.legs?{legs:rec(t.legs)}:{}),...(t.approaches?{approaches:rec(t.approaches)}:{}),...(t.cornerRadii?{cornerRadii:rec(t.cornerRadii)}:{}),...(t.slips?{slips:t.slips.map((s:LegSlip)=>({...s,from:flip(s.from),...(s.to?{to:flip(s.to)}:{})}))}:{})}};});
}

/**
 * Reverse the drawing direction. A two-way road keeps its traffic on the ground (lane counts swap with the direction);
 * a ramp (one way) changes its direction of travel, so its attachments are found again from its new ends.
 */
export function reverseRoad(roads:Road[],decisions:Decision[],roadId:string):Out{
  const r=roads.find(x=>x.id===roadId);if(!r)return{error:'ไม่พบถนนที่เลือก'};
  const L=stations(r.points,r.alignment).at(-1)??0,notes:string[]=[];
  const next:Road={...structuredClone(r),points:[...r.points].reverse().map(p=>({...p}))};
  if(r.role!=='ramp')next.section={...r.section,forwardLanes:r.section.backwardLanes,backwardLanes:r.section.forwardLanes};
  else{delete next.anchors;delete next.terminals;notes.push('ทางลาดกลับทิศเดินรถ');if(r.terminals)notes.push('ลบช่องเร่ง/ลดความเร็วเดิม');}
  if(r.profile)next.profile=r.profile.map(q=>({...q,station:r3(L-q.station)})).sort((a,b)=>a.station-b.station);
  if(r.openings)next.openings=r.openings.map(o=>({...o,station:r3(Math.max(0,L-o.station-o.length))}));
  // Lane runs stay on the ground; on a two-way road they keep their traffic (direction flips with the drawing direction).
  if(r.laneRuns)next.laneRuns=remapRuns(r.laneRuns,r,next,r.role==='ramp');
  if(r.sectionStretches)next.sectionStretches=r.role==='ramp'?remapRanges(r.sectionStretches,r,next,x=>x):remapStretches(r.sectionStretches,r,next);
  if(r.structureSection&&r.role!=='ramp')next.structureSection=reverseStructureSection(r.structureSection);
  if(r.ends)next.ends={...(r.ends.end?{start:r.ends.end}:{}),...(r.ends.start?{end:r.ends.start}:{})};
  if(r.links?.length){delete next.links;notes.push('ล้างช่วงเปลี่ยนหน้าตัดของถนนนี้');}
  return{roads:roads.map(x=>x.id===roadId?next:x),decisions:r.role==='ramp'?decisions:flipLegs(decisions,roadId),notes};
}

/** Straighten a road between two of its points: the points in between are removed; stations are re-measured on the ground. */
export function straightenRoad(roads:Road[],decisions:Decision[],roadId:string,from:number,to:number):Out{
  const r=roads.find(x=>x.id===roadId);if(!r)return{error:'ไม่พบถนนที่เลือก'};
  const last=r.points.length-1;
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>last||to-from<2)return{error:'เลือกช่วงที่มีจุดอยู่ระหว่างอย่างน้อยหนึ่งจุด'};
  const points=[...r.points.slice(0,from+1),...r.points.slice(to)].map(p=>({...p}));
  const mode=r.alignment??'chord',A0=resolveAlignment(r.points,mode),A1=resolveAlignment(points,mode);
  const map=(s:number)=>r3(A1.project(A0.pointAt(s)).station);
  const next:Road={...structuredClone(r),points};
  if(r.profile?.length){
    const prof=r.profile.map(q=>({...q,station:map(q.station)}));
    if(prof.some((q,i)=>i>0&&q.station<=prof[i-1].station+.005))return{error:'จุดระดับบนช่วงที่ทำให้ตรงซ้อนกันหลังวัดระยะใหม่ — ลบหรือย้ายจุดระดับในช่วงนั้นก่อน'};
    if(profileError(prof))return{error:'โค้งดิ่งไม่พอดีกับระยะใหม่หลังทำให้ตรง — ลดความยาวโค้งดิ่งก่อน'};
    next.profile=prof;
  }
  if(r.openings)next.openings=r.openings.map(o=>{const c=map(o.station+o.length/2);return{...o,station:r3(Math.max(0,c-o.length/2))};});
  if(r.laneRuns)next.laneRuns=remapRuns(r.laneRuns,r,next);
  if(r.sectionStretches)next.sectionStretches=remapStretches(r.sectionStretches,r,next);
  const notes:string[]=[`ลบจุดแนว ${to-from-1} จุด`];
  if(r.links?.length){delete next.links;notes.push('ล้างช่วงเปลี่ยนหน้าตัดของถนนนี้');}
  return{roads:roads.map(x=>x.id===roadId?next:x),decisions,notes};
}
