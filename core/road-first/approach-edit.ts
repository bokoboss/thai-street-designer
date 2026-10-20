// Junction detail in place (roadmap Phase 3 slice 4): an approach is one road leg at a junction.
// These helpers turn approach edits (turn pockets, Slip lane, corner radius) into the existing
// leg.setTreatment / slip.set / junction.setCorner commands, and place the plan handles that edit
// the same values as the inspector fields. Default sizes are tool starting values, not standards.
import {emptyPockets,type Arm,type Pocket,type Pockets} from '../junction/model';
import {activeIds,angleGap,armTreatmentOrigins,bounds,cornerArc} from '../junction/geometry';
import {pocketOriginFor} from '../junction/allocation';
import {defaultSlip,nextActiveArm,type SlipLane} from '../junction/slip-model';
import {portHeading,type JunctionInstance,type WorldPoint} from '../network/network-project';
import type {CompileResult} from './derive';
import {legKey,parseLegKey,type LegKey,type LegSlip,type LegTreatment} from './leg-binding';

export type PocketSide='left'|'right';
export type ApproachInfo={candidateId:string;junction:JunctionInstance;armId:number;leg:LegKey;arm:Arm;slip?:SlipLane;slipTo?:LegKey};

/** The compiled junction and arm behind an approach (candidate + road leg); null when the leg is not on that junction. */
export function approachInfo(compiled:CompileResult,candidateId:string,leg:LegKey):ApproachInfo|null{
  const jid=Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===candidateId);
  const junction=compiled.project.junctions.find(j=>j.id===jid),l=parseLegKey(leg);
  const binding=l&&compiled.legs.find(b=>b.junctionId===jid&&b.roadId===l.roadId&&b.side===l.side);
  if(!junction||!binding)return null;
  const armId=binding.armId,to=nextActiveArm(junction.design,armId),toLeg=compiled.legs.find(b=>b.junctionId===jid&&b.armId===to);
  return{candidateId,junction,armId,leg,arm:junction.design.arms[armId],slip:junction.design.slips.find(s=>s.fromArm===armId),slipTo:toLeg?legKey(toLeg.roadId,toLeg.side):undefined};
}
/** Approach legs of a junction in drawing order. */
export function junctionApproaches(compiled:CompileResult,candidateId:string){
  const jid=Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===candidateId);
  const j=compiled.project.junctions.find(x=>x.id===jid);
  return j?activeIds(j.design).flatMap(armId=>{const b=compiled.legs.find(x=>x.junctionId===jid&&x.armId===armId);return b?[{armId,leg:legKey(b.roadId,b.side),roadId:b.roadId,side:b.side}]:[];}):[];
}

export const incomingPockets=(arm:Arm):Pockets=>structuredClone(arm.incomingPockets??emptyPockets());
/** Treatment patch that adds, changes or (null) removes an approach turn pocket; the other side is kept. */
export function pocketTreatment(arm:Arm,side:PocketSide,patch:Partial<Pocket>|null):LegTreatment{
  const pockets=incomingPockets(arm),fresh=emptyPockets()[side];
  pockets[side]=patch===null?{...fresh,lanes:0}:{...pockets[side],...(pockets[side].lanes?{}:{lanes:1}),...patch};
  return{incomingPockets:pockets};
}
/**
 * A new Slip lane from this approach to the next approach. Starts from the engine's default radius and,
 * when that does not fit the approaches, takes the largest smaller radius that does (fits: engine check).
 */
export function newSlip(info:ApproachInfo,fits:(slip:LegSlip)=>boolean=()=>true):LegSlip|null{
  if(!info.slipTo)return null;
  const s=defaultSlip(info.armId,nextActiveArm(info.junction.design,info.armId)??info.armId);
  const tries=[s.radius,...SLIP_FALLBACK_RADII.filter(r=>r<s.radius)].map(radius=>({from:info.leg,to:info.slipTo,width:s.width,radius}) as LegSlip);
  return tries.find(fits)??tries[0];
}
export const SLIP_FALLBACK_RADII=[25,20,15,12,10];
/** Slip lane as stored on the leg (keeps every current setting, applies the patch). */
export function slipPatch(info:ApproachInfo,patch:Partial<Pick<SlipLane,'width'|'radius'|'approach'>>):LegSlip|null{
  if(!info.slip||!info.slipTo)return null;
  const s={...info.slip,...patch};
  return{from:info.leg,to:info.slipTo,width:s.width,radius:s.radius,approach:structuredClone(s.approach),departure:structuredClone(s.departure),crossing:{...s.crossing},...(s.arrowOffset!==undefined?{arrowOffset:s.arrowOffset}:{})};
}

