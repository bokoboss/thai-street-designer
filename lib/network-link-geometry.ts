import {
  linkEndSection,linkLaneCounts,linkLaneTransitionValid,linkLinearTransitionPossible,linkPoints,
  type LinkDirection,type LinkLaneTransition,type NetworkProject,type RoadLink,type WorldPoint
} from './network-project';
import {stationOffsets} from './alignment';
import {constantStationProfile,endpointEnvelopeValues,endpointStationProfile,sampleStationProfile,transitionStationProfile} from './station-profile';

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

const sameBandTypes=(a:{type:string}[],b:{type:string}[])=>a.length===b.length&&a.every((v,i)=>v.type===b[i].type);
function transitionFor(link:RoadLink,direction:LinkDirection):LinkLaneTransition|undefined{
  return direction==='forward'?link.sectionProfile.forwardLaneTransition:link.sectionProfile.backwardLaneTransition;
}
function sectionValues(start:number,end:number,envelope:number,stationList:number[],total:number,linear:boolean){
  return linear?sampleStationProfile(endpointStationProfile(start,end,total),stationList):endpointEnvelopeValues(stationList,start,end,envelope,total);
}
function laneCountValues(project:NetworkProject,link:RoadLink,direction:LinkDirection,stationList:number[],total:number,linear:boolean){
  const counts=linkLaneCounts(project,link,direction);if(!counts)return stationList.map(()=>0);
  if(!linear||counts.from===counts.to)return sampleStationProfile(constantStationProfile(counts.from,total),stationList);
  const transition=transitionFor(link,direction);
  if(!transition||!linkLaneTransitionValid(project,link,direction))return sampleStationProfile(constantStationProfile(counts.from,total),stationList);
  const start=transition.center-transition.length/2,end=transition.center+transition.length/2;
  return sampleStationProfile(transitionStationProfile(counts.from,counts.to,total,start,end,'smooth'),stationList);
}
function lineProfiles(project:NetworkProject,link:RoadLink,direction:LinkDirection,stationList:number[],medianHalf:number[],widths:number[],countValues:number[]):LinkLaneLineProfile[]{
  const counts=linkLaneCounts(project,link,direction);
  if(!counts)return[];
  const sign=direction==='forward'?1:-1,minCount=Math.min(counts.from,counts.to),maxCount=Math.max(counts.from,counts.to),same=counts.from===counts.to,
    transition=transitionFor(link,direction),profiles:LinkLaneLineProfile[]=[];
  if(same){
    for(let lane=1;lane<counts.from;lane++)profiles.push({id:`${direction}:main:${lane}`,direction,offsets:stationList.map((_,i)=>sign*(medianHalf[i]+lane*widths[i]))});
    return profiles;
  }
  if(maxCount-minCount!==1||!transition||!linkLaneTransitionValid(project,link,direction))return[];
  const extras=countValues.map(count=>Math.max(0,count-minCount));
  if(transition.side==='curb'){
    for(let lane=1;lane<minCount;lane++)profiles.push({id:`${direction}:common:${lane}`,direction,offsets:stationList.map((_,i)=>sign*(medianHalf[i]+lane*widths[i]))});
    profiles.push({id:`${direction}:curb-extra`,direction,offsets:stationList.map((_,i)=>extras[i]>.015?sign*(medianHalf[i]+minCount*widths[i]):null)});
  }else{
    profiles.push({id:`${direction}:median-extra`,direction,offsets:stationList.map((_,i)=>extras[i]>.015?sign*(medianHalf[i]+extras[i]*widths[i]):null)});
    for(let lane=1;lane<minCount;lane++)profiles.push({id:`${direction}:common:${lane}`,direction,offsets:stationList.map((_,i)=>sign*(medianHalf[i]+extras[i]*widths[i]+lane*widths[i]))});
  }
  return profiles;
}

