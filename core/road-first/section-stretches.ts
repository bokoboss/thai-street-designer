// Section of a stretch ("หน้าตัดเฉพาะช่วง"): a different section over part of a road — more lanes, a wider or narrower
// footway, wider or narrower side bands — with a transition at each end. Stored in road stations like lane runs, and
// compiled into the same station lane / width components, so plan, section, 3D and export read one model.
// A stretch may add up to two lanes or drop exactly one curb lane per direction; structures remain additive-only.
import type {LinkStationLaneComponent,LinkStationWidthComponent,LinkWidthTarget} from '../network/network-project';
import type {Band} from '../junction/model';
import type {Road,RoadSection} from './derive';
import {LANE_RUN_STACK,remapRanges,splitRanges,type StationRange} from './lane-runs';

export type SectionStretch=StationRange&{forwardLanes:number;backwardLanes:number;walk:number;bands?:{type:Band['type'];width:number}[]};
/** Starting values for a new stretch (m; tool values for drawing, TO_VERIFY). */
export const STRETCH_DEFAULTS={length:200,transition:30};
const r3=(v:number)=>Math.round(v*1000)/1000;
const bandWidth=(s:RoadSection,type:Band['type'])=>(s.bands??[]).find(b=>b.type===type)?.width;

/** Input check for a road's section stretches; null when valid. */
export function stretchError(road:Pick<Road,'name'|'section'>&{sectionStretches?:unknown},length:number):string|null{
  const list=road.sectionStretches;if(list===undefined)return null;
  const bad=`หน้าตัดเฉพาะช่วงของ ${road.name} ไม่ถูกต้อง`;
  if(!Array.isArray(list)||list.length>12)return bad;
  const ids=new Set<string>();
  for(const x of list as SectionStretch[]){
    const ok=x&&typeof x.id==='string'&&!!x.id&&x.id.length<=30&&!ids.has(x.id)&&[x.start,x.end,x.taperIn,x.taperOut,x.walk].every(v=>typeof v==='number'&&Number.isFinite(v))
      &&Number.isInteger(x.forwardLanes)&&Number.isInteger(x.backwardLanes)&&x.start>=0&&x.end>x.start+1&&x.taperIn>=0&&x.taperOut>=0
      &&(x.bands===undefined||(Array.isArray(x.bands)&&x.bands.every(b=>b&&typeof b.width==='number'&&Number.isFinite(b.width))));
    if(!ok)return bad;ids.add(x.id);
    const where=`${x.start.toFixed(0)}–${x.end.toFixed(0)} ม.`;
    if(x.end>length+.01)return `${road.name}: หน้าตัดเฉพาะช่วง ${where} เลยปลายถนน`;
    if(x.taperIn+x.taperOut>x.end-x.start+1e-6)return `${road.name}: ช่วงเปลี่ยนของหน้าตัด ${where} ยาวกว่าตัวช่วง`;
    const e=sectionChangeError(road,x,` ${where}`,true);if(e)return e;
  }
  return null;
}

/** Road stretches can drop one curb lane; structure sections retain the previous add-only constraint. */
export function sectionChangeError(road:Pick<Road,'name'|'section'>,x:Pick<SectionStretch,'forwardLanes'|'backwardLanes'|'walk'|'bands'>,where:string,allowLaneReduction=false):string|null{
  const s=road.section;
  for(const [n,base,label] of [[x.forwardLanes,s.forwardLanes,'ตามทิศที่วาด'],[x.backwardLanes,s.backwardLanes,'ทิศสวน']] as const){
    if(n<base){
      if(!allowLaneReduction)return `${road.name}: หน้าตัด${where} มีช่อง${label}น้อยกว่าถนน — ลดช่องบนโครงสร้างยังทำไม่ได้`;
      if(n<1)return `${road.name}: หน้าตัด${where} ต้องเหลืออย่างน้อย 1 ช่อง${label} — ลดเหลือศูนย์ช่องไม่ได้`;
      if(n!==base-1)return `${road.name}: หน้าตัด${where} ลดช่อง${label}ได้ครั้งละ 1 ช่อง`;
    }
    if(n>base+LANE_RUN_STACK)return `${road.name}: หน้าตัด${where} เพิ่มช่อง${label}ได้ไม่เกิน ${LANE_RUN_STACK} ช่อง`;
    if(n>base&&base<1)return `${road.name}: ไม่มีช่องจราจร${label} จึงเพิ่มช่องด้านนี้ไม่ได้`;
  }
  if(x.walk<0||Math.abs(x.walk-s.walk)>5)return `${road.name}: ทางเท้าในหน้าตัด${where} ต้องต่างจากถนนไม่เกิน 5 ม.`;
  for(const b of x.bands??[]){const w=bandWidth(s,b.type);if(w===undefined)return `${road.name}: ถนนไม่มีแถบ ${b.type} ให้ปรับในหน้าตัด${where}`;if(b.width<0||Math.abs(b.width-w)>5)return `${road.name}: แถบริมทางในหน้าตัด${where} ต้องต่างจากถนนไม่เกิน 5 ม.`;}
  return null;
}

