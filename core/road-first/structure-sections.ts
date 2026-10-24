// Section on a structure ("หน้าตัดบนโครงสร้าง"): a road's own section over its bridge decks and in its tunnels, with a
// transition to the section at grade outside each structure. Built as section stretches over the structure extents
// that compile measures (the deck / tunnel extents of each grade-separated crossing), so plan, section, 3D and export
// read the same lane / width components as a stretch drawn by hand.
import type {Road} from './derive';
import {sectionWidth} from './elevation';
import {sectionChangeError,type SectionStretch} from './section-stretches';

export type StructureSection=Pick<SectionStretch,'forwardLanes'|'backwardLanes'|'walk'|'bands'>&{transition:number};
/** Structure extent on one road, in road stations (deck: the road is on top; tunnel: the road is below ground). */
export type StructureExtent={roadId:string;kind:'deck'|'tunnel';from:number;to:number;crossing:string};
/** Starting transition (m; tool value for drawing, TO_VERIFY). */
export const STRUCTURE_SECTION_DEFAULTS={transition:30};
const r3=(v:number)=>Math.round(v*1000)/1000;

/** Input check; null when valid. */
export function structureSectionError(road:Pick<Road,'name'|'section'>&{structureSection?:unknown}):string|null{
  const x=road.structureSection as StructureSection|undefined;if(x===undefined)return null;
  const ok=x&&typeof x==='object'&&[x.walk,x.transition].every(v=>typeof v==='number'&&Number.isFinite(v))&&x.transition>=0&&x.transition<=500
    &&Number.isInteger(x.forwardLanes)&&Number.isInteger(x.backwardLanes)
    &&(x.bands===undefined||(Array.isArray(x.bands)&&x.bands.every(b=>b&&typeof b.width==='number'&&Number.isFinite(b.width))));
  if(!ok)return `หน้าตัดบนโครงสร้างของ ${road.name} ไม่ถูกต้อง`;
  return sectionChangeError(road,x,'บนโครงสร้าง');
}

/** The road's full section on its structure (for the plan deck / tunnel width). */
export function structureRoadSection(road:Road){
  const x=road.structureSection,s=road.section;if(!x)return s;
  return{...s,forwardLanes:x.forwardLanes,backwardLanes:x.backwardLanes,walk:x.walk,
    bands:(s.bands??[]).map(b=>({...b,width:x.bands?.find(y=>y.type===b.type)?.width??b.width}))};
}
export const structureWidth=(road:Road)=>sectionWidth(structureRoadSection(road));

/** Extents of one road, sorted, with extents that touch merged into one. */
export function roadExtents(extents:StructureExtent[],roadId:string):[number,number][]{
  const list=extents.filter(x=>x.roadId===roadId).map(x=>[x.from,x.to] as [number,number]).sort((a,b)=>a[0]-b[0]),out:[number,number][]=[];
  for(const v of list){const last=out.at(-1);if(last&&v[0]<=last[1]+1e-6)last[1]=Math.max(last[1],v[1]);else out.push([...v]);}
  return out;
}

/** Structure spans of a road in a compile result (merged), in road stations. */
export const structureSpans=(compiled:{structures?:StructureExtent[]},roadId:string)=>roadExtents(compiled.structures??[],roadId);

/**
 * The road's structure section as stretches: over each structure, with the transition outside it (shortened at a road
 * end). Two structures whose transitions would meet become one stretch.
 */
export function structureStretches(road:Road,extents:StructureExtent[],length:number):SectionStretch[]{
  const x=road.structureSection;if(!x)return[];
  const t=x.transition,spans=roadExtents(extents,road.id),grown:[number,number][]=[];
  for(const [a,b] of spans){const last=grown.at(-1);if(last&&a-t<=last[1]+t+1e-6)last[1]=b;else grown.push([a,b]);}
  return grown.map(([a,b],i)=>{const start=Math.max(0,a-t),end=Math.min(length,b+t);
    return{id:`structure-${i+1}`,start:r3(start),end:r3(end),taperIn:r3(a-start),taperOut:r3(end-b),
      forwardLanes:x.forwardLanes,backwardLanes:x.backwardLanes,walk:x.walk,...(x.bands?{bands:x.bands.map(b=>({...b}))}:{})};});
}

/** Reversed road: the lanes of the two directions swap (two-way roads keep their traffic on the ground). */
export const reverseStructureSection=(x:StructureSection):StructureSection=>({...x,forwardLanes:x.backwardLanes,backwardLanes:x.forwardLanes});
