import {
  type Arm,type Design,type Direction,type LaneRole,type LaneArrowCode,type LaneArrowPlacement,
  laneArrowFor,pocketsFor,pocketLaneWidth,sectionFor
} from './model';
import {originFor,pocketOriginFor,pocketFactorAt} from './allocation';
import {
  type Edge,edges,armTreatmentOrigins,armMouth,coreSize,crossingIntervals,
  laneY,innerEdge
} from './geometry';
import {roundSettings} from './roundabout';

export type ResolvedLaneArrow={
  id:string;
  arm:number;
  direction:Direction;
  role:LaneRole;
  laneIndex:number;
  code:LaneArrowCode;
  offset:number;
  x:number;
  y:number;
  angle:number;
  mergeSide:-1|1;
  manual:boolean;
  minOffset:number;
  maxOffset:number;
};

export const laneArrowKey=(direction:Direction,role:LaneRole,laneIndex:number)=>`${direction}:${role}:${laneIndex}`;

export function laneExists(a:Arm,direction:Direction,role:LaneRole,laneIndex:number){
  if(laneIndex<0)return false;
  if(role==='main')return laneIndex<a[direction];
  const side=role==='aux-left'?'left':'right';
  return laneIndex<pocketsFor(a,direction)[side].lanes;
}

export function activeArrowLaneKeys(a:Arm){
  const keys:string[]=[];
  for(const direction of ['incoming','outgoing'] as const){
    for(let i=0;i<a[direction];i++)keys.push(laneArrowKey(direction,'main',i));
    const pockets=pocketsFor(a,direction);
    for(let i=0;i<pockets.left.lanes;i++)keys.push(laneArrowKey(direction,'aux-left',i));
    for(let i=0;i<pockets.right.lanes;i++)keys.push(laneArrowKey(direction,'aux-right',i));
  }
  return keys;
}

export function normalizeArrowOverrides(a:Arm){
  if(!a.arrowOverrides)return undefined;
  const valid=new Set(activeArrowLaneKeys(a));
  const kept=Object.fromEntries(Object.entries(a.arrowOverrides).filter(([key])=>valid.has(key)));
  return Object.keys(kept).length?kept:undefined;
}

function laneRange(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,edgeSet:Edge[]){
  const a=d.arms[armId],origins=armTreatmentOrigins(d,armId,edgeSet),baseOrigin=originFor(origins,direction),mouth=armMouth(d,armId),
    side=role==='aux-left'?'left':role==='aux-right'?'right':null,origin=side?pocketOriginFor(origins,direction,side):baseOrigin;
  let minX=origin+3,maxX=a.length-3;
  if(side){
    const p=pocketsFor(a,direction)[side];
    maxX=Math.min(maxX,origin+p.length-2);
  }
  if(direction==='outgoing'&&a.crossing)minX=Math.max(minX,mouth+a.crossOffset+3.2+2);
  return {origin,minX,maxX,minOffset:Math.max(0,minX-origin),maxOffset:Math.max(0,maxX-origin),origins};
}

function laneYAt(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,x:number,edgeSet:Edge[]){
  const a=d.arms[armId],{origin,origins}=laneRange(d,armId,direction,role,laneIndex,edgeSet),side=direction==='incoming'?1:-1;
  if(role==='main')return laneY(a,side,laneIndex,x,origins);
  const section=sectionFor(a,direction),pockets=pocketsFor(a,direction),right=pockets.right,rightWidth=pocketLaneWidth(a,direction,'right');
  const which=role==='aux-left'?'left':'right',p=pockets[which],w=pocketLaneWidth(a,direction,which),factor=pocketFactorAt(p,x,origins,direction,which);
  return innerEdge(a,side,x,origins)+side*(
    which==='right'
      ?w*(laneIndex+.5)*factor
      :rightWidth*right.lanes*pocketFactorAt(right,x,origins,direction,'right')+section.width*a[direction]+w*(laneIndex+.5)*factor
  );
}

function resolveAt(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,p:LaneArrowPlacement,manual:boolean,edgeSet:Edge[]):ResolvedLaneArrow|null{
  const a=d.arms[armId];
  if(!laneExists(a,direction,role,laneIndex)||p.code==='none')return null;
  const range=laneRange(d,armId,direction,role,laneIndex,edgeSet);
  if(range.maxX<range.minX)return null;
  const offset=Math.max(range.minOffset,Math.min(range.maxOffset,p.offset)),x=range.origin+offset;
  return {
    id:p.id,arm:armId,direction,role,laneIndex,code:p.code,offset,x,
    y:laneYAt(d,armId,direction,role,laneIndex,x,edgeSet),
    angle:direction==='incoming'?180:0,
    mergeSide:role==='aux-left'?-1:1,
    manual,minOffset:range.minOffset,maxOffset:range.maxOffset
  };
}

