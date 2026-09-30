import type {Design} from './model';
import {sectionFor} from './model';
import {
  activeIds,approachSamples,armIslands,armMouth,armTreatmentOrigins,armTurn,edges,rotate,type P
} from './geometry';
import {resolvedBandEdge} from './lane-configuration';
import {slipGeometries} from './slip-geometry';

export type JunctionSceneSurfaceKind='road'|'median'|'bike'|'motorcycle'|'shoulder'|'buffer'|'sidewalk';
export type JunctionSceneSurface={
  id:string;
  kind:JunctionSceneSurfaceKind;
  points:P[];
  z:number;
};

const finitePolygon=(points:P[])=>points.length>=3&&points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
const bandKind=(type:string):JunctionSceneSurfaceKind=>
  type==='bike'||type==='motorcycle'||type==='shoulder'||type==='buffer'?type:'shoulder';

export function resolveJunctionSceneSurfaces(d:Design):JunctionSceneSurface[]{
  const out:JunctionSceneSurface[]=[],edgeSet=edges(d),slips=slipGeometries(d,edgeSet);
  const push=(id:string,kind:JunctionSceneSurfaceKind,points:P[],z:number)=>{
    if(finitePolygon(points))out.push({id,kind,points,z});
  };
  const orient=(points:P[],armId:number)=>points.map(p=>rotate(p,armTurn(d,armId)));

  // edges() is authoritative for the base Junction footprint. Its perimeter is also
  // the same footprint guarded by designError(), so 3D does not invent a second core.
  push('main-pavement','road',edgeSet.flatMap(edge=>orient(edge.outer,edge.i)),.03);

  // The same outer/walk edge pair used by the 2D Junction renderer becomes the
  // raised sidewalk strip in 3D, including the corner between adjacent Arms.
  for(const edge of edgeSet){
    const roadEdge=orient(edge.outer,edge.i),walkEdge=orient(edge.walk,edge.i).reverse();
    push(`sidewalk:${edge.i}:${edge.next}`,'sidewalk',[...roadEdge,...walkEdge],.18);
  }

  // Complete-Streets bands are resolved per Arm from the same allocation/slip-aware
  // band edge functions consumed by section and drawing logic.
  for(const armId of activeIds(d)){
    const arm=d.arms[armId],origins=armTreatmentOrigins(d,armId,edgeSet),
      start=Math.min(arm.length,Math.max(armMouth(d,armId)+8,origins.incoming,origins.outgoing)),
      xs=approachSamples(arm,origins,start,arm.length);
    for(const direction of ['incoming','outgoing'] as const){
      sectionFor(arm,direction).bands.forEach((band,index)=>{
        const inner=xs.map(x=>({x,y:resolvedBandEdge(d,armId,direction,x,index,0,edgeSet,slips)})),
          outer=xs.slice().reverse().map(x=>({x,y:resolvedBandEdge(d,armId,direction,x,index,1,edgeSet,slips)}));
        push(`band:${armId}:${direction}:${band.id}`,bandKind(band.type),orient([...inner,...outer],armId),.055);
      });
    }
  }

  for(const armId of activeIds(d)){
    armIslands(d,armId,edgeSet).forEach((polygon,index)=>
      push(`island:${armId}:${index}`,'median',orient(polygon,armId),.20)
    );
  }
  if(d.type==='roundabout'){
    push('roundabout-island','median',Array.from({length:80},(_,i)=>({
      x:d.radius*Math.cos(i/80*Math.PI*2),y:d.radius*Math.sin(i/80*Math.PI*2)
    })),.25);
  }

  // Slip v6 owns its overlay geometry. Network 3D consumes those polygons directly;
  // no Arm pocket or base-edge mutation is introduced here.
  for(const slip of slips){
    const put=(suffix:string,kind:JunctionSceneSurfaceKind,points:P[],z:number)=>
      push(`slip:${slip.id}:${suffix}`,kind,orient(points,slip.fromArm),z);
    put('pavement','road',slip.pavement,.035);
    put('approach-pavement','road',slip.approachPavement,.036);
    put('departure-pavement','road',slip.departurePavement,.036);
    put('sidewalk','sidewalk',slip.sidewalk,.18);
    put('island','median',slip.island,.20);
    put('raised-separator','median',slip.raisedSeparator,.18);
    put('gore','buffer',slip.gore,.055);
  }
  return out;
}
