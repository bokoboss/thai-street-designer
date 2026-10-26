// Automatic, read-only ramp-to-main-lane mapping at attach points.
// The auxiliary lane is an existing lane run. Do not invent one when the terminal was not authored.
import {auxLaneRuns} from './lane-runs';
import type {CompileResult,Road} from './derive';
import {resolveLinkSectionGeometry,sliceLink} from '../network/network-link-geometry';
import {anchorFlow} from './ramps';

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
export function automaticRampLaneConnections(roads:Road[],compiled:CompileResult):RampLaneConnection[]{
  const byId=new Map(roads.map(r=>[r.id,r])),aux=auxLaneRuns(roads),out:RampLaneConnection[]=[];
  for(const ramp of roads.filter(r=>r.role==='ramp')){
    for(const end of ['start','end'] as const){
      const anchor=ramp.anchors?.[end];if(!anchor)continue;
      const main=byId.get(anchor.roadId),direction=anchor.side===1?'forward':'backward',
        count=main?(direction==='forward'?main.section.forwardLanes:main.section.backwardLanes):0,
        terminal=ramp.terminals?.[end],
        run=(aux.get(anchor.roadId)??[]).find(v=>v.direction===direction&&v.side==='curb'
          &&v.start<=anchor.station+.01&&v.end>=anchor.station-.01);
      const ranges=compiled.linkRanges.filter(r=>r.roadId===anchor.roadId);
      // A zero-taper terminal is a one-sided limit: the lane exists on the auxiliary side of the attachment.
      const sampleStation=anchor.station+anchor.side*(end==='start'?-1:1)*.001;
      const range=ranges.find(r=>r.from<=sampleStation&&r.to>=sampleStation);
      const link=range&&compiled.project.links.find(l=>l.id===range.id);
      const geometry=link&&resolveLinkSectionGeometry(compiled.project,link);
      // The compiler can omit a run (incompatible ends / junction arms), or compose a conflicting reduction.
      let covered=run?.start??0;
      if(run)for(const r of [...ranges].sort((a,b)=>a.from-b.from)){
        const l=compiled.project.links.find(l=>l.id===r.id);
        if(r.from>covered+.01||r.to<covered||!l?.components.some(c=>c.id==='run-'+run.id))continue;
        if(l.components.some(c=>c.kind==='lane'&&c.direction===direction&&c.operation==='drop'
          &&c.start+r.from<run.end&&c.end+r.from>run.start))break;
        covered=Math.max(covered,Math.min(run.end,r.to));
      }
      let aligned=false;
      if(main&&range&&geometry&&geometry.linear&&run&&covered>=run.end-.01){
        const s=sampleStation-range.from,forward=direction==='forward';
        const [[edge],[width],[median]]=sliceLink(geometry,s,s,[forward?geometry.left:geometry.right,
          forward?geometry.forwardLaneWidth:geometry.backwardLaneWidth,geometry.medianHalf]).series;
        const flow=anchorFlow(main,anchor),point=ramp.points[end==='start'?0:ramp.points.length-1];
        const offset=edge-width/2;
        const at=anchor.station-range.from,[center]=sliceLink(geometry,at,at,[]).points;
        const expected={x:center.x+flow.dir.y*offset,y:center.y-flow.dir.x*offset};
        const q=ramp.points[end==='start'?1:ramp.points.length-2];
        const travel=end==='start'?{x:q.x-point.x,y:q.y-point.y}:{x:point.x-q.x,y:point.y-q.y};
        aligned=Math.abs((edge-median)/width-count-1)<1e-6
          &&Math.hypot(point.x-expected.x,point.y-expected.y)<.05
          &&travel.x*flow.dir.x+travel.y*flow.dir.y>0;
      }
      const ready=!!main&&count>0&&ramp.section.forwardLanes===1&&ramp.section.backwardLanes===0
        &&!!terminal&&!!run&&aligned;
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
            'ช่องเสริมที่วาดไม่ต่อเนื่องกับปลายทางลาด ต้องตรวจหน้าตัด ช่วงลดช่อง และแนวถนน'
      });
    }
  }
  return out;
}
