// Horizontal curves at road vertices: a circular arc of the requested radius between the two straights, as drawn by
// smoothAlignment (core/common/alignment). The arc must leave part of each straight free, so a radius can be capped;
// these helpers report what is actually drawn so the inspector and handles can say so.
import type {WorldPoint} from '../network/network-project';
import type {RoadPoint} from './derive';

/** Share of the shorter straight an arc may use at one vertex (same value as smoothAlignment). */
const MAX_TANGENT_SHARE=.45;
export const MAX_RADIUS=200;
export type VertexCurve={
  /** Change of direction at the vertex (degrees). */deflection:number;
  requested:number;/** Radius actually drawn. */radius:number;/** Largest radius the two straights allow. */maxRadius:number;
  /** Distance from the vertex to each end of the arc. */tangent:number;
  /** Unit vector from the vertex towards the inside of the bend. */bisector:WorldPoint;
  /** 1 / sin(half interior angle): vertex → arc midpoint distance is radius × (k − 1). */k:number;
};

/** Curve at an inner vertex, or null at a road end or where the road does not bend. */
export function vertexCurve(points:RoadPoint[],i:number):VertexCurve|null{
  if(i<=0||i>=points.length-1)return null;
  const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y);
  if(ab<3||bc<3)return null;
  const u={x:(a.x-b.x)/ab,y:(a.y-b.y)/ab},v={x:(c.x-b.x)/bc,y:(c.y-b.y)/bc},theta=Math.acos(Math.max(-1,Math.min(1,u.x*v.x+u.y*v.y)));
  if(Math.PI-theta<.01||theta<.08)return null;
  const tanHalf=Math.tan(theta/2),maxRadius=Math.max(0,Math.min(ab,bc)*MAX_TANGENT_SHARE*tanHalf),requested=Math.max(0,b.radius??0);
  const radius=requested<.25?0:Math.min(requested,maxRadius),bl=Math.hypot(u.x+v.x,u.y+v.y)||1;
  return{deflection:(Math.PI-theta)*180/Math.PI,requested,radius,maxRadius,tangent:radius/(tanHalf||1),bisector:{x:(u.x+v.x)/bl,y:(u.y+v.y)/bl},k:1/(Math.sin(theta/2)||1)};
}

/** Where the radius handle sits: the arc midpoint (or just inside a sharp corner when there is no arc yet). */
export function curveHandle(points:RoadPoint[],i:number,minOffset:number):WorldPoint|null{
  const c=vertexCurve(points,i);if(!c)return null;
  const d=Math.max(minOffset,c.radius*(c.k-1)),b=points[i];
  return{x:b.x+c.bisector.x*d,y:b.y+c.bisector.y*d};
}

/** Radius from a dragged handle: distance along the bisector, capped by what the straights allow, in 0.5 m steps. */
export function radiusFromPoint(points:RoadPoint[],i:number,p:WorldPoint,mode?:'arc'):number|null{
  const c=vertexCurve(points,i);if(!c)return null;
  const b=points[i],d=(p.x-b.x)*c.bisector.x+(p.y-b.y)*c.bisector.y,cap=mode==='arc'?c.maxRadius:Math.min(c.maxRadius,MAX_RADIUS),r=Math.max(0,Math.min(cap,d/((c.k-1)||1)));
  const step=Math.round(r*2)/2;return step>cap+1e-9?Math.floor(cap*2)/2:step;
}

/** Station range of the arc at each curved vertex (road stations along the straight polyline). */
export function curveRanges(points:RoadPoint[],stations:number[]):{index:number;from:number;to:number}[]{
  const out:{index:number;from:number;to:number}[]=[];
  for(let i=1;i<points.length-1;i++){const c=vertexCurve(points,i);if(c&&c.radius>0)out.push({index:i,from:stations[i]-c.tangent,to:stations[i]+c.tangent});}
  return out;
}