// ---- Plan handles (world coordinates). A handle and its field edit the same stored value. ----
const toWorld=(j:JunctionInstance,armId:number,p:{x:number;y:number}):WorldPoint=>{
  const h=portHeading(j,armId)*Math.PI/180;
  return{x:+(j.x+p.x*Math.cos(h)-p.y*Math.sin(h)).toFixed(3),y:+(j.y+p.x*Math.sin(h)+p.y*Math.cos(h)).toFixed(3)};
};
const toLocal=(j:JunctionInstance,armId:number,p:WorldPoint)=>{
  const h=portHeading(j,armId)*Math.PI/180,dx=p.x-j.x,dy=p.y-j.y;
  return{x:dx*Math.cos(h)+dy*Math.sin(h),y:-dx*Math.sin(h)+dy*Math.cos(h)};
};
export const CORNER_RANGE=[4,20] as const;

/** Mid-point of the curb arc at a corner between arm i and the next arm, for corner radius r. */
function cornerMid(j:JunctionInstance,i:number,next:number,r:number):WorldPoint|null{
  const d=j.design,g=angleGap(d,i,next)*Math.PI/180;
  if(g>=Math.PI-.08)return null;
  const c=cornerArc(bounds(d.arms[i])[1],bounds(d.arms[next])[0],g,r);
  return toWorld(j,i,c.polar(r,.5));
}
/** One handle per corner (straight-through corners have none); all edit the junction's single corner radius. */
export function cornerHandles(j:JunctionInstance):{corner:number;point:WorldPoint}[]{
  if(j.design.type==='roundabout')return[];
  const ids=activeIds(j.design);
  return ids.flatMap((i,k)=>{const p=cornerMid(j,i,ids[(k+1)%ids.length],j.design.corner);return p?[{corner:k,point:p}]:[];});
}
/** Corner radius whose arc mid-point is nearest the pointer (0.5 m steps within the engine's range). */
export function cornerFromPoint(j:JunctionInstance,corner:number,p:WorldPoint):number{
  const ids=activeIds(j.design),i=ids[corner],next=ids[(corner+1)%ids.length];
  let best=j.design.corner,gap=Infinity;
  for(let r=CORNER_RANGE[0];r<=CORNER_RANGE[1];r+=.5){const q=cornerMid(j,i,next,r);if(!q)continue;const g=Math.hypot(q.x-p.x,q.y-p.y);if(g<gap){gap=g;best=r;}}
  return best;
}

/** End of a turn pocket's full-width storage (where the taper starts), on the pocket lane. */
export function pocketHandle(j:JunctionInstance,armId:number,side:PocketSide):WorldPoint|null{
  const a=j.design.arms[armId],p=a.incomingPockets?.[side];
  if(!p?.lanes)return null;
  const origin=pocketOriginFor(armTreatmentOrigins(j.design,armId),'incoming',side),x=origin+p.length,b=bounds(a,x,armTreatmentOrigins(j.design,armId));
  const width=(p.width??a.incomingSection?.width??a.width)*p.lanes;
  // Incoming lanes lie on the +y side: the right (median-side) pocket next to the median, the left pocket at the outer edge.
  const y=side==='right'?a.median/2+width/2:Math.max(a.median/2+width/2,b[1]-width/2);
  return toWorld(j,armId,{x,y});
}
/**
 * Storage length for a pocket handle dragged to p: distance along the approach from the pocket start, in 1 m steps
 * within the data range. Not limited by the current arm length: the approach stretches along the road when there is room,
 * and the engine rejects a length the road cannot hold.
 */
export function pocketLengthFromPoint(j:JunctionInstance,armId:number,side:PocketSide,p:WorldPoint):number{
  const origin=pocketOriginFor(armTreatmentOrigins(j.design,armId),'incoming',side);
  return Math.max(5,Math.min(140,Math.round(toLocal(j,armId,p).x-origin)));
}
