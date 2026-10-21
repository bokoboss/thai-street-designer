import {
  linkEndSection,linkLinearTransitionPossible,linkPoints,
  type LinkDirection,type LinkStationWidthComponent,type NetworkProject,type RoadLink,type WorldPoint
} from './network-project';
import {station,stationOffsets} from '../common/alignment';
import {roadsideDefaults} from '../junction/model';
import {
  endpointEnvelopeValues,endpointStationProfile,profileSampleStations,sampleStationProfile,
  windowStationProfile
} from '../common/station-profile';
import {
  laneCountSeries,resolveLinkLaneLifecycles,sampleLaneLifecycles,
  type ResolvedLaneLifecycleSet,type SampledLaneLifecycle
} from './lane-lifecycle';

export type LinkRoadObject={kind:'tree'|'light';station:number;offset:number;side:1|-1;x:number;y:number;angle:number};
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
  /** Mid-block median openings clipped to the link: station intervals with no median island. */
  openings:{start:number;end:number}[];
  /** Trees and street lights on the sidewalks (side +1 = forward/left offset side). */
  objects:LinkRoadObject[];
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

  const openings=(link.medianOpenings??[]).map(o=>({start:Math.max(0,o.start),end:Math.min(total,o.start+o.length)})).filter(o=>o.end-o.start>.01).sort((a,b)=>a.start-b.start);
  // Trees and lights: the engine's roadside defaults (spacing 15 m, 0.5 m from the sidewalk's inner edge, lights between trees),
  // on sidewalks at least 0.75 m wide, clear of the link ends — the same rules as on junction arms.
  const objects:LinkRoadObject[]=[];
  if(link.roadside&&(link.roadside.trees||link.roadside.lights)){
    const rs=roadsideDefaults(),sample=(values:number[],s:number)=>{let k=0;while(k<stationList.length-2&&stationList[k+1]<s)k++;const s0=stationList[k],s1=stationList[k+1]??s0,t=s1>s0?(s-s0)/(s1-s0):0;return values[k]+((values[k+1]??values[k])-values[k])*t;};
    for(const [side,walk] of [[1,forwardWalk],[-1,backwardWalk]] as const){
      if(!walk)continue;
      for(const kind of ['tree','light'] as const){
        if(!(kind==='tree'?link.roadside.trees:link.roadside.lights))continue;
        const shift=kind==='light'&&link.roadside.trees?rs.spacing/2:0;
        for(let s=5+shift;s<=total-3;s+=rs.spacing){
          const inner=sample(walk.inner,s),outer=sample(walk.outer,s);if(Math.abs(outer-inner)<.75)continue;
          const offset=inner+side*Math.max(.35,Math.min(Math.abs(outer-inner)-.35,rs.offset)),c=station(basePoints,s),ahead=station(basePoints,Math.min(total,s+.5)),behind=station(basePoints,Math.max(0,s-.5));
          const h=Math.atan2(ahead.y-behind.y,ahead.x-behind.x),p={x:c.x-Math.sin(h)*offset,y:c.y+Math.cos(h)*offset};
          objects.push({kind,station:Math.round(s*1000)/1000,offset:Math.round(offset*1000)/1000,side,x:p.x,y:p.y,angle:h*180/Math.PI});
        }
      }
    }
  }
  return{points,stations:stationList,total,linear,left,right,medianHalf,forwardLaneWidth,backwardLaneWidth,laneLines,forwardBands,backwardBands,forwardWalk,backwardWalk,openings,objects};
}

/**
 * Median island pieces of a resolved link: the whole strip when there is no opening (unchanged output), otherwise one
 * strip per stretch between openings, cut exactly at the opening stations. Used by 2D, 3D and export alike.
 */
export function medianIslandStrips(g:ResolvedLinkSectionGeometry):{points:WorldPoint[];half:number[]}[]{
  if(!g.medianHalf.some(v=>v>.01))return[];
  if(!g.openings.length)return[{points:g.points,half:g.medianHalf}];
  const at=(s:number)=>{
    let k=0;while(k<g.stations.length-2&&g.stations[k+1]<s)k++;
    const s0=g.stations[k],s1=g.stations[k+1],t=s1>s0?Math.max(0,Math.min(1,(s-s0)/(s1-s0))):0,p=g.points[k],q=g.points[k+1];
    return{point:{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t},half:g.medianHalf[k]+(g.medianHalf[k+1]-g.medianHalf[k])*t};
  };
  const pieces:{start:number;end:number}[]=[];let from=0;
  for(const o of g.openings){if(o.start>from+.01)pieces.push({start:from,end:o.start});from=Math.max(from,o.end);}
  if(g.total>from+.01)pieces.push({start:from,end:g.total});
  return pieces.map(({start,end})=>{
    const a=at(start),b=at(end),inner=g.stations.map((s,i)=>({s,i})).filter(({s})=>s>start+1e-6&&s<end-1e-6);
    return{points:[a.point,...inner.map(({i})=>g.points[i]),b.point],half:[a.half,...inner.map(({i})=>g.medianHalf[i]),b.half]};
  });
}
