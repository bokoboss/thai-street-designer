import {allocate,pocketFactorAt} from './allocation';
import {armTreatmentOrigins,bandWidths,edges,type Edge} from './geometry';
import {
  pocketLaneWidth,pocketsFor,sectionFor,
  type Arm,type Design,type Direction
} from './model';
import {slipGeometries,slipSectionAt} from './slip-geometry';

export type ResolvedLaneKind='main'|'pocket-median'|'aux-curb'|'slip-aux'|'slip-accel'|'separator';
export type ResolvedLane={
  id:string;
  direction:Direction;
  kind:ResolvedLaneKind;
  width:number;
  laneIndex:number;
  source:'arm'|'pocket'|'slip';
  side?:'left'|'right';
  sourceArm?:number;
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
      laneIndex:i,source:'pocket',side:'right'
    });
    if(v)lanes.push(v);
  }
  for(let i=0;i<a[direction];i++)lanes.push({
    id:`${direction}:main:${i}`,direction,kind:'main',width:section.width,
    laneIndex:i,source:'arm'
  });
  for(let i=0;i<p.left.lanes;i++){
    const v=lane({
      id:`${direction}:pocket:left:${i}`,direction,kind:'aux-curb',width:leftWidth,
      laneIndex:i,source:'pocket',side:'left'
    });
    if(v)lanes.push(v);
  }

  for(const piece of slipPieces.filter(v=>v.group===direction)){
    const kind:ResolvedLaneKind=piece.kind==='separator'?'separator':piece.kind==='slip-accel'?'slip-accel':'slip-aux';
    const v=lane({
      id:`${direction}:slip:${piece.sourceArm}:${kind}`,direction,kind,width:piece.width,
      laneIndex:lanes.filter(x=>x.source==='slip').length,source:'slip',sourceArm:piece.sourceArm
    });
    if(v)lanes.push(v);
  }

  const widths=bandWidths(a,direction,x,origins);
  const bands=section.bands.map((b,i)=>({id:b.id,type:b.type,width:widths[i],sourceIndex:i})).filter(b=>b.width>1e-6);
  const trafficWidth=lanes.reduce((sum,v)=>sum+v.width,0),outerWidth=trafficWidth+bands.reduce((sum,v)=>sum+v.width,0)+section.walk;
  return {
    direction,lanes,bands,sidewalk:section.walk,mainLaneCount:a[direction],
    activeLaneCount:lanes.filter(v=>v.kind!=='separator').length,trafficWidth,outerWidth
  };
}

export function resolveStreetSection(d:Design,armId:number,x:number,edgeSet=edges(d)):ResolvedStreetSection{
  const a=d.arms[armId],origins=armTreatmentOrigins(d,armId,edgeSet),allocation=allocate(a,x,origins),
    incoming=resolveDirection(d,armId,'incoming',x,origins,edgeSet),
    outgoing=resolveDirection(d,armId,'outgoing',x,origins,edgeSet),
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

export function junctionLaneCount(d:Design,armId:number,direction:Direction,edgeSet=edges(d)){
  const origins=armTreatmentOrigins(d,armId,edgeSet);
  return resolveStreetSection(d,armId,origins[direction],edgeSet)[direction].activeLaneCount;
}

export function resolvedLaneSummary(section:ResolvedStreetSection){
  const summarize=(v:ResolvedDirection)=>v.lanes.filter(x=>x.kind!=='separator').map(x=>x.kind);
  return {incoming:summarize(section.incoming),outgoing:summarize(section.outgoing)};
}
