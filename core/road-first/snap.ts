// Drawing aids for Draw Road (roadmap Phase 3 slice 3; docs/research/2026-10-UX-RESEARCH.md).
// A snap only chooses a coordinate; junctions come from roads crossing after the edit.
// Priority: road end > point on a road alignment > angle (15° steps, relative to the previous segment
// and to the plan axes). Distances are in screen pixels so behaviour is the same at every zoom.
import {resolveAlignment} from '../common/resolved-alignment';
import type {WorldPoint} from '../network/network-project';
import type {Road} from './derive';

export type SnapKind='end'|'road'|'angle'|'guide'|'none';
export type SnapResult={point:WorldPoint;kind:SnapKind;roadId?:string;end?:'start'|'end';angle?:number;length?:number;
  /** Guide line start (the road end an extension runs from). */
  guideFrom?:WorldPoint;
  /** Distance from the point to the reference road (the road last hovered), shown while drawing. */
  refDistance?:number};
/** reference: the road last hovered — parallel / perpendicular guides and the distance readout use it. */
export type SnapOptions={pxPerMetre:number;from?:WorldPoint;previousHeading?:number;off?:boolean;endRadiusPx?:number;roadRadiusPx?:number;angleToleranceDeg?:number;reference?:string};

const dist=(a:WorldPoint,b:WorldPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const headingOf=(a:WorldPoint,b:WorldPoint)=>((Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)+360)%360;
const round=(v:number)=>Math.round(v*100)/100;

export function nearestOnSegment(p:WorldPoint,a:WorldPoint,b:WorldPoint){
  const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));
  return{x:a.x+dx*t,y:a.y+dy*t,t};
}

/** guide: for an angle snap, how the direction was found (straight on / square to the previous segment, or a plan-axis step). */
export type SnapCandidate=SnapResult&{guide?:'straight'|'square'|'axis'|'extension'|'parallel'|'perpendicular'};

/**
 * Every snap target near the cursor, best first: road ends, then points on road alignments (nearest per road), then the
 * angle step, then the free cursor. The first one is what snapPoint returns; Tab cycles through the rest.
 */
