import {profiledParallel} from '../common/alignment';
import {linkLevelAt,linkPieces,medianIslandStrips,resolveLinkSectionGeometry,sliceLink} from './network-link-geometry';
import {
  resolveJunctionSceneSurfaces as resolveLocalJunctionSceneSurfaces,
  type JunctionSceneSurfaceKind
} from '../junction/scene-surfaces';
import {furnitureFaces,objectFaces} from '../junction/furniture3d';
import {roadsideDefaults} from '../junction/model';
import {worldJunctionRotation,type JunctionInstance,type NetworkProject,type WorldPoint} from './network-project';

/** structure-walk: service walkway on a bridge or in a trough; barrier: concrete median barrier on a structure. */
export type NetworkSceneSurfaceKind=JunctionSceneSurfaceKind|'structure-walk'|'barrier';
export type NetworkSceneSurface={
  id:string;
  kind:NetworkSceneSurfaceKind;
  points:WorldPoint[];
  /** Height of the surface above its base (curb, island). */
  z:number;
  /** Level of each point (Phase 4A); absent = 0. */
  base?:number[];
};
export type NetworkSceneFace={
  id:string;
  points:{x:number;y:number;z:number}[];
  color:string;
};

const stripLevels=(z:number[])=>z.some(v=>Math.abs(v)>1e-6)?[...z,...[...z].reverse()]:undefined;
const strip=(center:WorldPoint[],inner:number[],outer:number[])=>[
  ...profiledParallel(center,inner),
  ...profiledParallel(center,outer).reverse()
];
const bandKind=(type:string):NetworkSceneSurfaceKind=>
  type==='bike'||type==='motorcycle'||type==='shoulder'||type==='buffer'?type:'shoulder';
const transformPoint=(junction:JunctionInstance,p:WorldPoint)=>{
  const angle=worldJunctionRotation(junction)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  return{x:junction.x+p.x*cos-p.y*sin,y:junction.y+p.x*sin+p.y*cos};
};

