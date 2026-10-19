// Drawing aids for Draw Road (roadmap Phase 3 slice 3; docs/research/2026-10-UX-RESEARCH.md).
// A snap only chooses a coordinate; junctions come from roads crossing after the edit.
// Priority: road end > point on a road alignment > angle (15° steps, relative to the previous segment
// and to the plan axes). Distances are in screen pixels so behaviour is the same at every zoom.
import type {WorldPoint} from '../network/network-project';
import type {Road} from './derive';

export type SnapKind='end'|'road'|'angle'|'none';
export type SnapResult={point:WorldPoint;kind:SnapKind;roadId?:string;end?:'start'|'end';angle?:number;length?:number};
export type SnapOptions={pxPerMetre:number;from?:WorldPoint;previousHeading?:number;off?:boolean;endRadiusPx?:number;roadRadiusPx?:number;angleToleranceDeg?:number};

const dist=(a:WorldPoint,b:WorldPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const headingOf=(a:WorldPoint,b:WorldPoint)=>((Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)+360)%360;
const round=(v:number)=>Math.round(v*100)/100;

export function nearestOnSegment(p:WorldPoint,a:WorldPoint,b:WorldPoint){
  const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));
  return{x:a.x+dx*t,y:a.y+dy*t,t};
}

export function snapPoint(cursor:WorldPoint,roads:Road[],o:SnapOptions):SnapResult{
  const measure=(point:WorldPoint):Pick<SnapResult,'angle'|'length'>=>o.from?{angle:round(headingOf(o.from,point)),length:round(dist(o.from,point))}:{};
  if(o.off)return{point:cursor,kind:'none',...measure(cursor)};
  const endR=(o.endRadiusPx??14)/o.pxPerMetre,roadR=(o.roadRadiusPx??9)/o.pxPerMetre;
  let best:SnapResult|null=null,gap=Infinity;
  for(const r of roads)for(const [end,p] of [['start',r.points[0]],['end',r.points.at(-1)!]] as const){
    const d=dist(cursor,p);if(d<=endR&&d<gap){gap=d;best={point:{x:p.x,y:p.y},kind:'end',roadId:r.id,end};}
  }
  if(best)return{...best,...measure(best.point)};
  for(const r of roads)for(let i=1;i<r.points.length;i++){
    const q=nearestOnSegment(cursor,r.points[i-1],r.points[i]),d=dist(cursor,q);
    if(d<=roadR&&d<gap){gap=d;best={point:{x:round(q.x),y:round(q.y)},kind:'road',roadId:r.id};}
  }
  if(best)return{...best,...measure(best.point)};
  if(o.from){
    const raw=headingOf(o.from,cursor),len=dist(o.from,cursor),tol=o.angleToleranceDeg??4;
    // Candidate directions: every 15° from the plan axes, and square/straight to the previous segment.
    const bases=[0,...(o.previousHeading!==undefined?[o.previousHeading]:[])];
    let pick:number|null=null,off=tol;
    for(const base of bases)for(let k=0;k<24;k++){
      const h=(base+k*15)%360,diff=Math.abs(((raw-h+540)%360)-180);
      if(diff<=off){off=diff;pick=h;}
    }
    if(pick!==null&&len>0){
      const rad=pick*Math.PI/180,point={x:round(o.from.x+Math.cos(rad)*len),y:round(o.from.y+Math.sin(rad)*len)};
      return{point,kind:'angle',angle:round(pick),length:round(len)};
    }
  }
  return{point:cursor,kind:'none',...measure(cursor)};
}

/** Point at an exact typed length from `from`, in the direction of `toward` (typed length while drawing). */
export function pointAtLength(from:WorldPoint,toward:WorldPoint,length:number):WorldPoint{
  const d=dist(from,toward)||1;
  return{x:round(from.x+(toward.x-from.x)/d*length),y:round(from.y+(toward.y-from.y)/d*length)};
}
