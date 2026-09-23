import {allocate,pocketFactorAt} from './allocation';
import {armTreatmentOrigins,bandWidths,edges,innerEdge,type Edge} from './geometry';
import {
  pocketLaneWidth,pocketsFor,sectionFor,
  laneArrowFor,type Arm,type Design,type Direction,type LaneArrowCode,type LaneRole
} from './model';
import {slipGeometries,slipSectionAt,type SlipGeometry} from './slip-geometry';

export type ResolvedLaneKind='main'|'pocket-median'|'aux-curb'|'slip-aux'|'slip-accel'|'separator';
export type LaneMovement='through'|'left'|'right'|'left-through'|'through-right'|'left-right'|'all'|'right-uturn'|'uturn'|'through-uturn'|'merge'|'none';

const MOVEMENT_BY_ARROW:Record<LaneArrowCode,LaneMovement>={
  straight:'through',left:'left',right:'right',sl:'left-through',sr:'through-right',lr:'left-right',
  all:'all',ru:'right-uturn',uturn:'uturn',su:'through-uturn',merge:'merge',none:'none'
};
const ARROW_BY_MOVEMENT:Record<LaneMovement,LaneArrowCode>={
  through:'straight',left:'left',right:'right','left-through':'sl','through-right':'sr','left-right':'lr',
  all:'all','right-uturn':'ru',uturn:'uturn','through-uturn':'su',merge:'merge',none:'none'
};
export const movementFromArrowCode=(code:LaneArrowCode):LaneMovement=>MOVEMENT_BY_ARROW[code];
export const arrowCodeFromMovement=(movement:LaneMovement):LaneArrowCode=>ARROW_BY_MOVEMENT[movement];

export const configuredLaneMovement=(a:Arm,direction:Direction,role:LaneRole,laneIndex:number)=>
  movementFromArrowCode(laneArrowFor(a,direction,role,laneIndex));
export type ResolvedLane={
  id:string;
  direction:Direction;
  kind:ResolvedLaneKind;
  width:number;
  laneIndex:number;
  source:'arm'|'pocket'|'slip';
  side?:'left'|'right';
  sourceArm?:number;
  movement:LaneMovement;
};
export type ResolvedEdgeZone={
  id:string;
  type:'shoulder'|'bike'|'motorcycle'|'buffer';
  width:number;
  sourceIndex:number;
};
export type ResolvedDirection={
  direction:Direction;
  lanes:ResolvedLane[];
  bands:ResolvedEdgeZone[];
  sidewalk:number;
  mainLaneCount:number;
  activeLaneCount:number;
  trafficWidth:number;
  edgeShift:number;
  outerWidth:number;
};
export type ResolvedStreetSection={
  arm:number;
  x:number;
  origins:{incoming:number;outgoing:number};
  incoming:ResolvedDirection;
  outgoing:ResolvedDirection;
  medianWidth:number;
  conflicts:string[];
  allocation:ReturnType<typeof allocate>;
};

const lane=(v:ResolvedLane)=>v.width>1e-6?v:null;

function resolveDirection(
  d:Design,
  armId:number,
  direction:Direction,
  x:number,
  origins:{incoming:number;outgoing:number},
  edgeSet:Edge[],
  slipPieces=slipSectionAt(d,armId,x,edgeSet,slipGeometries(d,edgeSet))
):ResolvedDirection{
  const a=d.arms[armId],section=sectionFor(a,direction),p=pocketsFor(a,direction),
    rightWidth=pocketLaneWidth(a,direction,'right')*pocketFactorAt(p.right,x,origins,direction,'right'),
    leftWidth=pocketLaneWidth(a,direction,'left')*pocketFactorAt(p.left,x,origins,direction,'left'),
    lanes:ResolvedLane[]=[];

  // Semantic order is always median -> curb. Screen orientation is a consumer concern.
  for(let i=0;i<p.right.lanes;i++){
    const v=lane({
      id:`${direction}:pocket:right:${i}`,direction,kind:'pocket-median',width:rightWidth,
      laneIndex:i,source:'pocket',side:'right',movement:configuredLaneMovement(a,direction,'aux-right',i)
    });
    if(v)lanes.push(v);
  }
  for(let i=0;i<a[direction];i++)lanes.push({
    id:`${direction}:main:${i}`,direction,kind:'main',width:section.width,
    laneIndex:i,source:'arm',movement:configuredLaneMovement(a,direction,'main',i)
  });
  for(let i=0;i<p.left.lanes;i++){
    const v=lane({
      id:`${direction}:pocket:left:${i}`,direction,kind:'aux-curb',width:leftWidth,
      laneIndex:i,source:'pocket',side:'left',movement:configuredLaneMovement(a,direction,'aux-left',i)
    });
    if(v)lanes.push(v);
  }

  for(const piece of slipPieces.filter(v=>v.group===direction)){
    const kind:ResolvedLaneKind=piece.kind==='separator'?'separator':piece.kind==='slip-accel'?'slip-accel':'slip-aux';
    const v=lane({
      id:`${direction}:slip:${piece.sourceArm}:${kind}`,direction,kind,width:piece.width,
      laneIndex:lanes.filter(x=>x.source==='slip').length,source:'slip',sourceArm:piece.sourceArm,
      movement:piece.kind==='slip-accel'?'merge':piece.kind==='separator'?'none':'left'
    });
    if(v)lanes.push(v);
  }

  const widths=bandWidths(a,direction,x,origins);
  const bands=section.bands.map((b,i)=>({id:b.id,type:b.type,width:widths[i],sourceIndex:i})).filter(b=>b.width>1e-6);
  const trafficWidth=lanes.reduce((sum,v)=>sum+v.width,0),
    edgeShift=lanes.filter(v=>v.source==='slip').reduce((sum,v)=>sum+v.width,0),
    outerWidth=trafficWidth+bands.reduce((sum,v)=>sum+v.width,0)+section.walk;
  return {
    direction,lanes,bands,sidewalk:section.walk,mainLaneCount:a[direction],
    activeLaneCount:lanes.filter(v=>v.kind!=='separator').length,trafficWidth,edgeShift,outerWidth
  };
}

