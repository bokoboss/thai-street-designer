// Automatic, read-only ramp-to-main-lane mapping at attach points.
// The auxiliary lane is an existing lane run. Do not invent one when the terminal was not authored.
import {auxLaneRuns} from './lane-runs';
import type {Road} from './derive';

export type RampLaneEnd='start'|'end';
export type RampLaneConnection={
  id:string;rampRoadId:string;mainRoadId:string;end:RampLaneEnd;station:number;
  movement:'diverge'|'merge';direction:'forward'|'backward';
  mainCurbLane:number;rampLane:number;auxiliaryRunId?:string;
  status:'mapped'|'review';
  message:string;
};

/**
 * A ramp's start diverges, and its end merges. Mainline traffic direction follows
 * anchor.side (1 = forward, -1 = backward) in Thailand's left-hand network.
 * A mapped terminal travels through its drawn auxiliary lane before reaching
 * the ramp or the curb-most main lane; lengths are TO_VERIFY, not standards checks.
 */
export function automaticRampLaneConnections(roads:Road[]):RampLaneConnection[]{
  const byId=new Map(roads.map(r=>[r.id,r])),aux=auxLaneRuns(roads),out:RampLaneConnection[]=[];
  for(const ramp of roads.filter(r=>r.role==='ramp')){
    for(const end of ['start','end'] as const){
      const anchor=ramp.anchors?.[end];if(!anchor)continue;
      const main=byId.get(anchor.roadId),direction=anchor.side===1?'forward':'backward',
        count=main?(direction==='forward'?main.section.forwardLanes:main.section.backwardLanes):0,
        terminal=ramp.terminals?.[end],
        run=(aux.get(anchor.roadId)??[]).find(v=>v.direction===direction&&v.side==='curb'
          &&v.start<=anchor.station+.01&&v.end>=anchor.station-.01),
        ready=!!main&&count>0&&ramp.section.forwardLanes===1&&ramp.section.backwardLanes===0&&!!terminal&&!!run;
      out.push({
        id:ramp.id+':'+end+':'+anchor.roadId+':'+direction,
        rampRoadId:ramp.id,mainRoadId:anchor.roadId,end,station:anchor.station,
        movement:end==='start'?'diverge':'merge',direction,
        mainCurbLane:Math.max(0,count-1),rampLane:0,
        ...(ready?{auxiliaryRunId:run!.id}:{}),
        status:ready?'mapped':'review',
        message:ready
          ?(end==='start'?'ช่องริมขอบทาง → ช่องชะลอ → ทางลาด':'ทางลาด → ช่องเร่งความเร็ว → ช่องริมขอบทาง')
          :!main?'ไม่พบถนนหลักที่จุดเชื่อม':
            count<1?'ด้านที่ทางลาดต่อไม่มีช่องเดินรถ':
            ramp.section.forwardLanes!==1||ramp.section.backwardLanes!==0?'รองรับการจับคู่อัตโนมัติสำหรับทางลาดทางเดียวหนึ่งช่อง':
            !terminal?'ยังไม่ได้กำหนดช่องเสริมบนถนนหลัก จึงไม่สร้างทางเชื่อมเอง':
            'ช่วงช่องเสริมไม่ครอบคลุมจุดเชื่อม ต้องตรวจแนวถนน'
      });
    }
  }
  return out;
}