export function autoLaneArrowPlacements(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,edgeSet=edges(d)):LaneArrowPlacement[]{
  const a=d.arms[armId];
  if(!laneExists(a,direction,role,laneIndex))return [];
  const range=laneRange(d,armId,direction,role,laneIndex,edgeSet),code=laneArrowFor(a,direction,role,laneIndex);
  if(code==='none'||range.maxX<range.minX)return [];
  const positions:number[]=[];
  if(role==='main'&&direction==='incoming'){
    const cross=crossingIntervals(a,armMouth(d,armId),d.type==='roundabout',roundSettings(d));
    const first=Math.max(coreSize(d)+29,range.origin+8,a.crossing?cross.x+12:0),second=a.length-8;
    for(const x of [first,second])if(x>=range.minX&&x<=range.maxX&&(positions.length===0||x-positions[0]>12))positions.push(x);
  }else if(role==='main'){
    const x=Math.max(range.origin+8,a.length-12);
    if(x>=range.minX&&x<=range.maxX)positions.push(x);
  }else{
    const side=role==='aux-left'?'left':'right',p=pocketsFor(a,direction)[side];
    const x=direction==='incoming'
      ?range.origin+Math.max(3,Math.min(p.length/2,p.length-3))
      :range.origin+Math.max(3,Math.min(p.length-3,Math.max(3,p.length-7)));
    const safe=Math.max(range.minX,x);
    if(safe<=range.maxX)positions.push(safe);
  }
  return positions.map((x,i)=>({id:`auto-${i+1}`,code,offset:+(x-range.origin).toFixed(3)}));
}

export function manualPlacementsForLane(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,edgeSet=edges(d)){
  const a=d.arms[armId],key=laneArrowKey(direction,role,laneIndex);
  if(a.arrowOverrides&&Object.prototype.hasOwnProperty.call(a.arrowOverrides,key))return a.arrowOverrides[key].map(v=>({...v}));
  return autoLaneArrowPlacements(d,armId,direction,role,laneIndex,edgeSet);
}

export function resolvedLaneArrows(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,edgeSet=edges(d)){
  const a=d.arms[armId],key=laneArrowKey(direction,role,laneIndex),manual=!!a.arrowOverrides&&Object.prototype.hasOwnProperty.call(a.arrowOverrides,key);
  const placements=manual?a.arrowOverrides![key]:autoLaneArrowPlacements(d,armId,direction,role,laneIndex,edgeSet);
  return placements.map(p=>resolveAt(d,armId,direction,role,laneIndex,p,manual,edgeSet)).filter((v):v is ResolvedLaneArrow=>!!v);
}

export function resolvedArrowsForArm(d:Design,armId:number,edgeSet=edges(d)){
  const a=d.arms[armId],out:ResolvedLaneArrow[]=[];
  for(const direction of ['incoming','outgoing'] as const){
    for(let i=0;i<a[direction];i++)out.push(...resolvedLaneArrows(d,armId,direction,'main',i,edgeSet));
    const p=pocketsFor(a,direction);
    for(let i=0;i<p.left.lanes;i++)out.push(...resolvedLaneArrows(d,armId,direction,'aux-left',i,edgeSet));
    for(let i=0;i<p.right.lanes;i++)out.push(...resolvedLaneArrows(d,armId,direction,'aux-right',i,edgeSet));
  }
  return out;
}

export function resolvedArrow(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,id:string,edgeSet=edges(d)){
  return resolvedLaneArrows(d,armId,direction,role,laneIndex,edgeSet).find(v=>v.id===id)??null;
}

export function nextArrowId(list:LaneArrowPlacement[]){
  let n=1;const used=new Set(list.map(v=>v.id));while(used.has(`arrow-${n}`))n++;return `arrow-${n}`;
}

export function clampArrowOffset(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,offset:number,edgeSet=edges(d)){
  const r=laneRange(d,armId,direction,role,laneIndex,edgeSet);
  return Math.max(r.minOffset,Math.min(r.maxOffset,offset));
}

export function arrowOffsetAtX(d:Design,armId:number,direction:Direction,role:LaneRole,laneIndex:number,x:number,edgeSet=edges(d)){
  const r=laneRange(d,armId,direction,role,laneIndex,edgeSet);
  return Math.max(r.minOffset,Math.min(r.maxOffset,x-r.origin));
}