export function resolveStreetSection(d:Design,armId:number,x:number,edgeSet=edges(d),geometries:SlipGeometry[]=slipGeometries(d,edgeSet)):ResolvedStreetSection{
  const a=d.arms[armId],origins=armTreatmentOrigins(d,armId,edgeSet),allocation=allocate(a,x,origins),
    slipPieces=slipSectionAt(d,armId,x,edgeSet,geometries),
    incoming=resolveDirection(d,armId,'incoming',x,origins,edgeSet,slipPieces),
    outgoing=resolveDirection(d,armId,'outgoing',x,origins,edgeSet,slipPieces),
    conflicts:string[]=[];

  const source=d.slips.find(s=>s.fromArm===armId);
  if(source?.approach.mode==='auxiliary'&&incoming.bands.length)conflicts.push('slip-approach-edge-zones');
  const receiver=d.slips.find(s=>s.toArm===armId);
  if(receiver?.departure.mode!=='direct'&&outgoing.bands.length)conflicts.push('slip-departure-edge-zones');

  // A generic curb-side auxiliary and a Slip-owned curb-side treatment compete for the same edge.
  if(incoming.lanes.some(v=>v.kind==='aux-curb')&&incoming.lanes.some(v=>v.kind==='slip-aux'))conflicts.push('incoming-curb-treatment-overlap');
  if(outgoing.lanes.some(v=>v.kind==='aux-curb')&&outgoing.lanes.some(v=>v.kind==='slip-aux'||v.kind==='slip-accel'))conflicts.push('outgoing-curb-treatment-overlap');

  return {
    arm:armId,x,origins,incoming,outgoing,
    medianWidth:allocation.residual,conflicts:[...new Set(conflicts)],allocation
  };
}

export type ResolvedBoundary={
  id:string;
  direction:Direction;
  kind:'main-divider'|'pocket-divider';
  first?:number;
  last:number;
  y:(x:number)=>number;
};

export function resolvedLaneBoundaries(d:Design,armId:number,direction:Direction,edgeSet=edges(d)):ResolvedBoundary[]{
  const a=d.arms[armId],origins=armTreatmentOrigins(d,armId,edgeSet),section=sectionFor(a,direction),p=pocketsFor(a,direction),
    side=direction==='incoming'?1:-1,rightWidth=pocketLaneWidth(a,direction,'right'),leftWidth=pocketLaneWidth(a,direction,'left'),
    out:ResolvedBoundary[]=[];
  for(let j=1;j<a[direction];j++)out.push({
    id:`${direction}:main-divider:${j}`,direction,kind:'main-divider',last:a.length,
    y:x=>section.width*j+rightWidth*p.right.lanes*pocketFactorAt(p.right,x,origins,direction,'right')
  });
  for(const which of ['right','left'] as const){
    const pocket=p[which],w=which==='right'?rightWidth:leftWidth,first=origins[direction],last=first+pocket.length+pocket.taper;
    for(let j=0;j<pocket.lanes;j++)out.push({
      id:`${direction}:pocket-divider:${which}:${j}`,direction,kind:'pocket-divider',first,last,
      y:x=>which==='right'
        ?w*(j+1)*pocketFactorAt(pocket,x,origins,direction,which)
        :rightWidth*p.right.lanes*pocketFactorAt(p.right,x,origins,direction,'right')+section.width*a[direction]+w*j*pocketFactorAt(pocket,x,origins,direction,which)
    });
  }
  return out.map(v=>({...v,y:(x:number)=>{
    const offset=v.y(x);
    return innerEdge(a,side,x,origins)+side*Math.abs(offset);
  }}));
}

