// Fit-based arm length (ADR-0002, limit L2).
// An arm must be long enough for what it carries — the junction mouth plus a short
// approach, the start of its lane dividers, pockets, median openings and a roundabout
// splitter — instead of a fixed 45 m. The checks mirror designError() in geometry.ts;
// scripts/verify-arm-fit.cjs keeps the two in step.
import {pocketOriginFor} from './allocation';
import {armMouth,armTreatmentOrigins,dividerRange,edges,laneCount,type Edge} from './geometry';
import {pocketsFor,type Design} from './model';
import {outerRadius,roundSettings,roundDefaults} from './roundabout';
import {slipGeometries} from './slip-geometry';

/** Approach kept beyond the junction mouth (m). Tool default, not a standard value. */
export const ARM_MOUTH_CLEARANCE=12;
/** Shortest divider segment kept after its start (m). Tool default. */
export const DIVIDER_MIN_RUN=5;
/** Data bounds for arm length (m). Whether an arm fits is checked against its content. */
export const ARM_LENGTH_MIN=12,ARM_LENGTH_MAX=400;

export type ArmFitKind='mouth'|'divider'|'pocket'|'opening'|'splitter'|'slip';
export type ArmFitItem={kind:ArmFitKind;required:number};

export function armFitItems(d:Design,i:number,boundaries:Edge[]=edges(d)):ArmFitItem[]{
  const a=d.arms[i],mouth=armMouth(d,i),round=d.type==='roundabout',settings=round?roundSettings(d):roundDefaults();
  const origins=armTreatmentOrigins(d,i,boundaries),out:ArmFitItem[]=[{kind:'mouth',required:mouth+ARM_MOUTH_CLEARANCE}];
  for(const side of [1,-1])if(laneCount(a,side)>=2){
    out.push({kind:'divider',required:dividerRange(a,mouth,round,side,settings,origins.outgoing).start+DIVIDER_MIN_RUN});
  }
  for(const dir of ['incoming','outgoing'] as const)for(const side of ['left','right'] as const){
    const p=pocketsFor(a,dir)[side];if(!p.lanes)continue;
    const origin=pocketOriginFor(origins,dir,side);
    out.push({kind:'pocket',required:p.continuation==='corridor'?origin+1:origin+p.length+p.taper+2});
  }
  for(const o of a.medianOpenings??[])out.push({kind:'opening',required:mouth+o.start+o.length+1});
  if(round)out.push({kind:'splitter',required:outerRadius(d)+settings.splitterLength+6});
  // Slip lanes leaving or joining this arm (mirrors slipDesignError in slip-geometry.ts).
  const slips=!round&&d.slips.some(s=>s.fromArm===i||s.toArm===i)?slipGeometries(d,boundaries):[];
  for(const s of d.slips){
    const g=slips.find(x=>x.id===s.id);if(!g||g.entryX<0||g.exitX<0)continue;
    if(s.fromArm===i){
      out.push({kind:'slip',required:g.entryX+6});
      if(s.approach.mode==='auxiliary')out.push({kind:'slip',required:g.entryX+s.approach.storage+s.approach.taper+2});
    }
    if(s.toArm===i){
      out.push({kind:'slip',required:g.exitX+6});
      if(s.departure.mode==='shared-aux')out.push({kind:'slip',required:armMouth(d,i)+s.departure.length+s.departure.taper+2});
      if(s.departure.mode==='acceleration')out.push({kind:'slip',required:g.exitX+s.departure.length+s.departure.merge+2});
    }
  }
  return out;
}

export function requiredArmLength(d:Design,i:number,boundaries?:Edge[]){
  return Math.max(ARM_LENGTH_MIN,...armFitItems(d,i,boundaries).map(v=>v.required));
}

/** Clamp a requested arm length to what the arm needs and the data maximum. */
export function fitArmLength(d:Design,i:number,length:number,boundaries?:Edge[]){
  return Math.min(ARM_LENGTH_MAX,Math.max(requiredArmLength(d,i,boundaries),length));
}

export type DividerShortfall={requested:number;shown:number};
/** Solid dividers keep their configured length; on a short arm only the part up to the arm end is drawn. */
export function dividerFit(d:Design,i:number,boundaries:Edge[]=edges(d)){
  const a=d.arms[i],mouth=armMouth(d,i),round=d.type==='roundabout',settings=round?roundSettings(d):roundDefaults();
  const origins=armTreatmentOrigins(d,i,boundaries),result:{incoming?:DividerShortfall;outgoing?:DividerShortfall}={};
  for(const side of [1,-1]){
    if(laneCount(a,side)<2)continue;
    const r=dividerRange(a,mouth,round,side,settings,origins.outgoing);if(r.mode!=='solid')continue;
    const requested=side===1?(a.solidLength??36):(a.outgoingSolidLength??30),shown=Math.max(0,r.end-r.start);
    if(shown<requested-.01)result[side===1?'incoming':'outgoing']={requested,shown};
  }
  return result;
}