export function snapCandidates(cursor:WorldPoint,roads:Road[],o:SnapOptions):SnapCandidate[]{
  const measure=(point:WorldPoint):Pick<SnapResult,'angle'|'length'>=>o.from?{angle:round(headingOf(o.from,point)),length:round(dist(o.from,point))}:{};
  const free:SnapCandidate={point:cursor,kind:'none',...measure(cursor)};
  if(o.off)return[free];
  const endR=(o.endRadiusPx??14)/o.pxPerMetre,roadR=(o.roadRadiusPx??9)/o.pxPerMetre,out:{c:SnapCandidate;d:number;rank:number}[]=[];
  for(const r of roads)for(const [end,p] of [['start',r.points[0]],['end',r.points.at(-1)!]] as const){
    const d=dist(cursor,p);if(d<=endR)out.push({c:{point:{x:p.x,y:p.y},kind:'end',roadId:r.id,end,...measure(p)},d,rank:0});
  }
  for(const r of roads){
    let best:{q:WorldPoint;d:number}|null=null;
    if(r.alignment==='arc'){const f=resolveAlignment(r.points).project(cursor);if(f.distance<=roadR)best={q:f.point,d:f.distance};}
    else for(let i=1;i<r.points.length;i++){const q=nearestOnSegment(cursor,r.points[i-1],r.points[i]),d=dist(cursor,q);if(d<=roadR&&(!best||d<best.d))best={q:{x:round(q.x),y:round(q.y)},d};}
    if(best&&!out.some(x=>x.c.kind==='end'&&dist(x.c.point,best!.q)<1e-6))out.push({c:{point:best.q,kind:'road',roadId:r.id,...measure(best.q)},d:best.d,rank:1});
  }
  // Extension of a road beyond its end: along the end straight (one-shot guide; ends themselves rank first).
  for(const r of roads)for(const end of ['start','end'] as const){
    const p=end==='end'?r.points.at(-1)!:r.points[0],q=end==='end'?r.points.at(-2)!:r.points[1],l=dist(p,q)||1,d={x:(p.x-q.x)/l,y:(p.y-q.y)/l};
    const t=(cursor.x-p.x)*d.x+(cursor.y-p.y)*d.y,perp=Math.abs((cursor.x-p.x)*d.y-(cursor.y-p.y)*d.x);
    if(t>endR&&perp<=roadR)out.push({c:{point:{x:round(p.x+d.x*t),y:round(p.y+d.y*t)},kind:'guide',guide:'extension',roadId:r.id,end,guideFrom:{x:p.x,y:p.y},...measure({x:p.x+d.x*t,y:p.y+d.y*t})},d:perp,rank:1.5});
  }
  if(o.from){
    const raw=headingOf(o.from,cursor),len=dist(o.from,cursor),tol=o.angleToleranceDeg??4;
    // Parallel / perpendicular to the reference road (its direction where the cursor is nearest).
    const ref=o.reference?roads.find(r=>r.id===o.reference):undefined;
    if(ref&&len>0){
      const t=resolveAlignment(ref.points,ref.alignment??'chord').project(cursor).tangent,h0=(Math.atan2(t.y,t.x)*180/Math.PI+360)%360;
      let best:{h:number;diff:number;k:number}|null=null;
      for(let k=0;k<4;k++){const h=(h0+k*90)%360,diff=Math.abs(((raw-h+540)%360)-180);if(diff<=tol&&(!best||diff<best.diff))best={h,diff,k};}
      if(best){const rad=best.h*Math.PI/180,point={x:round(o.from.x+Math.cos(rad)*len),y:round(o.from.y+Math.sin(rad)*len)};
        out.push({c:{point,kind:'guide',guide:best.k%2?'perpendicular':'parallel',roadId:ref.id,angle:round(best.h),length:round(len)},d:best.diff,rank:2});}
    }
    // Candidate directions: every 15° from the plan axes, and square/straight to the previous segment.
    let pick:{h:number;guide:'straight'|'square'|'axis'}|null=null,off=tol;
    const bases:[number,boolean][]=[[0,false],...(o.previousHeading!==undefined?[[o.previousHeading,true] as [number,boolean]]:[])];
    for(const [base,prev] of bases)for(let k=0;k<24;k++){
      const h=(base+k*15)%360,diff=Math.abs(((raw-h+540)%360)-180);
      if(diff<=off){off=diff;pick={h,guide:prev&&k%12===0?'straight':prev&&k%6===0?'square':'axis'};}
    }
    if(pick&&len>0){
      const rad=pick.h*Math.PI/180,point={x:round(o.from.x+Math.cos(rad)*len),y:round(o.from.y+Math.sin(rad)*len)};
      out.push({c:{point,kind:'angle',angle:round(pick.h),length:round(len),guide:pick.guide},d:off,rank:2});
    }
  }
  const list=[...out.sort((a,b)=>a.rank-b.rank||a.d-b.d).map(x=>x.c),free];
  // Temporary distance to the reference road for whichever target is used.
  const ref=o.reference?roads.find(r=>r.id===o.reference):undefined;
  if(!ref)return list;
  const A=resolveAlignment(ref.points,ref.alignment??'chord');
  return list.map(c=>c.roadId===ref.id&&(c.kind==='road'||c.kind==='end')?c:{...c,refDistance:round(A.project(c.point).distance)});
}

export function snapPoint(cursor:WorldPoint,roads:Road[],o:SnapOptions):SnapResult{
  return snapCandidates(cursor,roads,o)[0];
}

/** Point at an exact typed length from `from`, in the direction of `toward` (typed length while drawing). */
export function pointAtLength(from:WorldPoint,toward:WorldPoint,length:number):WorldPoint{
  const d=dist(from,toward)||1;
  return{x:round(from.x+(toward.x-from.x)/d*length),y:round(from.y+(toward.y-from.y)/d*length)};
}
