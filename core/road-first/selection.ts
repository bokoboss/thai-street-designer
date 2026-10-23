// Selecting several roads in /design: box selection, bounds for "zoom to selection", and which actions apply.
import {resolveAlignment} from '../common/resolved-alignment';
import type {WorldPoint} from '../network/network-project';
import type {Road} from './derive';
import {endJoins} from './join';

export type Box={x0:number;y0:number;x1:number;y1:number};
const norm=(b:Box):Box=>({x0:Math.min(b.x0,b.x1),y0:Math.min(b.y0,b.y1),x1:Math.max(b.x0,b.x1),y1:Math.max(b.y0,b.y1)});
const inside=(p:WorldPoint,b:Box)=>p.x>=b.x0&&p.x<=b.x1&&p.y>=b.y0&&p.y<=b.y1;
/** Segment meets an axis-aligned box (Liang–Barsky clipping). */
function segmentHits(a:WorldPoint,c:WorldPoint,b:Box){
  let t0=0,t1=1;const dx=c.x-a.x,dy=c.y-a.y;
  for(const [p,q] of [[-dx,a.x-b.x0],[dx,b.x1-a.x],[-dy,a.y-b.y0],[dy,b.y1-a.y]] as const){
    if(Math.abs(p)<1e-12){if(q<0)return false;continue;}
    const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}
  }
  return true;
}
/** Drawn road path (arcs as on the plan). */
const path=(r:Road)=>resolveAlignment(r.points,r.alignment??'chord').sample(0,Infinity,.05);
/** Roads touched by the box: any part of the drawn road inside it. */
export function roadsInBox(roads:Road[],box:Box):string[]{
  const b=norm(box);
  return roads.filter(r=>{const ps=path(r);return ps.some(p=>inside(p,b))||ps.some((p,i)=>i>0&&segmentHits(ps[i-1],p,b));}).map(r=>r.id);
}
/** Bounds of the selected roads (for zooming to them). */
export function selectionBounds(roads:Road[],ids:string[]):Box|null{
  const ps=roads.filter(r=>ids.includes(r.id)).flatMap(path);if(!ps.length)return null;
  return{x0:Math.min(...ps.map(p=>p.x)),y0:Math.min(...ps.map(p=>p.y)),x1:Math.max(...ps.map(p=>p.x)),y1:Math.max(...ps.map(p=>p.y))};
}
/** Two selected roads whose ends meet can be joined into one. */
export function joinablePair(roads:Road[],ids:string[]):[string,string]|null{
  if(ids.length!==2)return null;
  return endJoins(roads).some(j=>ids.includes(j.a)&&ids.includes(j.b))?[ids[0],ids[1]]:null;
}
/** Toggle a road in a selection (Shift+click / multi-select mode). */
export const toggleId=(ids:string[],id:string)=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
