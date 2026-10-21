// Mid-block median openings / U-turns on a road (UX closure before Phase 4A, GW-04). Authored in road stations
// (start of the opening from the road start); compile places each one on the link it falls in. Starting lengths match the
// junction-approach openings (tool values, not standards).
import {projectAlignment} from '../common/alignment';
import {linkPoints,type WorldPoint} from '../network/network-project';
import {pointAt,stations,type CompileResult,type Road,type RoadOpening} from './derive';
import {OPENING_START_LENGTH,type OpeningType} from './approach-edit';

export const roadLength=(r:Road)=>stations(r.points).at(-1)??0;

/** Road-station ranges of the links built from this road (stretches between junction approaches and road ends). */
export function freeStretches(road:Road,compiled:CompileResult):{start:number;end:number}[]{
  return compiled.project.links.filter(l=>compiled.sources.links[l.id]===road.id).map(l=>{
    const ps=linkPoints(compiled.project,l),a=projectAlignment(road.points,ps[0]).station,b=projectAlignment(road.points,ps[ps.length-1]).station;
    return{start:Math.min(a,b),end:Math.max(a,b)};
  }).sort((x,y)=>x.start-y.start);
}

/** A new opening centred on the longest free stretch, clear of existing openings (at least 1 m apart). */
export function newRoadOpening(road:Road,compiled:CompileResult,type:OpeningType):{opening:RoadOpening}|{error:string}{
  if(road.section.median<=0)return{error:'ต้องมีเกาะกลางก่อนเพิ่มช่องเปิด'};
  const length=OPENING_START_LENGTH[type],list=road.openings??[];
  const stretches=freeStretches(road,compiled).filter(s=>s.end-s.start>=length+2).sort((a,b)=>(b.end-b.start)-(a.end-a.start));
  if(!stretches.length)return{error:'ถนนช่วงนี้สั้นเกินกว่าจะมีช่องเปิดเกาะกลางนอกช่วงเข้าทางแยก'};
  const ids=new Set(list.map(o=>o.id));let n=1;while(ids.has(`m${type}-${n}`))n++;
  for(const s of stretches){
    let station=Math.round(((s.start+s.end)/2-length/2)*2)/2;
    for(const o of [...list].sort((a,b)=>a.station-b.station))if(station<o.station+o.length+1&&station+length+1>o.station)station=o.station+o.length+1;
    if(station+length<=s.end)return{opening:{id:`m${type}-${n}`,type,station,length}};
  }
  return{error:'ไม่มีที่ว่างพอสำหรับช่องเปิดเพิ่ม'};
}

/** Middle of an opening on the road centreline (plan handle). */
export const roadOpeningHandle=(road:Road,o:RoadOpening):WorldPoint=>pointAt(road.points,o.station+o.length/2);
/** Opening start for its handle dragged to p, in 0.5 m steps, kept on the road. */
export function roadOpeningStationFromPoint(road:Road,o:RoadOpening,p:WorldPoint):number{
  const s=projectAlignment(road.points,p).station-o.length/2;
  return Math.max(0,Math.min(Math.round((roadLength(road)-o.length)*2)/2,Math.round(s*2)/2));
}
