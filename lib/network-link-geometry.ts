import {
  linkEndSection,linkLinearTransitionPossible,linkPoints,
  type LinkDirection,type LinkStationWidthComponent,type NetworkProject,type RoadLink,type WorldPoint
} from './network-project';
import {station,stationOffsets} from './alignment';
import {
  endpointEnvelopeValues,endpointStationProfile,profileSampleStations,sampleStationProfile,
  windowStationProfile
} from './station-profile';
import {
  laneCountSeries,resolveLinkLaneLifecycles,sampleLaneLifecycles,
  type ResolvedLaneLifecycleSet,type SampledLaneLifecycle
} from './lane-lifecycle';

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

type ResolvedWidthComponent={component:LinkStationWidthComponent;values:number[]};
const sameBandTypes=(a:{type:string}[],b:{type:string}[])=>a.length===b.length&&a.every((v,i)=>v.type===b[i].type);
const sumAt=(sets:number[][],index:number)=>sets.reduce((sum,values)=>sum+(values[index]??0),0);
const clampWidth=(value:number)=>Math.max(0,value);

function sectionValues(start:number,end:number,envelope:number,stationList:number[],total:number,linear:boolean){
  return linear?sampleStationProfile(endpointStationProfile(start,end,total),stationList):endpointEnvelopeValues(stationList,start,end,envelope,total);
}
function widthComponentWindow(component:LinkStationWidthComponent,total:number){
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
function resolvedWidthComponents(link:RoadLink,total:number,stations:number[],linear:boolean):ResolvedWidthComponent[]{
  if(!linear)return[];
  return link.components
    .filter((component):component is LinkStationWidthComponent=>component.kind==='width')
    .map(component=>({component,values:sampleStationProfile(widthComponentWindow(component,total),stations)}));
}
function widthAdjustmentValues(components:ResolvedWidthComponent[],direction:LinkDirection,target:string,stations:number[]){
  const matches=components.filter(item=>item.component.direction===direction&&item.component.target===target);
  return stations.map((_,index)=>matches.reduce((sum,item)=>sum+item.component.delta*(item.values[index]??0),0));
}
function sideTotals(samples:SampledLaneLifecycle[],side:'curb'|'median',stations:number[]){
  const sets=samples.filter(lifecycle=>lifecycle.side===side).map(lifecycle=>lifecycle.values);
  return stations.map((_,index)=>sumAt(sets,index));
}
function lineProfiles(
  direction:LinkDirection,set:ResolvedLaneLifecycleSet,samples:SampledLaneLifecycle[],
  stationList:number[],medianHalf:number[],widths:number[]
):LinkLaneLineProfile[]{
  const sign=direction==='forward'?1:-1,profiles:LinkLaneLineProfile[]=[],
    medianSamples=samples.filter(lifecycle=>lifecycle.side==='median'),
    curbSamples=samples.filter(lifecycle=>lifecycle.side==='curb'),
    medianTotal=sideTotals(samples,'median',stationList),
    hasEndpoint=samples.some(lifecycle=>lifecycle.source==='junction-endpoint'),
    commonPrefix=hasEndpoint?'common':'main';

  for(let lane=1;lane<set.baseCount;lane++)profiles.push({
    id:`${direction}:${commonPrefix}:${lane}`,
    direction,
    offsets:stationList.map((_,index)=>sign*(medianHalf[index]+(medianTotal[index]+lane)*widths[index]))
  });

  const priorMedian=stationList.map(()=>0);
  for(const lifecycle of medianSamples){
    profiles.push({
      id:lifecycle.id,
      direction,
      offsets:lifecycle.values.map((active,index)=>active>.015
        ?sign*(medianHalf[index]+(priorMedian[index]+active)*widths[index])
        :null)
    });
    lifecycle.values.forEach((active,index)=>priorMedian[index]+=active);
  }

  const priorCurb=stationList.map(()=>0);
  for(const lifecycle of curbSamples){
    profiles.push({
      id:lifecycle.id,
      direction,
      offsets:lifecycle.values.map((active,index)=>active>.015
        ?sign*(medianHalf[index]+(medianTotal[index]+set.baseCount+priorCurb[index])*widths[index])
        :null)
    });
    lifecycle.values.forEach((active,index)=>priorCurb[index]+=active);
  }
  return profiles;
}

export function resolveLinkSectionGeometry(project:NetworkProject,link:RoadLink):ResolvedLinkSectionGeometry|null{
  const basePoints=linkPoints(project,link),from=linkEndSection(project,link,'from'),to=linkEndSection(project,link,'to');
  if(basePoints.length<2||!from||!to)return null;
  const baseStations=stationOffsets(basePoints),total=Math.max(.001,baseStations.at(-1)??0),linear=link.sectionProfile.mode==='linear'&&linkLinearTransitionPossible(project,link),
    forwardLaneSet=resolveLinkLaneLifecycles(project,link,'forward',total,linear),
    backwardLaneSet=resolveLinkLaneLifecycles(project,link,'backward',total,linear),
    widthProfiles=linear?link.components.filter((component):component is LinkStationWidthComponent=>component.kind==='width').map(component=>widthComponentWindow(component,total)):[],
    stationList=linear?mergeStations(total,[
      baseStations,
      ...forwardLaneSet.lifecycles.map(lifecycle=>profileSampleStations(lifecycle.profile)),
      ...backwardLaneSet.lifecycles.map(lifecycle=>profileSampleStations(lifecycle.profile)),
      ...widthProfiles.map(profile=>profileSampleStations(profile))
    ]):baseStations,
    points=linear?stationList.map(value=>{const p=station(basePoints,value);return{x:p.x,y:p.y};}):basePoints,
    forwardLaneSamples=sampleLaneLifecycles(forwardLaneSet,stationList),
    backwardLaneSamples=sampleLaneLifecycles(backwardLaneSet,stationList),
    widthComponents=resolvedWidthComponents(link,total,stationList,linear),
    medianHalf=sectionValues(from.median/2,to.median/2,Math.max(from.median,to.median)/2,stationList,total,linear),
    forwardLaneWidth=sectionValues(from.forwardLaneWidth,to.forwardLaneWidth,Math.max(from.forwardLaneWidth,to.forwardLaneWidth),stationList,total,linear),
    backwardLaneWidth=sectionValues(from.backwardLaneWidth,to.backwardLaneWidth,Math.max(from.backwardLaneWidth,to.backwardLaneWidth),stationList,total,linear),
    forwardCount=linear?laneCountSeries(forwardLaneSet,stationList,forwardLaneSamples):sectionValues(from.forwardLanes,to.forwardLanes,Math.max(from.forwardLanes,to.forwardLanes),stationList,total,false),
    backwardCount=linear?laneCountSeries(backwardLaneSet,stationList,backwardLaneSamples):sectionValues(from.backwardLanes,to.backwardLanes,Math.max(from.backwardLanes,to.backwardLanes),stationList,total,false),
    left=stationList.map((_,i)=>medianHalf[i]+forwardCount[i]*forwardLaneWidth[i]),
    right=stationList.map((_,i)=>medianHalf[i]+backwardCount[i]*backwardLaneWidth[i]),
    forwardBands:LinkBandProfile[]=[],backwardBands:LinkBandProfile[]=[];

  const forwardTopology=sameBandTypes(from.forwardBands,to.forwardBands),backwardTopology=sameBandTypes(from.backwardBands,to.backwardBands);
  let forwardInner=[...left];
  if(forwardTopology)from.forwardBands.forEach((band,index)=>{
    const end=to.forwardBands[index],base=sectionValues(band.width,end.width,Math.max(band.width,end.width),stationList,total,linear),
      adjustment=widthAdjustmentValues(widthComponents,'forward',band.type,stationList),width=base.map((value,i)=>clampWidth(value+adjustment[i])),
      inner=[...forwardInner],outer=inner.map((v,i)=>v+width[i]);
    if(width.some(v=>v>.01))forwardBands.push({type:band.type,inner,outer});forwardInner=outer;
  });

  let backwardInner=right.map(v=>-v);
  if(backwardTopology)from.backwardBands.forEach((band,index)=>{
    const end=to.backwardBands[index],base=sectionValues(band.width,end.width,Math.max(band.width,end.width),stationList,total,linear),
      adjustment=widthAdjustmentValues(widthComponents,'backward',band.type,stationList),width=base.map((value,i)=>clampWidth(value+adjustment[i])),
      inner=[...backwardInner],outer=inner.map((v,i)=>v-width[i]);
    if(width.some(v=>v>.01))backwardBands.push({type:band.type,inner,outer});backwardInner=outer;
  });

  const forwardWalkBase=forwardTopology?sectionValues(from.forwardWalk,to.forwardWalk,Math.max(from.forwardWalk,to.forwardWalk),stationList,total,linear):stationList.map(()=>0),
    backwardWalkBase=backwardTopology?sectionValues(from.backwardWalk,to.backwardWalk,Math.max(from.backwardWalk,to.backwardWalk),stationList,total,linear):stationList.map(()=>0),
    forwardWalkAdjust=widthAdjustmentValues(widthComponents,'forward','walk',stationList),backwardWalkAdjust=widthAdjustmentValues(widthComponents,'backward','walk',stationList),
    forwardWalkWidth=forwardWalkBase.map((value,i)=>clampWidth(value+forwardWalkAdjust[i])),backwardWalkWidth=backwardWalkBase.map((value,i)=>clampWidth(value+backwardWalkAdjust[i])),
    forwardWalk=forwardWalkWidth.some(v=>v>.01)?{inner:[...forwardInner],outer:forwardInner.map((v,i)=>v+forwardWalkWidth[i])}:null,
    backwardWalk=backwardWalkWidth.some(v=>v>.01)?{inner:[...backwardInner],outer:backwardInner.map((v,i)=>v-backwardWalkWidth[i])}:null,
    laneLines=linear?[
      ...lineProfiles('forward',forwardLaneSet,forwardLaneSamples,stationList,medianHalf,forwardLaneWidth),
      ...lineProfiles('backward',backwardLaneSet,backwardLaneSamples,stationList,medianHalf,backwardLaneWidth)
    ]:[];

  return{points,stations:stationList,total,linear,left,right,medianHalf,forwardLaneWidth,backwardLaneWidth,laneLines,forwardBands,backwardBands,forwardWalk,backwardWalk};
}
