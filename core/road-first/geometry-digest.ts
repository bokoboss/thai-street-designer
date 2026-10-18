// World-space geometry digest of a NetworkProject, used as the golden comparison for
// road-first migration: a migrated file must compile back to the same drawn geometry.
// Arm slots and object ids may differ, so everything is compared as world-space point sets.
import {activeIds,armIslands,armMouth,armTreatmentOrigins,armTurn,dividerRange,edges,rotate,stopPosition,type P} from '../junction/geometry';
import {resolvedArrowsForArm} from '../junction/arrow-layout';
import {slipGeometries} from '../junction/slip-geometry';
import {roundSettings,roundDefaults} from '../junction/roundabout';
import {resolveRoadLinkSceneSurfaces} from '../network/network-scene-geometry';
import {linkLength,linkPoints,worldJunctionRotation,type JunctionInstance,type NetworkProject} from '../network/network-project';

export type JunctionDigest={name:string;center:P;layers:Record<string,P[]>};
export type LinkDigest={name:string;length:number;points:P[]};
/** linkSurfaces: resolved RoadLink pavement, sidewalk and band surfaces by kind (includes lane/width components and transitions). */
export type NetworkDigest={junctions:JunctionDigest[];links:LinkDigest[];ends:P[];linkSurfaces:Record<string,P[]>};

function junctionDigest(j:JunctionInstance):JunctionDigest{
  const d=j.design,boundaries=edges(d),turn=worldJunctionRotation(j)/90,round=d.type==='roundabout';
  const world=(p:P,arm:number)=>{const local=rotate(p,armTurn(d,arm)),q=rotate(local,turn);return{x:j.x+q.x,y:j.y+q.y};};
  const layers:Record<string,P[]>={outline:[],walk:[],islands:[],slips:[],arrows:[],marks:[]};
  for(const e of boundaries){
    layers.outline.push(...e.outer.map(p=>world(p,e.i)));
    layers.walk.push(...e.walk.map(p=>world(p,e.i)));
    layers.islands.push(...e.island.map(p=>world(p,e.i)));
  }
  for(const i of activeIds(d)){
    const a=d.arms[i],mouth=armMouth(d,i),origins=armTreatmentOrigins(d,i,boundaries);
    for(const poly of armIslands(d,i,boundaries))layers.islands.push(...poly.map(p=>world(p,i)));
    for(const arrow of resolvedArrowsForArm(d,i,boundaries))layers.arrows.push(world({x:arrow.x,y:arrow.y},i));
    if(a.incoming)layers.marks.push(world({x:stopPosition(a,mouth),y:0},i));
    for(const side of [1,-1]){
      const r=dividerRange(a,mouth,round,side,round?roundSettings(d):roundDefaults(),origins.outgoing);
      layers.marks.push(world({x:r.start,y:side},i),world({x:r.end,y:side},i));
    }
  }
  for(const g of slipGeometries(d,boundaries))layers.slips.push(...g.pavement.map(p=>world(p,g.fromArm)));
  return{name:j.name,center:{x:j.x,y:j.y},layers};
}

export function networkDigest(project:NetworkProject):NetworkDigest{
  return{
    junctions:project.junctions.map(junctionDigest),
    links:project.links.map(l=>({name:l.name,length:linkLength(project,l),points:linkPoints(project,l)})),
    ends:project.roadEnds.map(e=>({x:e.x,y:e.y})),
    linkSurfaces:resolveRoadLinkSceneSurfaces(project).reduce<Record<string,P[]>>((all,s)=>{(all[s.kind]??=[]).push(...s.points);return all;},{}),
  };
}

const dist=(a:P,b:P)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Largest distance from any point of one set to the nearest point of the other (both directions). */
export function setDistance(a:P[],b:P[]){
  if(!a.length||!b.length)return a.length===b.length?0:Infinity;
  const one=(x:P[],y:P[])=>Math.max(...x.map(p=>Math.min(...y.map(q=>dist(p,q)))));
  return Math.max(one(a,b),one(b,a));
}

/** Differences between two digests in plain language; empty when they match within `tolerance` metres. */
export function compareDigests(expected:NetworkDigest,actual:NetworkDigest,tolerance=.01):string[]{
  const out:string[]=[];
  if(expected.junctions.length!==actual.junctions.length)out.push(`จำนวนทางแยก ${expected.junctions.length} → ${actual.junctions.length}`);
  for(const e of expected.junctions){
    const a=actual.junctions.find(x=>dist(x.center,e.center)<=tolerance);
    if(!a){out.push(`${e.name}: ไม่พบทางแยกที่ตำแหน่งเดิม`);continue;}
    for(const [layer,points] of Object.entries(e.layers)){
      const other=a.layers[layer]??[],gap=setDistance(points,other);
      if(points.length!==other.length||gap>tolerance)out.push(`${e.name}: ${layer} ต่างกัน (${points.length}/${other.length} จุด, ห่างสุด ${Number.isFinite(gap)?gap.toFixed(3):'∞'} ม.)`);
    }
  }
  if(expected.links.length!==actual.links.length)out.push(`จำนวนช่วงถนน ${expected.links.length} → ${actual.links.length}`);
  const used=new Set<number>();
  for(const e of expected.links){
    const k=actual.links.findIndex((a,i)=>!used.has(i)&&Math.abs(a.length-e.length)<=tolerance&&setDistance(a.points,e.points)<=tolerance);
    if(k<0)out.push(`${e.name}: แนวถนนต่างกัน`);else used.add(k);
  }
  for(const kind of new Set([...Object.keys(expected.linkSurfaces),...Object.keys(actual.linkSurfaces)])){
    const a=expected.linkSurfaces[kind]??[],b=actual.linkSurfaces[kind]??[],gap=setDistance(a,b);
    if(gap>tolerance)out.push(`ผิวถนนบนช่วงถนน (${kind}) ต่างกัน ห่างสุด ${Number.isFinite(gap)?gap.toFixed(3):'∞'} ม.`);
  }
  if(setDistance(expected.ends,actual.ends)>tolerance||expected.ends.length!==actual.ends.length)out.push('ตำแหน่งปลายถนนต่างกัน');
  return out;
}
