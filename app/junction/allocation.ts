import {sectionFor,pocketsFor,pocketLaneWidth,type Arm,type Direction,type Pocket} from './model';

export type AllocationMode='auto'|'median'|'retain'|'widen'|'reallocate'|'legacy-preserve';
export type TreatmentOriginKey=Direction|'incomingLeft'|'incomingRight'|'outgoingLeft'|'outgoingRight';
export type TreatmentOrigins=number|Partial<Record<TreatmentOriginKey,number>>;
export type FeatureAllocation={requested:number;medianUsed:number;reallocated:number;widening:number;start:number;end:number;mode:AllocationMode};

export const originFor=(origins:TreatmentOrigins,dir:Direction)=>typeof origins==='number'?origins:(origins[dir]??0);
const treatmentOriginKey=(dir:Direction,side:'left'|'right')=>`${dir}${side==='left'?'Left':'Right'}` as TreatmentOriginKey;
export const pocketOriginFor=(origins:TreatmentOrigins,dir:Direction,side:'left'|'right')=>{
  if(typeof origins==='number')return origins;
  const key=treatmentOriginKey(dir,side);
  return origins[key]??origins[dir]??0;
};
export const pocketFactor=(p:{length:number;taper:number},x:number,origin:number)=>{
  const t=Math.max(0,Math.min(1,(x-origin-p.length)/p.taper));
  return 1-t*t*(3-2*t);
};
export const pocketFactorAt=(p:{length:number;taper:number},x:number,origins:TreatmentOrigins,dir:Direction,side:'left'|'right')=>{
  const origin=pocketOriginFor(origins,dir,side);
  const custom=typeof origins!=='number'&&Object.prototype.hasOwnProperty.call(origins,treatmentOriginKey(dir,side));
  if(custom&&x<origin-1e-8)return 0;
  return pocketFactor(p,x,origin);
};
export const allocationMode=(a:Arm,p:Pocket):AllocationMode=>p.allocation??(
  a.corridorMode==='preserve'?'legacy-preserve':
  a.corridorMode==='widen'?'widen':'auto'
);
export const reserveWidth=(a:Arm,dir:Direction)=>sectionFor(a,dir).bands
  .filter(b=>b.type==='shoulder'||b.type==='buffer')
  .reduce((s,b)=>s+b.width,0);

/**
 * Shared cross-section allocation.
 *
 * Auto behavior is intentionally geometry-first:
 * - curb-side auxiliary lanes widen outward;
 * - median-side auxiliary lanes consume the available median first;
 * - only the actual deficit widens outward.
 *
 * A retained median width is NEVER hidden in Auto. It is applied only through
 * the explicit per-pocket "retain" mode. This keeps engineering advice separate
 * from geometry generation.
 */
export function allocate(a:Arm,x=0,origins:TreatmentOrigins=0){
  const directions=['incoming','outgoing'] as const;
  const result={} as Record<Direction,Record<'left'|'right',FeatureAllocation>>;
  let demand=0,legacyDemand=0,target=0;

  for(const dir of directions){
    result[dir]={} as Record<'left'|'right',FeatureAllocation>;
    for(const side of ['left','right'] as const){
      const origin=pocketOriginFor(origins,dir,side),p=pocketsFor(a,dir)[side],mode=allocationMode(a,p);
      const requested=pocketLaneWidth(a,dir,side)*p.lanes*pocketFactorAt(p,x,origins,dir,side);
      result[dir][side]={
        requested,medianUsed:0,reallocated:0,widening:requested,
        start:origin,end:origin+p.length+p.taper,mode
      };
      if(side==='right'&&requested&&['auto','median','retain','legacy-preserve'].includes(mode)){
        if(mode==='legacy-preserve')legacyDemand+=requested;
        else {
          demand+=requested;
          if(mode==='retain')target=Math.max(target,p.retainedMedian??0);
        }
      }
    }
  }

  const available=Math.max(0,a.median-target-legacyDemand);
  for(const dir of directions){
    for(const side of ['left','right'] as const){
      const f=result[dir][side];
      if(side==='right'&&['auto','median','retain','legacy-preserve'].includes(f.mode)){
        f.medianUsed=f.mode==='legacy-preserve'
          ?f.requested
          :Math.min(f.requested,available*f.requested/(demand||1));
      }
      if(side==='left'&&['reallocate','legacy-preserve'].includes(f.mode)){
        f.reallocated=Math.min(f.requested,reserveWidth(a,dir));
      }
      f.widening=Math.max(0,f.requested-f.medianUsed-f.reallocated);
    }
  }

  const medianUsed=directions.reduce((s,d)=>s+result[d].right.medianUsed,0);
  const outward=directions.map(d=>result[d].left.widening+result[d].right.widening);
  return {
    features:result,
    medianUsed,
    residual:Math.max(0,a.median-medianUsed),
    incomingMovement:outward[0],
    outgoingMovement:outward[1],
    widening:outward[0]+outward[1],
    retainedTarget:target
  };
}