/** The stretch becomes signed lane components (add / curb drop), plus width adjustments. */
export function stretchParts(x:SectionStretch,s:RoadSection):{lanes:(Omit<LinkStationLaneComponent,'kind'>&{kind:'lane'})[];widths:LinkStationWidthComponent[]}{
  const base={start:x.start,end:x.end,taperIn:x.taperIn,taperOut:x.taperOut},lanes:(Omit<LinkStationLaneComponent,'kind'>&{kind:'lane'})[]=[],widths:LinkStationWidthComponent[]=[];
  for(const [dir,n,b] of [['forward',x.forwardLanes,s.forwardLanes],['backward',x.backwardLanes,s.backwardLanes]] as const){
    for(let k=1;k<=n-b;k++)lanes.push({id:`st-${x.id}-${dir[0]}${k}`,kind:'lane',direction:dir,side:'curb',...base});
    if(n===b-1)lanes.push({id:`st-${x.id}-${dir[0]}d1`,kind:'lane',operation:'drop',direction:dir,side:'curb',...base});
  }
  // The engine draws a width change down to 5 cm, never to nothing: a footway "removed" over a stretch keeps 5 cm.
  const width=(target:LinkWidthTarget,from:number,to:number)=>{const delta=r3(Math.max(to,.05)-from);if(Math.abs(delta)<.01)return;
    for(const dir of ['forward','backward'] as const)widths.push({id:`st-${x.id}-${target}-${dir[0]}`,kind:'width',direction:dir,target,delta,...base});};
  if(s.walk>0||x.walk>0)width('walk',s.walk,x.walk);
  for(const b of x.bands??[]){const w=bandWidth(s,b.type);if(w!==undefined)width(b.type as LinkWidthTarget,w,b.width);}
  return{lanes,widths};
}

/** Clip a component in road stations to a link [from,to] (link stations); null when it does not reach the link. */
export function clipPart<T extends {id:string;start:number;end:number;taperIn:number;taperOut:number}>(c:T,from:number,to:number):{part:T;clipped:boolean}|null{
  const a=Math.max(c.start,from),b=Math.min(c.end,to);if(b-a<1)return null;
  return{clipped:c.start<from-1e-6||c.end>to+1e-6,part:{...c,start:r3(a-from),end:r3(b-from)}};
}

/** Stretches on a re-measured road: the other way round, lanes of the two directions swap (two-way roads). */
export const remapStretches=(items:SectionStretch[]|undefined,before:Pick<Road,'points'|'alignment'>,after:Pick<Road,'points'|'alignment'>)=>
  remapRanges(items,before,after,x=>({...x,forwardLanes:x.backwardLanes,backwardLanes:x.forwardLanes}));
export const splitStretches=(items:SectionStretch[]|undefined,s:number)=>splitRanges(items,s);

/** A new stretch on the longest stretch between junction approaches: the road's own section plus one lane each way. */
export function newStretch(road:Road,free:{start:number;end:number}[]):{stretch:SectionStretch}|{error:string}{
  const ids=new Set((road.sectionStretches??[]).map(x=>x.id));let n=1;while(ids.has(`S${n}`))n++;
  const s=[...free].sort((x,y)=>(y.end-y.start)-(x.end-x.start))[0];
  if(!s||s.end-s.start<30)return{error:'ถนนช่วงนี้สั้นเกินกว่าจะตั้งหน้าตัดเฉพาะช่วงนอกช่วงเข้าทางแยก'};
  const length=Math.min(STRETCH_DEFAULTS.length,(s.end-s.start)*.8),mid=(s.start+s.end)/2,t=Math.min(STRETCH_DEFAULTS.transition,length/3),sec=road.section;
  return{stretch:{id:`S${n}`,start:r3(mid-length/2),end:r3(mid+length/2),taperIn:r3(t),taperOut:r3(t),
    forwardLanes:sec.forwardLanes+(sec.forwardLanes>0?1:0),backwardLanes:sec.backwardLanes+(sec.backwardLanes>0?1:0),walk:sec.walk,
    ...(sec.bands?.length?{bands:sec.bands.map(b=>({type:b.type,width:b.width}))}:{})}};
}

/** A one-lane curb reduction centred on an available road stretch (tool tapers, TO_VERIFY). */
export function newLaneReduction(road:Road,free:{start:number;end:number}[],direction:'forward'|'backward'):{stretch:SectionStretch}|{error:string}{
  const count=direction==='forward'?road.section.forwardLanes:road.section.backwardLanes;
  if(count<2)return{error:'ทิศทางนี้ต้องมีอย่างน้อยสองช่องก่อนลดช่องได้หนึ่งช่อง'};
  const made=newStretch(road,free);if('error' in made)return made;
  return{stretch:{...made.stretch,forwardLanes:road.section.forwardLanes-(direction==='forward'?1:0),
    backwardLanes:road.section.backwardLanes-(direction==='backward'?1:0)}};
}
