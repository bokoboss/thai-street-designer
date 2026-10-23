// Lane runs: lanes added (and dropped again) along a stretch of road, defined in road stations so they survive
// junctions being added or removed. Compile clips each run to the links of the road and hands them to the network
// engine as station lane components (the same lane model that plan, section, 3D and export read).
// Taper lengths are drawn values (tool starting value, not a standard); nothing here checks them against a rule.
import {resolveAlignment} from '../common/resolved-alignment';
import type {LinkStationLaneComponent} from '../network/network-project';
import type {Road} from './derive';

export type LaneRun={id:string;direction:'forward'|'backward';side:'curb'|'median';start:number;end:number;taperIn:number;taperOut:number};
/** Starting values for a new run (m; tool values for drawing, TO_VERIFY). */
export const LANE_RUN_DEFAULTS={length:150,taper:30};
/** At most this many added lanes side by side in one direction (data bound, not a design limit). */
export const LANE_RUN_STACK=2;
const r3=(v:number)=>Math.round(v*1000)/1000;

/** Input check for a road's lane runs; null when valid. */
export function laneRunError(road:Pick<Road,'name'|'section'>&{laneRuns?:unknown},length:number):string|null{
  const list=road.laneRuns;if(list===undefined)return null;
  if(!Array.isArray(list)||list.length>24)return `ช่องจราจรเพิ่มของ ${road.name} ไม่ถูกต้อง`;
  const ids=new Set<string>();
  for(const x of list as LaneRun[]){
    const ok=x&&typeof x.id==='string'&&!!x.id&&x.id.length<=30&&!ids.has(x.id)&&['forward','backward'].includes(x.direction)&&['curb','median'].includes(x.side)
      &&[x.start,x.end,x.taperIn,x.taperOut].every(v=>typeof v==='number'&&Number.isFinite(v))&&x.start>=0&&x.end>x.start+1&&x.taperIn>=0&&x.taperOut>=0;
    if(!ok)return `ช่องจราจรเพิ่มของ ${road.name} ไม่ถูกต้อง`;
    ids.add(x.id);
    if(x.end>length+.01)return `${road.name}: ช่องจราจรเพิ่มเลยปลายถนน (ถึง ${x.end.toFixed(1)} ม. · ถนนยาว ${length.toFixed(1)} ม.)`;
    if(x.taperIn+x.taperOut>x.end-x.start+1e-6)return `${road.name}: ช่วงเปลี่ยนของช่องเพิ่มยาวกว่าตัวช่อง (${x.start.toFixed(0)}–${x.end.toFixed(0)} ม.)`;
    if((x.direction==='forward'?road.section.forwardLanes:road.section.backwardLanes)<1)return `${road.name}: ไม่มีช่องจราจร${x.direction==='forward'?'ตามทิศที่วาด':'ทิศสวน'} จึงเพิ่มช่องด้านนี้ไม่ได้`;
  }
  // Not more than LANE_RUN_STACK added lanes at once on one side of one direction.
  for(const a of list as LaneRun[]){
    const same=(list as LaneRun[]).filter(b=>b.direction===a.direction&&b.side===a.side&&b.start<a.end&&b.end>a.start&&b.start<=a.start);
    if(same.length>LANE_RUN_STACK)return `${road.name}: ช่องเพิ่มซ้อนกันเกิน ${LANE_RUN_STACK} ช่องที่ระยะ ${a.start.toFixed(0)} ม.`;
  }
  return null;
}

/** A run's part on one link of the road, as a network lane component in link stations. */
export function clipRun(run:LaneRun,from:number,to:number):{component:LinkStationLaneComponent;clipped:boolean}|null{
  const a=Math.max(run.start,from),b=Math.min(run.end,to);if(b-a<1)return null;
  const clipped=run.start<from-1e-6||run.end>to+1e-6;
  // A clipped end keeps its taper inside the link so the lane never stops square.
  return{clipped,component:{id:`run-${run.id}`,kind:'lane',direction:run.direction,side:run.side,start:r3(a-from),end:r3(b-from),taperIn:run.taperIn,taperOut:run.taperOut}};
}

/**
 * Lane runs carried onto a road whose stations changed (straighten, join, reverse, alignment conversion): both ends are
 * found on the ground and re-measured on the new alignment. A run measured the other way round now runs against the
 * drawing direction, so its direction flips (two-way roads) unless the road's traffic itself reversed (`keepDirection`).
 */
export function remapRuns(runs:LaneRun[]|undefined,before:Pick<Road,'points'|'alignment'>,after:Pick<Road,'points'|'alignment'>,keepDirection=false):LaneRun[]|undefined{
  if(!runs?.length)return runs;
  const A0=resolveAlignment(before.points,before.alignment??'chord'),A1=resolveAlignment(after.points,after.alignment??'chord');
  const at=(s:number)=>A1.project(A0.pointAt(s)).station;
  return runs.map(r=>{
    const s=at(r.start),e=at(r.end);
    if(e>=s)return{...r,start:r3(s),end:r3(e)};
    return{...r,start:r3(e),end:r3(s),taperIn:r.taperOut,taperOut:r.taperIn,...(keepDirection?{}:{direction:r.direction==='forward'?'backward' as const:'forward' as const})};
  });
}

