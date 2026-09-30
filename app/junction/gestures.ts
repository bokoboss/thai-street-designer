export type Point={x:number;y:number};
export type GestureDelta={dx:number;dy:number;factor:number;before:Point;after:Point;count:number};
export class PointerGesture {
 readonly points=new Map<number,Point>();
 get count(){return this.points.size;}
 down(id:number,p:Point){this.points.set(id,p);}
 up(id:number){this.points.delete(id);}
 clear(){this.points.clear();}
 move(id:number,p:Point):GestureDelta|null{
  if(!this.points.has(id))return null;
  const before=[...this.points.values()].slice(0,2);this.points.set(id,p);const after=[...this.points.values()].slice(0,2);
  const center=(ps:Point[])=>({x:ps.reduce((s,p)=>s+p.x,0)/ps.length,y:ps.reduce((s,p)=>s+p.y,0)/ps.length});
  const b=center(before),a=center(after),distance=(ps:Point[])=>Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);
  const factor=before.length===2&&distance(before)>2?distance(after)/distance(before):1;
  return {dx:a.x-b.x,dy:a.y-b.y,factor,before:b,after:a,count:after.length};
 }
}
export const clampZoom=(n:number,min=.35,max=5)=>Math.max(min,Math.min(max,n));
/** Keep the point below the old gesture center below the new one. */
export function panZoom2D(pan:Point,zoom:number,g:GestureDelta,center:Point,pixels:number,worldSpan=250,minZoom=.35,maxZoom=5){
 const next=clampZoom(zoom*g.factor,minZoom,maxZoom),oldScale=worldSpan/zoom/pixels,newScale=worldSpan/next/pixels;
 return {zoom:next,pan:{x:pan.x+(g.before.x-center.x)*oldScale-(g.after.x-center.x)*newScale,y:pan.y+(g.before.y-center.y)*oldScale-(g.after.y-center.y)*newScale}};
}
