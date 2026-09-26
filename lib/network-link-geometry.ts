import {
  linkEndSection,linkLaneCounts,linkLaneTransitionValid,linkLinearTransitionPossible,linkPoints,
  type LinkDirection,type LinkLaneTransition,type LinkStationComponent,type NetworkProject,type RoadLink,type WorldPoint
} from './network-project';
import {station,stationOffsets} from './alignment';
import {
  constantStationProfile,endpointEnvelopeValues,endpointStationProfile,profileSampleStations,sampleStationProfile,
  transitionStationProfile,windowStationProfile,type StationValueProfile
} from './station-profile';

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

type ResolvedStationComponent={component:LinkStationComponent;values:number[]};
const sameBandTypes=(a:{type:string}[],b:{type:string}[])=>a.length===b.length&&a.every((v,i)=>v.type===b[i].type);
const sumAt=(sets:number[][],index:number)=>sets.reduce((sum,values)=>sum+(values[index]??0),0);
const clampWidth=(value:number)=>Math.max(0,value);

function transitionFor(link:RoadLink,direction:LinkDirection):LinkLaneTransition|undefined{
  return direction==='forward'?link.sectionProfile.forwardLaneTransition:link.sectionProfile.backwardLaneTransition;
}
function sectionValues(start:number,end:number,envelope:number,stationList:number[],total:number,linear:boolean){
  return linear?sampleStationProfile(endpointStationProfile(start,end,total),stationList):endpointEnvelopeValues(stationList,start,end,envelope,total);
}
function laneCountProfile(project:NetworkProject,link:RoadLink,direction:LinkDirection,total:number,linear:boolean):StationValueProfile{
  const counts=linkLaneCounts(project,link,direction);
  if(!counts)return constantStationProfile(0,total);
  if(!linear||counts.from===counts.to)return constantStationProfile(counts.from,total);
  const transition=transitionFor(link,direction);
  if(!transition||!linkLaneTransitionValid(project,link,direction))return constantStationProfile(counts.from,total);
  return transitionStationProfile(counts.from,counts.to,total,transition.center-transition.length/2,transition.center+transition.length/2,'smooth');
}
function componentWindow(component:LinkStationComponent,total:number){
  return windowStationProfile(total,component.start,component.end,component.taperIn,component.taperOut,1);
}
function mergeStations(total:number,groups:number[][]){
  const values=groups.flat().filter(Number.isFinite).map(value=>Math.max(0,Math.min(total,value))).map(value=>+value.toFixed(8)).sort((a,b)=>a-b),
    out:number[]=[];
  for(const value of values)if(!out.length||Math.abs(value-out.at(-1)!)>1e-7)out.push(value);
  if(!out.length||out[0]>1e-7)out.unshift(0);
  if(Math.abs((out.at(-1)??0)-total)>1e-7)out.push(total);
  return out;
}
function resolvedComponents(link:RoadLink,total:number,stations:number[],linear:boolean):ResolvedStationComponent[]{
  if(!linear)return[];
  return link.components.map(component=>({component,values:sampleStationProfile(componentWindow(component,total),stations)}));
}
function componentSets(components:ResolvedStationComponent[],direction:LinkDirection,kind:'lane'|'width',predicate:(component:LinkStationComponent)=>boolean){
  return components.filter(item=>item.component.direction===direction&&item.component.kind===kind&&predicate(item.component)).map(item=>item.values);
}
function laneExtraValues(components:ResolvedStationComponent[],direction:LinkDirection,stations:number[]){
  const sets=componentSets(components,direction,'lane',()=>true);
  return stations.map((_,index)=>sumAt(sets,index));
}
function medianLaneExtraValues(components:ResolvedStationComponent[],direction:LinkDirection,stations:number[]){
  const sets=componentSets(components,direction,'lane',component=>component.kind==='lane'&&component.side==='median');
  return stations.map((_,index)=>sumAt(sets,index));
}
function widthAdjustmentValues(components:ResolvedStationComponent[],direction:LinkDirection,target:string,stations:number[]){
  const matches=components.filter(item=>item.component.kind==='width'&&item.component.direction===direction&&item.component.target===target);
  return stations.map((_,index)=>matches.reduce((sum,item)=>sum+(item.component.kind==='width'?item.component.delta:0)*(item.values[index]??0),0));
}
function endpointMedianExtra(project:NetworkProject,link:RoadLink,direction:LinkDirection,countValues:number[],stations:number[]){
  const counts=linkLaneCounts(project,link,direction),transition=transitionFor(link,direction);
  if(!counts||counts.from===counts.to||!transition||transition.side!=='median'||!linkLaneTransitionValid(project,link,direction))return stations.map(()=>0);
  const minCount=Math.min(counts.from,counts.to);
  return countValues.map(count=>Math.max(0,count-minCount));
}
function lineProfiles(
  project:NetworkProject,link:RoadLink,direction:LinkDirection,stationList:number[],medianHalf:number[],widths:number[],countValues:number[],components:ResolvedStationComponent[]
):LinkLaneLineProfile[]{
  const counts=linkLaneCounts(project,link,direction);
  if(!counts)return[];
  const sign=direction==='forward'?1:-1,minCount=Math.min(counts.from,counts.to),maxCount=Math.max(counts.from,counts.to),same=counts.from===counts.to,
    transition=transitionFor(link,direction),profiles:LinkLaneLineProfile[]=[],localMedian=medianLaneExtraValues(components,direction,stationList),
    endpointMedian=endpointMedianExtra(project,link,direction,countValues,stationList);
  if(same){
    for(let lane=1;lane<counts.from;lane++)profiles.push({id:`${direction}:main:${lane}`,direction,offsets:stationList.map((_,i)=>sign*(medianHalf[i]+lane*widths[i]))});
  }else if(maxCount-minCount===1&&transition&&linkLaneTransitionValid(project,link,direction)){
    const extras=countValues.map(count=>Math.max(0,count-minCount));
    if(transition.side==='curb'){
      for(let lane=1;lane<minCount;lane++)profiles.push({id:`${direction}:common:${lane}`,direction,offsets:stationList.map((_,i)=>sign*(medianHalf[i]+lane*widths[i]))});
      profiles.push({id:`${direction}:curb-extra`,direction,offsets:stationList.map((_,i)=>extras[i]>.015?sign*(medianHalf[i]+minCount*widths[i]):null)});
    }else{
      profiles.push({id:`${direction}:median-extra`,direction,offsets:stationList.map((_,i)=>extras[i]>.015?sign*(medianHalf[i]+extras[i]*widths[i]):null)});
      for(let lane=1;lane<minCount;lane++)profiles.push({id:`${direction}:common:${lane}`,direction,offsets:stationList.map((_,i)=>sign*(medianHalf[i]+extras[i]*widths[i]+lane*widths[i]))});
    }
  }
  for(const profile of profiles)profile.offsets=profile.offsets.map((offset,index)=>offset===null?null:offset+sign*localMedian[index]*widths[index]);
  for(const item of components){
    const component=item.component;if(component.kind!=='lane'||component.direction!==direction)continue;
    if(component.side==='curb')profiles.push({
      id:`${direction}:component:${component.id}`,direction,
      offsets:item.values.map((active,index)=>active>.015?sign*(medianHalf[index]+countValues[index]*widths[index]):null)
    });
    else profiles.push({
      id:`${direction}:component:${component.id}`,direction,
      offsets:item.values.map((active,index)=>active>.015?sign*(medianHalf[index]+(endpointMedian[index]+active)*widths[index]):null)
    });
  }
  return profiles;
}

