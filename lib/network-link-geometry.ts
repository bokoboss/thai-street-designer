import {
  linkEndSection,linkLaneCounts,linkLaneTransitionValid,linkLinearTransitionPossible,linkPoints,
  type LinkDirection,type LinkLaneTransition,type NetworkProject,type RoadLink,type WorldPoint
} from './network-project';

export type LinkLaneLineProfile={id:string;direction:LinkDirection;offsets:(number|null)[]};
export type LinkBandProfile={type:string;inner:number[];outer:number[]};
export type ResolvedLinkSectionGeometry={
  points:WorldPoint[];
  stations:number[];
  total:number;
  linear:boolean;
  left:number[];
  right:number[];
  medianHalf:number[];
  forwardLaneWidth:number[];
  backwardLaneWidth:number[];
  laneLines:LinkLaneLineProfile[];
  forwardBands:LinkBandProfile[];
  backwardBands:LinkBandProfile[];
  forwardWalk:{inner:number[];outer:number[]}|null;
  backwardWalk:{inner:number[];outer:number[]}|null;
};

const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(t:number)=>{const x=clamp(t);return x*x*(3-2*x);};

function stations(points:WorldPoint[]){
  const out=[0];
  for(let i=1;i<points.length;i++)out.push(out[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
  return out;
}
function transitionFor(link:RoadLink,direction:LinkDirection):LinkLaneTransition|undefined{
  return direction==='forward'?link.sectionProfile.forwardLaneTransition:link.sectionProfile.backwardLaneTransition;
}
function laneProgress(project:NetworkProject,link:RoadLink,direction:LinkDirection,station:number){
  const counts=linkLaneCounts(project,link,direction);
  if(!counts||counts.from===counts.to)return counts?counts.from:0;
  const transition=transitionFor(link,direction);
  if(!transition||!linkLaneTransitionValid(project,link,direction))return counts.from;
  const start=transition.center-transition.length/2;
  const p=smooth((station-start)/transition.length);
  return mix(counts.from,counts.to,p);
}
function lineProfiles(
  project:NetworkProject,link:RoadLink,direction:LinkDirection,stationList:number[],medianHalf:number[],widths:number[]
):LinkLaneLineProfile[]{
  const counts=linkLaneCounts(project,link,direction);
  if(!counts)return[];
  const sign=direction==='forward'?1:-1,minCount=Math.min(counts.from,counts.to),maxCount=Math.max(counts.from,counts.to),same=counts.from===counts.to,
    transition=transitionFor(link,direction),profiles:LinkLaneLineProfile[]=[];
  if(same){
    for(let lane=1;lane<counts.from;lane++)profiles.push({
      id:`${direction}:main:${lane}`,direction,
      offsets:stationList.map((_,i)=>sign*(medianHalf[i]+lane*widths[i]))
    });
    return profiles;
  }
  if(maxCount-minCount!==1||!transition||!linkLaneTransitionValid(project,link,direction))return[];
  const extras=stationList.map((s,i)=>Math.max(0,laneProgress(project,link,direction,s)-minCount));
  if(transition.side==='curb'){
    for(let lane=1;lane<minCount;lane++)profiles.push({
      id:`${direction}:common:${lane}`,direction,
      offsets:stationList.map((_,i)=>sign*(medianHalf[i]+lane*widths[i]))
    });
    profiles.push({
      id:`${direction}:curb-extra`,direction,
      offsets:stationList.map((_,i)=>extras[i]>.015?sign*(medianHalf[i]+minCount*widths[i]):null)
    });
  }else{
    profiles.push({
      id:`${direction}:median-extra`,direction,
      offsets:stationList.map((_,i)=>extras[i]>.015?sign*(medianHalf[i]+extras[i]*widths[i]):null)
    });
    for(let lane=1;lane<minCount;lane++)profiles.push({
      id:`${direction}:common:${lane}`,direction,
      offsets:stationList.map((_,i)=>sign*(medianHalf[i]+extras[i]*widths[i]+lane*widths[i]))
    });
  }
  return profiles;
}

export function resolveLinkSectionGeometry(project:NetworkProject,link:RoadLink):ResolvedLinkSectionGeometry|null{
  const points=linkPoints(project,link),from=linkEndSection(project,link,'from'),to=linkEndSection(project,link,'to');
  if(points.length<2||!from||!to)return null;
  const stationList=stations(points),total=Math.max(.001,stationList.at(-1)??0),linear=link.sectionProfile.mode==='linear'&&linkLinearTransitionPossible(project,link),
    ts=stationList.map(s=>linear?s/total:0),
    medianHalf=ts.map(t=>mix(from.median,to.median,t)/2),
    forwardLaneWidth=ts.map(t=>mix(from.forwardLaneWidth,to.forwardLaneWidth,t)),
    backwardLaneWidth=ts.map(t=>mix(from.backwardLaneWidth,to.backwardLaneWidth,t)),
    forwardCount=stationList.map(s=>linear?laneProgress(project,link,'forward',s):Math.max(from.forwardLanes,to.forwardLanes)),
    backwardCount=stationList.map(s=>linear?laneProgress(project,link,'backward',s):Math.max(from.backwardLanes,to.backwardLanes)),
    left=stationList.map((_,i)=>medianHalf[i]+forwardCount[i]*forwardLaneWidth[i]),
    right=stationList.map((_,i)=>medianHalf[i]+backwardCount[i]*backwardLaneWidth[i]),
    forwardBands:LinkBandProfile[]=[],backwardBands:LinkBandProfile[]=[];
  let forwardInner=[...left];
  from.forwardBands.forEach((band,index)=>{
    const end=to.forwardBands[index]??band,width=ts.map(t=>mix(band.width,end.width,t)),inner=[...forwardInner],outer=inner.map((v,i)=>v+width[i]);
    forwardBands.push({type:band.type,inner,outer});forwardInner=outer;
  });
  let backwardInner=right.map(v=>-v);
  from.backwardBands.forEach((band,index)=>{
    const end=to.backwardBands[index]??band,width=ts.map(t=>mix(band.width,end.width,t)),inner=[...backwardInner],outer=inner.map((v,i)=>v-width[i]);
    backwardBands.push({type:band.type,inner,outer});backwardInner=outer;
  });
  const forwardWalkWidth=ts.map(t=>mix(from.forwardWalk,to.forwardWalk,t)),backwardWalkWidth=ts.map(t=>mix(from.backwardWalk,to.backwardWalk,t)),
    forwardWalk=forwardWalkWidth.some(v=>v>0)?{inner:[...forwardInner],outer:forwardInner.map((v,i)=>v+forwardWalkWidth[i])}:null,
    backwardWalk=backwardWalkWidth.some(v=>v>0)?{inner:[...backwardInner],outer:backwardInner.map((v,i)=>v-backwardWalkWidth[i])}:null,
    laneLines=linear?[...lineProfiles(project,link,'forward',stationList,medianHalf,forwardLaneWidth),...lineProfiles(project,link,'backward',stationList,medianHalf,backwardLaneWidth)]:[];
  return{points,stations:stationList,total,linear,left,right,medianHalf,forwardLaneWidth,backwardLaneWidth,laneLines,forwardBands,backwardBands,forwardWalk,backwardWalk};
}