/** Split runs at a road station: the part before stays, the part after is re-measured from the split (no taper at the cut). */
export function splitRuns(runs:LaneRun[]|undefined,s:number):[LaneRun[],LaneRun[]]{
  const a:LaneRun[]=[],b:LaneRun[]=[];
  for(const r of runs??[]){
    if(r.end<=s+1e-6)a.push({...r});
    else if(r.start>=s-1e-6)b.push({...r,start:r3(r.start-s),end:r3(r.end-s)});
    else{if(s-r.start>1)a.push({...r,end:r3(s),taperOut:0,taperIn:Math.min(r.taperIn,s-r.start)});if(r.end-s>1)b.push({...r,id:`${r.id}b`.slice(0,30),start:0,end:r3(r.end-s),taperIn:0,taperOut:Math.min(r.taperOut,r.end-s)});}
  }
  return[a,b];
}

/** A new run centred on the longest stretch between junction approaches (`stretches` in road stations). */
export function newLaneRun(road:Road,stretches:{start:number;end:number}[],direction:LaneRun['direction'],side:LaneRun['side']):{run:LaneRun}|{error:string}{
  const ids=new Set((road.laneRuns??[]).map(r=>r.id));let n=1;while(ids.has(`L${n}`))n++;
  const s=[...stretches].sort((x,y)=>(y.end-y.start)-(x.end-x.start))[0];
  if(!s||s.end-s.start<20)return{error:'ถนนช่วงนี้สั้นเกินกว่าจะเพิ่มช่องนอกช่วงเข้าทางแยก'};
  const length=Math.min(LANE_RUN_DEFAULTS.length,(s.end-s.start)*.8),mid=(s.start+s.end)/2,taper=Math.min(LANE_RUN_DEFAULTS.taper,length/3);
  return{run:{id:`L${n}`,direction,side,start:r3(mid-length/2),end:r3(mid+length/2),taperIn:r3(taper),taperOut:r3(taper)}};
}

/**
 * Auxiliary lanes of attached ramp ends, as lane runs on their main roads: a deceleration lane before a diverge
 * (full lane up to the attachment, taper upstream), an acceleration lane after a merge (full lane from the attachment,
 * taper downstream). Upstream / downstream follow the traffic on that side (side 1 runs with the drawing direction).
 * Overlapping lanes on the same side join into one continuous auxiliary lane (a merge followed by a diverge).
 */
export function auxLaneRuns(roads:Road[]):Map<string,LaneRun[]>{
  const out=new Map<string,LaneRun[]>(),length=new Map(roads.map(r=>[r.id,resolveAlignment(r.points,r.alignment??'chord').length]));
  for(const r of roads)for(const end of ['start','end'] as const){
    const a=r.anchors?.[end],lane=r.terminals?.[end],L=a&&length.get(a.roadId);if(!a||!lane||L===undefined)continue;
    const span=lane.length+lane.taper,withTraffic=a.side===1,upstream=end==='start';
    // Along the stations: before the attachment when the lane is upstream of it for this traffic, else after.
    const before=upstream===withTraffic;
    const s0=before?a.station-span:a.station,s1=before?a.station:a.station+span,start=Math.max(0,s0),stop=Math.min(L,s1);
    if(stop-start<2)continue;
    out.set(a.roadId,[...(out.get(a.roadId)??[]),{id:`aux-${r.id}-${end}`.slice(0,30),direction:withTraffic?'forward':'backward',side:'curb',start:r3(start),end:r3(stop),
      taperIn:before?Math.min(lane.taper,stop-start):0,taperOut:before?0:Math.min(lane.taper,stop-start)}]);
  }
  for(const [id,list] of out){
    const merged:LaneRun[]=[];
    for(const x of [...list].sort((p,q)=>p.start-q.start)){
      const m=merged.find(y=>y.direction===x.direction&&y.side===x.side&&x.start<=y.end+1e-6);
      if(m){if(x.end>m.end){m.end=x.end;m.taperOut=x.taperOut;}m.id=`${m.id}+`.slice(0,30);}else merged.push({...x});
    }
    out.set(id,merged);
  }
  return out;
}

/** A merge followed by the next diverge on the same side of a road: the stretch traffic weaves across (measured only). */
export type Weave={roadId:string;side:1|-1;merge:string;diverge:string;length:number;connected:boolean};
export function weavingSections(roads:Road[],aux=auxLaneRuns(roads)):Weave[]{
  const out:Weave[]=[];
  for(const main of roads){
    for(const side of [1,-1] as const){
      const ev=roads.flatMap(r=>(['start','end'] as const).flatMap(end=>{const a=r.anchors?.[end];
        return a&&a.roadId===main.id&&a.side===side?[{ramp:r.id,kind:end==='end'?'merge' as const:'diverge' as const,station:a.station}]:[];}))
        .sort((p,q)=>(p.station-q.station)*side);
      for(let i=1;i<ev.length;i++){
        const m=ev[i-1],d=ev[i];if(m.kind!=='merge'||d.kind!=='diverge'||m.ramp===d.ramp)continue;
        const lo=Math.min(m.station,d.station),hi=Math.max(m.station,d.station),dir=side===1?'forward':'backward';
        const connected=(aux.get(main.id)??[]).some(x=>x.direction===dir&&x.start<=lo+1e-6&&x.end>=hi-1e-6);
        out.push({roadId:main.id,side,merge:m.ramp,diverge:d.ramp,length:r3(hi-lo),connected});
      }
    }
  }
  return out;
}