export function resolveLinkSectionGeometry(project:NetworkProject,link:RoadLink):ResolvedLinkSectionGeometry|null{
  const basePoints=linkPoints(project,link),from=linkEndSection(project,link,'from'),to=linkEndSection(project,link,'to');
  if(basePoints.length<2||!from||!to)return null;
  const baseStations=stationOffsets(basePoints),total=Math.max(.001,baseStations.at(-1)??0),linear=link.sectionProfile.mode==='linear'&&linkLinearTransitionPossible(project,link),
    forwardCountProfile=laneCountProfile(project,link,'forward',total,linear),backwardCountProfile=laneCountProfile(project,link,'backward',total,linear),
    componentProfiles=linear?link.components.map(component=>componentWindow(component,total)):[],
    stationList=linear?mergeStations(total,[baseStations,profileSampleStations(forwardCountProfile),profileSampleStations(backwardCountProfile),...componentProfiles.map(profile=>profileSampleStations(profile))]):baseStations,
    points=linear?stationList.map(value=>{const p=station(basePoints,value);return{x:p.x,y:p.y};}):basePoints,
    components=resolvedComponents(link,total,stationList,linear),
    medianHalf=sectionValues(from.median/2,to.median/2,Math.max(from.median,to.median)/2,stationList,total,linear),
    forwardLaneWidth=sectionValues(from.forwardLaneWidth,to.forwardLaneWidth,Math.max(from.forwardLaneWidth,to.forwardLaneWidth),stationList,total,linear),
    backwardLaneWidth=sectionValues(from.backwardLaneWidth,to.backwardLaneWidth,Math.max(from.backwardLaneWidth,to.backwardLaneWidth),stationList,total,linear),
    forwardCount=sampleStationProfile(forwardCountProfile,stationList),backwardCount=sampleStationProfile(backwardCountProfile,stationList),
    forwardExtra=laneExtraValues(components,'forward',stationList),backwardExtra=laneExtraValues(components,'backward',stationList),
    left=stationList.map((_,i)=>medianHalf[i]+(forwardCount[i]+forwardExtra[i])*forwardLaneWidth[i]),
    right=stationList.map((_,i)=>medianHalf[i]+(backwardCount[i]+backwardExtra[i])*backwardLaneWidth[i]),
    forwardBands:LinkBandProfile[]=[],backwardBands:LinkBandProfile[]=[];
  const forwardTopology=sameBandTypes(from.forwardBands,to.forwardBands),backwardTopology=sameBandTypes(from.backwardBands,to.backwardBands);
  let forwardInner=[...left];
  if(forwardTopology)from.forwardBands.forEach((band,index)=>{
    const end=to.forwardBands[index],base=sectionValues(band.width,end.width,Math.max(band.width,end.width),stationList,total,linear),
      adjustment=widthAdjustmentValues(components,'forward',band.type,stationList),width=base.map((value,i)=>clampWidth(value+adjustment[i])),
      inner=[...forwardInner],outer=inner.map((v,i)=>v+width[i]);
    if(width.some(v=>v>.01))forwardBands.push({type:band.type,inner,outer});forwardInner=outer;
  });
  let backwardInner=right.map(v=>-v);
  if(backwardTopology)from.backwardBands.forEach((band,index)=>{
    const end=to.backwardBands[index],base=sectionValues(band.width,end.width,Math.max(band.width,end.width),stationList,total,linear),
      adjustment=widthAdjustmentValues(components,'backward',band.type,stationList),width=base.map((value,i)=>clampWidth(value+adjustment[i])),
      inner=[...backwardInner],outer=inner.map((v,i)=>v-width[i]);
    if(width.some(v=>v>.01))backwardBands.push({type:band.type,inner,outer});backwardInner=outer;
  });
  const forwardWalkBase=forwardTopology?sectionValues(from.forwardWalk,to.forwardWalk,Math.max(from.forwardWalk,to.forwardWalk),stationList,total,linear):stationList.map(()=>0),
    backwardWalkBase=backwardTopology?sectionValues(from.backwardWalk,to.backwardWalk,Math.max(from.backwardWalk,to.backwardWalk),stationList,total,linear):stationList.map(()=>0),
    forwardWalkAdjust=widthAdjustmentValues(components,'forward','walk',stationList),backwardWalkAdjust=widthAdjustmentValues(components,'backward','walk',stationList),
    forwardWalkWidth=forwardWalkBase.map((value,i)=>clampWidth(value+forwardWalkAdjust[i])),backwardWalkWidth=backwardWalkBase.map((value,i)=>clampWidth(value+backwardWalkAdjust[i])),
    forwardWalk=forwardWalkWidth.some(v=>v>.01)?{inner:[...forwardInner],outer:forwardInner.map((v,i)=>v+forwardWalkWidth[i])}:null,
    backwardWalk=backwardWalkWidth.some(v=>v>.01)?{inner:[...backwardInner],outer:backwardInner.map((v,i)=>v-backwardWalkWidth[i])}:null,
    laneLines=linear?[...lineProfiles(project,link,'forward',stationList,medianHalf,forwardLaneWidth,forwardCount,components),...lineProfiles(project,link,'backward',stationList,medianHalf,backwardLaneWidth,backwardCount,components)]:[];
  return{points,stations:stationList,total,linear,left,right,medianHalf,forwardLaneWidth,backwardLaneWidth,laneLines,forwardBands,backwardBands,forwardWalk,backwardWalk};
}
