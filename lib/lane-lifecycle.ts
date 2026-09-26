import {
  linkLaneCounts,linkLaneTransitionValid,
  type LinkDirection,type NetworkProject,type RoadLink
} from './network-project';
import {
  sampleStationProfile,transitionStationProfile,windowStationProfile,
  type StationValueProfile
} from './station-profile';

export type LaneLifecycleSource='junction-endpoint'|'roadlink-component';
export type ResolvedLaneLifecycle={
  id:string;
  direction:LinkDirection;
  side:'curb'|'median';
  source:LaneLifecycleSource;
  componentId?:string;
  profile:StationValueProfile;
};
export type ResolvedLaneLifecycleSet={
  direction:LinkDirection;
  baseCount:number;
  lifecycles:ResolvedLaneLifecycle[];
};
export type SampledLaneLifecycle=ResolvedLaneLifecycle&{values:number[]};

const transitionFor=(link:RoadLink,direction:LinkDirection)=>
  direction==='forward'?link.sectionProfile.forwardLaneTransition:link.sectionProfile.backwardLaneTransition;

export function resolveLinkLaneLifecycles(
  project:NetworkProject,link:RoadLink,direction:LinkDirection,total:number,linear=true
):ResolvedLaneLifecycleSet{
  const counts=linkLaneCounts(project,link,direction),length=Math.max(0,total);
  if(!counts)return{direction,baseCount:0,lifecycles:[]};
  if(!linear)return{direction,baseCount:counts.from,lifecycles:[]};

  const baseCount=Math.min(counts.from,counts.to),lifecycles:ResolvedLaneLifecycle[]=[];
  if(counts.from!==counts.to&&Math.abs(counts.from-counts.to)===1&&linkLaneTransitionValid(project,link,direction)){
    const transition=transitionFor(link,direction);
    if(transition){
      const start=transition.center-transition.length/2,end=transition.center+transition.length/2,
        fromExtra=counts.from-baseCount,toExtra=counts.to-baseCount;
      lifecycles.push({
        id:`${direction}:${transition.side}-extra`,
        direction,
        side:transition.side,
        source:'junction-endpoint',
        profile:transitionStationProfile(fromExtra,toExtra,length,start,end,'smooth')
      });
    }
  }

  for(const component of link.components){
    if(component.kind!=='lane'||component.direction!==direction)continue;
    lifecycles.push({
      id:`${direction}:component:${component.id}`,
      direction,
      side:component.side,
      source:'roadlink-component',
      componentId:component.id,
      profile:windowStationProfile(length,component.start,component.end,component.taperIn,component.taperOut,1)
    });
  }

  return{direction,baseCount:counts.from===counts.to?counts.from:baseCount,lifecycles};
}

export function sampleLaneLifecycles(set:ResolvedLaneLifecycleSet,stations:number[]):SampledLaneLifecycle[]{
  return set.lifecycles.map(lifecycle=>({...lifecycle,values:sampleStationProfile(lifecycle.profile,stations)}));
}

export function laneCountSeries(set:ResolvedLaneLifecycleSet,stations:number[],samples=sampleLaneLifecycles(set,stations)){
  return stations.map((_,index)=>set.baseCount+samples.reduce((sum,lifecycle)=>sum+(lifecycle.values[index]??0),0));
}