export function resolveLinkSectionGeometry(project:NetworkProject,link:RoadLink):ResolvedLinkSectionGeometry|null{
  const points=linkPoints(project,link),from=linkEndSection(project,link,'from'),to=linkEndSection(project,link,'to');
  if(points.length<2||!from||!to)return null;
  const stationList=stationOffsets(points),total=Math.max(.001,stationList.at(-1)??0),linear=link.sectionProfile.mode==='linear'&&linkLinearTransitionPossible(project,link),
    medianHalf=sectionValues(from.median/2,to.median/2,Math.max(from.median,to.median)/2,stationList,total,linear),
    forwardLaneWidth=sectionValues(from.forwardLaneWidth,to.forwardLaneWidth,Math.max(from.forwardLaneWidth,to.forwardLaneWidth),stationList,total,linear),
    backwardLaneWidth=sectionValues(from.backwardLaneWidth,to.backwardLaneWidth,Math.max(from.backwardLaneWidth,to.backwardLaneWidth),stationList,total,linear),
    forwardCount=linear?laneCountValues(project,link,'forward',stationList,total,true):sectionValues(from.forwardLanes,to.forwardLanes,Math.max(from.forwardLanes,to.forwardLanes),stationList,total,false),
    backwardCount=linear?laneCountValues(project,link,'backward',stationList,total,true):sectionValues(from.backwardLanes,to.backwardLanes,Math.max(from.backwardLanes,to.backwardLanes),stationList,total,false),
    left=stationList.map((_,i)=>medianHalf[i]+forwardCount[i]*forwardLaneWidth[i]),right=stationList.map((_,i)=>medianHalf[i]+backwardCount[i]*backwardLaneWidth[i]),
    forwardBands:LinkBandProfile[]=[],backwardBands:LinkBandProfile[]=[];
  const forwardTopology=sameBandTypes(from.forwardBands,to.forwardBands),backwardTopology=sameBandTypes(from.backwardBands,to.backwardBands);
  let forwardInner=[...left];
  if(forwardTopology)from.forwardBands.forEach((band,index)=>{
    const end=to.forwardBands[index],width=sectionValues(band.width,end.width,Math.max(band.width,end.width),stationList,total,linear),
      inner=[...forwardInner],outer=inner.map((v,i)=>v+width[i]);
    forwardBands.push({type:band.type,inner,outer});forwardInner=outer;
  });
  let backwardInner=right.map(v=>-v);
  if(backwardTopology)from.backwardBands.forEach((band,index)=>{
    const end=to.backwardBands[index],width=sectionValues(band.width,end.width,Math.max(band.width,end.width),stationList,total,linear),
      inner=[...backwardInner],outer=inner.map((v,i)=>v-width[i]);
    backwardBands.push({type:band.type,inner,outer});backwardInner=outer;
  });
  const forwardWalkWidth=forwardTopology?sectionValues(from.forwardWalk,to.forwardWalk,Math.max(from.forwardWalk,to.forwardWalk),stationList,total,linear):stationList.map(()=>0),
    backwardWalkWidth=backwardTopology?sectionValues(from.backwardWalk,to.backwardWalk,Math.max(from.backwardWalk,to.backwardWalk),stationList,total,linear):stationList.map(()=>0),
    forwardWalk=forwardWalkWidth.some(v=>v>0)?{inner:[...forwardInner],outer:forwardInner.map((v,i)=>v+forwardWalkWidth[i])}:null,
    backwardWalk=backwardWalkWidth.some(v=>v>0)?{inner:[...backwardInner],outer:backwardInner.map((v,i)=>v-backwardWalkWidth[i])}:null,
    laneLines=linear?[...lineProfiles(project,link,'forward',stationList,medianHalf,forwardLaneWidth,forwardCount),...lineProfiles(project,link,'backward',stationList,medianHalf,backwardLaneWidth,backwardCount)]:[];
  return{points,stations:stationList,total,linear,left,right,medianHalf,forwardLaneWidth,backwardLaneWidth,laneLines,forwardBands,backwardBands,forwardWalk,backwardWalk};
}
