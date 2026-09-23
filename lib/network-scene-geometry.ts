import {profiledParallel} from './alignment';
import {resolveLinkSectionGeometry} from './network-link-geometry';
import type {NetworkProject,WorldPoint} from './network-project';

export type NetworkSceneSurfaceKind='road'|'median'|'bike'|'motorcycle'|'shoulder'|'buffer'|'sidewalk';
export type NetworkSceneSurface={
  id:string;
  kind:NetworkSceneSurfaceKind;
  points:WorldPoint[];
  z:number;
};

const strip=(center:WorldPoint[],inner:number[],outer:number[])=>[
  ...profiledParallel(center,inner),
  ...profiledParallel(center,outer).reverse()
];
const bandKind=(type:string):NetworkSceneSurfaceKind=>
  type==='bike'||type==='motorcycle'||type==='shoulder'||type==='buffer'?type:'shoulder';

export function resolveRoadLinkSceneSurfaces(project:NetworkProject):NetworkSceneSurface[]{
  const out:NetworkSceneSurface[]=[];
  for(const link of project.links){
    const g=resolveLinkSectionGeometry(project,link);
    if(!g||g.points.length<2)continue;
    out.push({
      id:link.id+':road',
      kind:'road',
      points:strip(g.points,g.right.map(v=>-v),g.left),
      z:.03
    });
    if(g.medianHalf.some(v=>v>.01))out.push({
      id:link.id+':median',
      kind:'median',
      points:strip(g.points,g.medianHalf.map(v=>-v),g.medianHalf),
      z:.16
    });
    g.forwardBands.forEach((band,index)=>out.push({
      id:`${link.id}:forward-band:${index}`,
      kind:bandKind(band.type),
      points:strip(g.points,band.inner,band.outer),
      z:band.type==='buffer'?.07:.06
    }));
    g.backwardBands.forEach((band,index)=>out.push({
      id:`${link.id}:backward-band:${index}`,
      kind:bandKind(band.type),
      points:strip(g.points,band.inner,band.outer),
      z:band.type==='buffer'?.07:.06
    }));
    if(g.forwardWalk)out.push({
      id:link.id+':forward-walk',
      kind:'sidewalk',
      points:strip(g.points,g.forwardWalk.inner,g.forwardWalk.outer),
      z:.18
    });
    if(g.backwardWalk)out.push({
      id:link.id+':backward-walk',
      kind:'sidewalk',
      points:strip(g.points,g.backwardWalk.inner,g.backwardWalk.outer),
      z:.18
    });
  }
  return out.filter(surface=>surface.points.length>=4&&surface.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
}