export function resolveJunctionSceneSurfaces(project:NetworkProject):NetworkSceneSurface[]{
  return project.junctions.flatMap(junction=>
    resolveLocalJunctionSceneSurfaces(junction.design).map(surface=>({
      id:`${junction.id}:${surface.id}`,
      kind:surface.kind,
      points:surface.points.map(p=>transformPoint(junction,p)),
      z:surface.z,
      ...(junction.z?{base:surface.points.map(()=>junction.z!)}:{})
    }))
  ).filter(surface=>surface.points.length>=3&&surface.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
}

export function resolveJunctionSceneFaces(project:NetworkProject):NetworkSceneFace[]{
  return project.junctions.flatMap(junction=>
    furnitureFaces(junction.design).map((face,index)=>({
      id:`${junction.id}:furniture:${index}`,
      color:face.color,
      points:face.points.map(p=>({...transformPoint(junction,p),z:p.z+(junction.z??0)}))
    }))
  ).filter(face=>face.points.length>=3&&face.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
}

/** Trees and street lights along road links, with the engine's roadside sizes. */
export function resolveRoadLinkSceneFaces(project:NetworkProject):NetworkSceneFace[]{
  const rs=roadsideDefaults();
  return project.links.flatMap(link=>{
    const g=resolveLinkSectionGeometry(project,link);if(!g)return[];
    return g.objects.flatMap((o,k)=>objectFaces({kind:o.kind,x:o.x,y:o.y,angle:o.angle,side:-o.side, /* objectFaces reaches toward -side*local y; link offsets are left of travel */height:o.kind==='tree'?rs.treeHeight:rs.lightHeight,size:o.kind==='tree'?rs.treeSize:rs.lightSize,reach:rs.lightReach})
      .map((face,index)=>({id:`${link.id}:object:${k}:${index}`,color:face.color,points:face.points.map(p=>({...p,z:p.z+linkLevelAt(link,o.station)}))})));
  }).filter(face=>face.points.length>=3&&face.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
}

/**
 * Raised road (Phase 4A): deck sides under both edges where a link is above ground, and its lane lines drawn at their level
 * (the flat marking texture lies on the ground, so elevated links are left out of it).
 */
export const ELEVATED=.5;
export type StructureFaceLayer='below'|'deck'|'top';
export type StructureSceneFace=NetworkSceneFace&{layer:StructureFaceLayer};
export type StructureSceneLine={id:string;points:{x:number;y:number;z:number}[];dashed:boolean};
/**
 * Display heights for the structure cues (tool values for the picture, not design standards). The deck depth and the
 * tunnel opening are only used when the project carries no structure depths (older compiled data).
 */
export const STRUCTURE_DISPLAY={deck:1.2,parapet:1.1,tunnelOpening:5};
/**
 * Bridges, troughs and tunnels (Phase 4A). Faces are layered for the painter: 'below' (trough walls, tunnel portals) is drawn
 * before the ground, 'deck' (deck sides) after the ground and 'top' (parapets) after the raised road surface.
 * Links off the ground get their markings as lines at their own level, since the flat marking texture lies at level 0.
 */
export function resolveElevatedLinkScene(project:NetworkProject):{faces:StructureSceneFace[];lines:StructureSceneLine[]}{
  const faces:StructureSceneFace[]=[],lines:StructureSceneLine[]=[],{parapet:PARAPET}=STRUCTURE_DISPLAY,DECK=project.structure?.deckDepth??STRUCTURE_DISPLAY.deck;
  for(const link of project.links){
    const g=resolveLinkSectionGeometry(project,link);if(!g||!g.z.some(v=>Math.abs(v)>ELEVATED))continue;
    const outerL=g.forwardWalk?.outer??g.left,outerR=g.backwardWalk?.outer??g.right.map(v=>-v);
    for(const [k,offsets] of [[0,outerL],[1,outerR]] as const){
      const edge=profiledParallel(g.points,offsets as number[]);
      for(let i=1;i<edge.length;i++){
        const z0=g.z[i-1],z1=g.z[i],p0=edge[i-1],p1=edge[i];
        if(z0>ELEVATED||z1>ELEVATED){
          faces.push({id:`${link.id}:deck:${k}:${i}`,layer:'deck',color:'#8d999e',points:[{...p0,z:z0+.03},{...p1,z:z1+.03},{...p1,z:Math.max(0,z1-DECK)},{...p0,z:Math.max(0,z0-DECK)}]});
          faces.push({id:`${link.id}:parapet:${k}:${i}`,layer:'top',color:'#c3cbcf',points:[{...p0,z:z0+.18},{...p1,z:z1+.18},{...p1,z:z1+PARAPET},{...p0,z:z0+PARAPET}]});
        }
        if(z0<-ELEVATED||z1<-ELEVATED)
          faces.push({id:`${link.id}:wall:${k}:${i}`,layer:'below',color:'#a3adb1',points:[{...p0,z:Math.min(0,z0)},{...p1,z:Math.min(0,z1)},{...p1,z:Math.max(Math.min(0,z1),.25)},{...p0,z:Math.max(Math.min(0,z0),.25)}]});
      }
    }
    const at=(offsets:number[])=>profiledParallel(g.points,offsets).map((p,i)=>({...p,z:g.z[i]+.05}));
    lines.push({id:`${link.id}:edge-l`,points:at(g.left),dashed:false},{id:`${link.id}:edge-r`,points:at(g.right.map(v=>-v)),dashed:false});
    // Lane dividers from the section at each station (same counts and widths as the plan).
    const count=(side:1|-1,i:number)=>Math.round(((side===1?g.left[i]:g.right[i])-g.medianHalf[i])/((side===1?g.forwardLaneWidth[i]:g.backwardLaneWidth[i])||1));
    for(const side of [1,-1] as const){
      const n=Math.max(0,...g.points.map((_,i)=>count(side,i)));
      for(let k=1;k<n;k++)lines.push({id:`${link.id}:lane:${side}:${k}`,dashed:true,points:at(g.points.map((_,i)=>side*(g.medianHalf[i]+k*(side===1?g.forwardLaneWidth[i]:g.backwardLaneWidth[i]))))});
    }
  }
  // Tunnel portals: the opening (dark) and the headwall above it up to the ground.
  for(const c of project.crossings??[]){
    const t=c.tunnel;if(!t||c.relation!=='over')continue;
    const dx=t.b.x-t.a.x,dy=t.b.y-t.a.y,l=Math.hypot(dx,dy)||1,nx=-dy/l*t.half,ny=dx/l*t.half;
    for(const [k,q] of [[0,t.a],[1,t.b]] as const){
      // The opening runs from the road at the portal up to the roof underside (same value as the measured clearance).
      const floor=(k===0?t.za:t.zb)??t.z,top=Math.min(0,t.soffit??t.z+STRUCTURE_DISPLAY.tunnelOpening);
      const L={x:q.x+nx,y:q.y+ny},R={x:q.x-nx,y:q.y-ny};
      if(top>floor+.05)faces.push({id:`${c.id}:portal:${k}`,layer:'below',color:'#2c3438',points:[{...L,z:floor},{...R,z:floor},{...R,z:top},{...L,z:top}]});
      if(top<-.05)faces.push({id:`${c.id}:headwall:${k}`,layer:'below',color:'#b4bdc1',points:[{...L,z:top},{...R,z:top},{...R,z:.2},{...L,z:.2}]});
    }
  }
  return{faces,lines};
}

export function resolveRoadLinkSceneSurfaces(project:NetworkProject):NetworkSceneSurface[]{
  const out:NetworkSceneSurface[]=[];
  // Ramp tapers (Phase 4B) under the road surfaces, at the main road level.
  for(const t of project.rampTapers??[])out.push({id:`taper:${t.id}`,kind:'road',points:t.points,z:.025,base:t.points.map(()=>t.z)});
  for(const link of project.links){
    const g=resolveLinkSectionGeometry(project,link);
    if(!g||g.points.length<2)continue;
    out.push({
      id:link.id+':road',
      kind:'road',
      points:strip(g.points,g.right.map(v=>-v),g.left),
      z:.03,base:stripLevels(g.z)
    });
    // On a bridge or in a trough the road keeps its widths but not its at-grade finish (Phase 4A, owner 2026-10-21):
    // sidewalks become service walkways, the planted median a concrete barrier.
    if(g.structures.length){
      const pieces=linkPieces(g),islands=(()=>{const o:{start:number;end:number}[]=[];let f=0;for(const x of g.openings){if(x.start>f+.01)o.push({start:f,end:x.start});f=Math.max(f,x.end);}if(g.total>f+.01)o.push({start:f,end:g.total});return o;})();
      pieces.forEach((p,k)=>{
        const onStructure=p.kind!=='ground';
        if(g.medianHalf.some(v=>v>.01))for(const [m,isl] of islands.entries()){
          const a=Math.max(p.start,isl.start),b=Math.min(p.end,isl.end);if(b-a<.01)continue;
          const sl=sliceLink(g,a,b,[g.medianHalf,g.z]),[half,z]=sl.series;
          out.push({id:`${link.id}:median:${k}:${m}`,kind:onStructure?'barrier':'median',points:strip(sl.points,half.map(v=>-v),half),z:onStructure?.12:.16,base:stripLevels(z)});
        }
        for(const [side,walk] of [['forward',g.forwardWalk],['backward',g.backwardWalk]] as const){
          if(!walk)continue;
          const sl=sliceLink(g,p.start,p.end,[walk.inner,walk.outer,g.z]),[inner,outer,z]=sl.series;
          out.push({id:`${link.id}:${side}-walk:${k}`,kind:onStructure?'structure-walk':'sidewalk',points:strip(sl.points,inner,outer),z:.18,base:stripLevels(z)});
        }
      });
    }
    // Median island pieces (a mid-block opening cuts the island; one piece keeps the original id).
    if(!g.structures.length)medianIslandStrips(g).forEach((m,i)=>out.push({
      id:i?`${link.id}:median:${i}`:link.id+':median',
      kind:'median',
      points:strip(m.points,m.half.map(v=>-v),m.half),
      z:.16,base:stripLevels(m.z)
    }));
    g.forwardBands.forEach((band,index)=>out.push({
      id:`${link.id}:forward-band:${index}`,
      kind:bandKind(band.type),
      points:strip(g.points,band.inner,band.outer),
      z:band.type==='buffer'?.07:.06,base:stripLevels(g.z)
    }));
    g.backwardBands.forEach((band,index)=>out.push({
      id:`${link.id}:backward-band:${index}`,
      kind:bandKind(band.type),
      points:strip(g.points,band.inner,band.outer),
      z:band.type==='buffer'?.07:.06,base:stripLevels(g.z)
    }));
    if(g.forwardWalk&&!g.structures.length)out.push({
      id:link.id+':forward-walk',
      kind:'sidewalk',
      points:strip(g.points,g.forwardWalk.inner,g.forwardWalk.outer),
      z:.18,base:stripLevels(g.z)
    });
    if(g.backwardWalk&&!g.structures.length)out.push({
      id:link.id+':backward-walk',
      kind:'sidewalk',
      points:strip(g.points,g.backwardWalk.inner,g.backwardWalk.outer),
      z:.18,base:stripLevels(g.z)
    });
  }
  return out.filter(surface=>surface.points.length>=4&&surface.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
}

export function resolveNetworkSceneSurfaces(project:NetworkProject){
  return [...resolveJunctionSceneSurfaces(project),...resolveRoadLinkSceneSurfaces(project)];
}
