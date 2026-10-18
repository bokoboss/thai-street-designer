// Junction treatments stored against a road leg (ADR-0002, limit L5).
// A leg is one side of a road at a junction: `roadId:ahead` follows the road's
// drawing direction away from the junction, `roadId:behind` points back along it.
// Arm slots are re-derived on every compile, so nothing user-edited is keyed by slot.
import {markingsFor,type Arm,type Design} from '../junction/model';
import {normalizeArrowOverrides} from '../junction/arrow-layout';
import type {SlipLane} from '../junction/slip-model';

export type LegSide='ahead'|'behind';
export type LegKey=`${string}:${LegSide}`;
export const legKey=(roadId:string,side:LegSide):LegKey=>`${roadId}:${side}`;
export function parseLegKey(key:string){
  const at=key.lastIndexOf(':'),side=key.slice(at+1);
  return at>0&&(side==='ahead'||side==='behind')?{roadId:key.slice(0,at),side:side as LegSide}:null;
}

/** Arm settings owned by the junction (not by the road) and therefore stored per leg. */
export const LEG_FIELDS=[
  'incomingPockets','outgoingPockets','laneMarkings','arrowOverrides','roadside','medianOpenings','medianTrees',
  'crossing','signal','stop','crossOffset','stopOffset','medianOffset',
  'dividerMode','solidLength','outgoingDividerMode','outgoingSolidLength','corridorMode','arrows','residualTarget',
] as const satisfies readonly (keyof Arm)[];
export type LegField=typeof LEG_FIELDS[number];
/** A null value removes the setting from the derived arm (JSON keeps null but drops undefined). */
type Nullable<T>={[K in keyof T]?:T[K]|null};
export type LegTreatment=Nullable<Pick<Arm,LegField>>;

/** Arm values that come from the road; editing them on a junction is a road edit. */
export const ROAD_FIELDS=['incoming','outgoing','width','median','walk','bands','incomingSection','outgoingSection','angle','length','name'] as const satisfies readonly (keyof Arm)[];

/**
 * Approach zone of a leg: the junction-owned straight part of the road next to the junction.
 * Its length and, where the approach differs from the road (a flared or narrowed approach), its section.
 */
export const APPROACH_FIELDS=['length','name','incoming','outgoing','width','median','walk','bands','incomingSection','outgoingSection'] as const satisfies readonly (keyof Arm)[];
export type ApproachField=typeof APPROACH_FIELDS[number];
export type ApproachOverride=Nullable<Pick<Arm,ApproachField>>;

/** Junction-wide settings (type, roundabout size, objects, display). Arms, slips and corner are stored separately. */
export const DESIGN_FIELDS=['type','radius','ring','circulation','roundabout','display','trees','lights','objectSpacing','objectOffset','objectStart','stagger','showNames','showScale','showArrows','title'] as const satisfies readonly (keyof Design)[];
export type DesignSettings=Partial<Pick<Design,typeof DESIGN_FIELDS[number]>>;

function overlay(arm:Arm,o:Record<string,unknown>):Arm{
  const next={...arm} as Record<string,unknown>;
  for(const [k,v] of Object.entries(o))if(v===null)delete next[k];else if(v!==undefined)next[k]=structuredClone(v);
  return next as Arm;
}
export function applyApproach(arm:Arm,o:ApproachOverride|undefined):Arm{
  return o?overlay(arm,o):arm;
}

export type LegSlip={from:LegKey;to?:LegKey;width?:number;radius?:number}&Partial<Pick<SlipLane,'approach'|'departure'|'crossing'|'arrowOffset'>>;

/** Apply a leg's stored settings to a freshly derived arm; lane-indexed settings follow the road's lane counts. */
export function applyLegTreatment(arm:Arm,t:LegTreatment|undefined):Arm{
  if(!t)return arm;
  const next=overlay(arm,t);
  if(!next.incoming){next.crossing=false;next.signal=false;next.stop=false;}
  next.laneMarkings=markingsFor(next);
  next.arrowOverrides=normalizeArrowOverrides(next);
  return next;
}