export type ArrowLaneRef={direction:Direction;role:'main'|'aux-left'|'aux-right';laneIndex:number};

export function configuredArrowLanes(a:Arm,direction?:Direction):ArrowLaneRef[]{
  const out:ArrowLaneRef[]=[];
  for(const dir of direction?[direction]:['incoming','outgoing'] as const){
    for(let i=0;i<a[dir];i++)out.push({direction:dir,role:'main',laneIndex:i});
    const p=pocketsFor(a,dir);
    for(let i=0;i<p.left.lanes;i++)out.push({direction:dir,role:'aux-left',laneIndex:i});
    for(let i=0;i<p.right.lanes;i++)out.push({direction:dir,role:'aux-right',laneIndex:i});
  }
  return out;
}

export function resolvedLaneCenterY(
  d:Design,armId:number,direction:Direction,role:'main'|'aux-left'|'aux-right',laneIndex:number,x:number,edgeSet=edges(d)
){
  const section=resolveStreetSection(d,armId,x,edgeSet)[direction],
    target=section.lanes.find(v=>
      role==='main'?v.source==='arm'&&v.laneIndex===laneIndex:
      v.source==='pocket'&&v.side===(role==='aux-left'?'left':'right')&&v.laneIndex===laneIndex
    );
  if(!target||target.width<=1e-6)return null;
  const a=d.arms[armId],origins=armTreatmentOrigins(d,armId,edgeSet),side=direction==='incoming'?1:-1,
    index=section.lanes.indexOf(target),before=section.lanes.slice(0,index).reduce((sum,v)=>sum+v.width,0);
  return innerEdge(a,side,x,origins)+side*(before+target.width/2);
}

export function resolvedEdgeShift(d:Design,armId:number,direction:Direction,x:number,edgeSet=edges(d),geometries?:SlipGeometry[]){
  return resolveStreetSection(d,armId,x,edgeSet,geometries)[direction].edgeShift;
}

export function resolvedBandEdge(
  d:Design,armId:number,direction:Direction,x:number,bandIndex:number,fraction:number,edgeSet=edges(d),geometries?:SlipGeometry[]
){
  const a=d.arms[armId],origins=armTreatmentOrigins(d,armId,edgeSet),side=direction==='incoming'?1:-1,
    resolved=resolveStreetSection(d,armId,x,edgeSet,geometries)[direction],
    before=resolved.bands.slice(0,bandIndex).reduce((sum,v)=>sum+v.width,0),
    band=resolved.bands[bandIndex],base=innerEdge(a,side,x,origins)+side*(
      resolved.lanes.filter(v=>v.source!=='slip').reduce((sum,v)=>sum+v.width,0)+resolved.edgeShift
    );
  if(!band)return base;
  return base+side*(before+band.width*Math.max(0,Math.min(1,fraction)));
}

export function resolvedSidewalkEdges(d:Design,armId:number,direction:Direction,x:number,edgeSet=edges(d),geometries?:SlipGeometry[]){
  const a=d.arms[armId],origins=armTreatmentOrigins(d,armId,edgeSet),side=direction==='incoming'?1:-1,
    resolved=resolveStreetSection(d,armId,x,edgeSet,geometries)[direction],
    base=innerEdge(a,side,x,origins)+side*(
      resolved.lanes.filter(v=>v.source!=='slip').reduce((sum,v)=>sum+v.width,0)+resolved.edgeShift+
      resolved.bands.reduce((sum,v)=>sum+v.width,0)
    );
  return {inner:base,outer:base+side*resolved.sidewalk};
}

export function junctionLaneCount(d:Design,armId:number,direction:Direction,edgeSet=edges(d),geometries?:SlipGeometry[]){
  const origins=armTreatmentOrigins(d,armId,edgeSet);
  return resolveStreetSection(d,armId,origins[direction],edgeSet,geometries)[direction].activeLaneCount;
}

export function resolvedLaneSummary(section:ResolvedStreetSection){
  const summarize=(v:ResolvedDirection)=>v.lanes.filter(x=>x.kind!=='separator').map(x=>x.kind);
  return {incoming:summarize(section.incoming),outgoing:summarize(section.outgoing)};
}
