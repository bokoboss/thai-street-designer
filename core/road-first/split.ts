// Split a road in two at a point on a straight stretch ("แยกถนนตรงนี้"). The ground does not change: both pieces keep
// the alignment, levels, median openings and junction settings of their part; attachments of ramps past the split move
// to the new road (handled by the ramp re-attachment with the split station). The inverse of joining two roads.
import {resolveAlignment} from '../common/resolved-alignment';
import type {WorldPoint} from '../network/network-project';
import {detectCandidates,type Decision,type Road} from './derive';
import {levelAt,resolveVerticalProfile,type Profile} from './elevation';
import {splitRuns} from './lane-runs';
import {legKey,parseLegKey,type LegKey,type LegSlip} from './leg-binding';

/** Shortest piece either side of a split (m; tool value). */
export const SPLIT_MIN_PIECE=5;
const r3=(v:number)=>Math.round(v*1000)/1000;

export type SplitOutcome={roads:Road[];decisions:Decision[];station:number;notes:string[]}|{error:string};

export function splitRoad(roads:Road[],decisions:Decision[],roadId:string,at:WorldPoint,newId:string,newName:string):SplitOutcome{
  const r=roads.find(x=>x.id===roadId);if(!r)return{error:'ไม่พบถนนที่เลือก'};
  if(roads.some(x=>x.id===newId))return{error:`มีถนนรหัส ${newId} อยู่แล้ว`};
  const mode=r.alignment??'chord',A=resolveAlignment(r.points,mode),hit=A.project(at),s=hit.station;
  if(s<SPLIT_MIN_PIECE||s>A.length-SPLIT_MIN_PIECE)return{error:`จุดแยกใกล้ปลายถนนเกินไป — แต่ละช่วงต้องยาวอย่างน้อย ${SPLIT_MIN_PIECE} ม.`};
  const piece=A.pieceAt(s);
  if(!piece||piece.kind!=='line')return{error:'จุดแยกอยู่บนโค้ง — เลือกจุดบนช่วงตรง'};
  const k=piece.index,S={x:r3(hit.point.x),y:r3(hit.point.y)};
  // At an existing vertex the vertex itself is the split point (no doubled point).
  const same=(p:WorldPoint)=>Math.hypot(p.x-S.x,p.y-S.y)<1e-3,dedupe=(ps:typeof r.points)=>ps.filter((q,i)=>i===0||!(Math.abs(q.x-ps[i-1].x)<1e-3&&Math.abs(q.y-ps[i-1].y)<1e-3));
  const head=r.points.slice(0,k+1).map(p=>({...p})),tail=r.points.slice(k+1).map(p=>({...p}));
  const ptsA=dedupe([...head,same(head.at(-1)!)?{...head.at(-1)!,radius:undefined}:S]).map(({radius,...q})=>radius?{...q,radius}:q),ptsB=dedupe([S,...tail]);
  // The split point is a plain vertex; the two pieces must trace the same ground (no arc shortened by the cut).
  const la=resolveAlignment(ptsA,mode).length,lb=resolveAlignment(ptsB,mode).length;
  if(Math.abs(la+lb-A.length)>.01||Math.abs(la-s)>.01)return{error:'จุดแยกใกล้โค้งเกินไป — เลือกจุดบนช่วงตรงที่ห่างจากโค้ง'};
  // Levels: points before / after, with the level at the split on both sides; a vertical curve across it is refused.
  let profileA:Profile|undefined,profileB:Profile|undefined;
  if(r.profile?.length){
    const v=resolveVerticalProfile(r.profile);
    if(v.curves.some(c=>c.start<s&&c.end>s))return{error:'จุดแยกอยู่ในช่วงโค้งดิ่ง — ย้ายจุดแยกหรือแก้แนวดิ่งก่อน'};
    const z=r3(levelAt(r.profile,s)),before=r.profile.filter(q=>q.station<s-.005),after=r.profile.filter(q=>q.station>s+.005);
    profileA=[...before.map(q=>({...q})),{station:r3(s),z}];
    profileB=[{station:0,z},...after.map(q=>({...q,station:r3(q.station-s)}))];
  }
  const openings=r.openings??[];
  if(openings.some(o=>o.station<s&&o.station+o.length>s))return{error:'จุดแยกตรงกับช่องเปิดเกาะกลาง — ย้ายจุดแยกหรือช่องเปิดก่อน'};
  const [runsA,runsB]=splitRuns(r.laneRuns,s);
  const openA=openings.filter(o=>o.station+o.length<=s).map(o=>({...o})),openB=openings.filter(o=>o.station>=s).map(o=>({...o,station:r3(o.station-s)}));
  // Junction settings past the split follow the new road (same drawing direction, so the same leg sides).
  const later=new Set<string>();
  for(const c of detectCandidates(roads)){
    const ref=c.roads.find(x=>x.roadId===roadId);if(!ref)continue;
    if(Math.abs(ref.station-s)<1&&decisions.some(d=>d.candidateId===c.id))return{error:'จุดแยกตรงกับจุดตัดหรือทางแยก — เลือกจุดอื่น'};
    if(ref.station>s)later.add(c.id);
  }
  const remap=(key:LegKey):LegKey=>{const l=parseLegKey(key);return l&&l.roadId===roadId?legKey(newId,l.side):key;};
  const remapRecord=<T>(rec?:Partial<Record<LegKey,T>>)=>rec&&Object.fromEntries(Object.entries(rec).map(([k,v])=>[remap(k as LegKey),v])) as Partial<Record<LegKey,T>>;
  const nextDecisions=decisions.map(d=>{
    if(!later.has(d.candidateId))return d;
    const swap=(ids?:string[])=>ids&&ids.map(id=>id===roadId?newId:id),t=d.treatments;
    return{...d,...(d.roads?{roads:swap(d.roads)}:{}),...(d.excluded?{excluded:swap(d.excluded)}:{}),...(d.over===roadId?{over:newId}:{}),
      ...(t?{treatments:{...t,legs:remapRecord(t.legs),approaches:remapRecord(t.approaches),slips:t.slips?.map((x:LegSlip)=>({...x,from:remap(x.from),...(x.to?{to:remap(x.to)}:{})}))}}:{})};
  });
  const notes:string[]=[];if(r.links?.length)notes.push('ล้างช่วงเปลี่ยนหน้าตัดของถนนเดิม');
  const common={...(r.alignment?{alignment:r.alignment}:{}),...(r.role?{role:r.role}:{}),...(r.roadside?{roadside:{...r.roadside}}:{}),...(r.origin?{origin:structuredClone(r.origin)}:{}),section:structuredClone(r.section)};
  const a:Road={...common,id:r.id,name:r.name,points:ptsA,...(profileA?{profile:profileA}:{}),...(openA.length?{openings:openA}:{}),...(runsA.length?{laneRuns:runsA}:{}),
    ...(r.ends?.start?{ends:{start:structuredClone(r.ends.start)}}:{}),...(r.anchors?.start?{anchors:{start:{...r.anchors.start}}}:{}),...(r.terminals?.start?{terminals:{start:{...r.terminals.start}}}:{})};
  const b:Road={...common,id:newId,name:newName,points:ptsB,...(profileB?{profile:profileB}:{}),...(openB.length?{openings:openB}:{}),...(runsB.length?{laneRuns:runsB}:{}),
    ...(r.ends?.end?{ends:{end:structuredClone(r.ends.end)}}:{}),...(r.anchors?.end?{anchors:{end:{...r.anchors.end}}}:{}),...(r.terminals?.end?{terminals:{end:{...r.terminals.end}}}:{})};
  const out=roads.flatMap(x=>x.id===roadId?[a,b]:[x]);
  return{roads:out,decisions:nextDecisions,station:r3(s),notes};
}
