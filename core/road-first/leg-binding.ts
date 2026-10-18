// Junction treatments stored against a road leg (ADR-0002, limit L5).
// A leg is one side of a road at a junction: `roadId:ahead` follows the road's
// drawing direction away from the junction, `roadId:behind` points back along it.
// Arm slots are re-derived on every compile, so nothing user-edited is keyed by slot.
import {markingsFor,type Arm} from '../junction/model';
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
  'dividerMode','solidLength','outgoingDividerMode','outgoingSolidLength','corridorMode',
] as const satisfies readonly (keyof Arm)[];
export type LegField=typeof LEG_FIELDS[number];
export type LegTreatment=Partial<Pick<Arm,LegField>>;

/** Arm values that come from the road; editing them on a junction is a road edit. */
export const ROAD_FIELDS=['incoming','outgoing','width','median','walk','bands','incomingSection','outgoingSection','angle','length','name'] as const satisfies readonly (keyof Arm)[];

export type LegSlip={from:LegKey;to?:LegKey;width?:number;radius?:number}&Partial<Pick<SlipLane,'approach'|'departure'|'crossing'|'arrowOffset'>>;

/** Apply a leg's stored settings to a freshly derived arm; lane-indexed settings follow the road's lane counts. */
export function applyLegTreatment(arm:Arm,t:LegTreatment|undefined):Arm{
  if(!t)return arm;
  const next:Arm={...arm,...structuredClone(t)};
  if(!next.incoming){next.crossing=false;next.signal=false;next.stop=false;}
  next.laneMarkings=markingsFor(next);
  next.arrowOverrides=normalizeArrowOverrides(next);
  return next;
}
