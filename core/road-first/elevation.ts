// Phase 4A — road levels and grade-separated crossings (docs/spec/PHASE_4A_ELEVATION.md).
// A road's profile is a list of vertical points (station, z); between them the level is linear, outside them constant.
// No profile = level 0, so files saved before 4A are unchanged. Values here are tool values, not standards.
import type {WorldPoint} from '../network/network-project';

export type ProfilePoint={station:number;z:number};
export type Profile=ProfilePoint[];

/** |Δz| at or below this is "the same level" for making a junction (tool tolerance). */
export const LEVEL_TOLERANCE=0.5;
/** Starting values of the automatic rise over another road (tool values, editable, not standards). */
export const RISE_DEFAULTS={height:6,grade:.04,margin:10};

export const sortedProfile=(p?:Profile)=>[...(p??[])].sort((a,b)=>a.station-b.station);

/** Level of a profile at a station: linear between points, constant outside, 0 without points. */
export function levelAt(profile:Profile|undefined,station:number):number{
  const p=sortedProfile(profile);if(!p.length)return 0;
  if(station<=p[0].station)return p[0].z;
  for(let i=1;i<p.length;i++)if(station<=p[i].station){const a=p[i-1],b=p[i],t=b.station>a.station?(station-a.station)/(b.station-a.station):1;return a.z+(b.z-a.z)*t;}
  return p[p.length-1].z;
}

/** Profile points within [from,to] re-measured from `from`, with the levels at both ends (link-local levels). */
export function profileSlice(profile:Profile|undefined,from:number,to:number):Profile|undefined{
  const p=sortedProfile(profile);if(!p.length||p.every(q=>q.z===0))return undefined;
  const r=(v:number)=>Math.round(v*1000)/1000;
  const inner=p.filter(q=>q.station>from+1e-6&&q.station<to-1e-6).map(q=>({station:r(q.station-from),z:r(q.z)}));
  return[{station:0,z:r(levelAt(p,from))},...inner,{station:r(to-from),z:r(levelAt(p,to))}];
}

/** Points removed within `extent` of a station (used to take a generated rise away again). */
export function flattenAround(profile:Profile|undefined,station:number,extent:number):Profile{
  return sortedProfile(profile).filter(q=>Math.abs(q.station-station)>extent+1e-6);
}

/**
 * A profile that rises over another road at `station`: up at `grade`, flat across `top` (width of the other road plus a
 * margin each side), down again; the rest of the existing profile is kept outside the rise.
 */
export function riseProfile(profile:Profile|undefined,station:number,base:number,top:number,height=RISE_DEFAULTS.height,grade=RISE_DEFAULTS.grade,length=Infinity):Profile{
  const run=height/grade,half=top/2,extent=half+run;
  const r=(v:number)=>Math.round(v*1000)/1000;
  const kept=flattenAround(profile,station,extent);
  const peak=base+height,ground=(s:number)=>levelAt(kept,s);
  // Level along the rise (ramp up, flat top, ramp down), cut at the road's ends: a rise near an end starts part-way up.
  const along=(s:number)=>{const d=Math.abs(s-station);return d<=half?peak:d>=extent?ground(s):peak-(d-half)*grade;};
  const at=(s:number)=>({station:r(Math.max(0,Math.min(length,s))),z:r(along(Math.max(0,Math.min(length,s))))});
  const pts=[at(station-extent),at(station-half),at(station+half),at(station+extent)].filter((q,i,all)=>all.findIndex(o=>Math.abs(o.station-q.station)<.01)===i);
  return [...kept.filter(q=>q.station>=0&&q.station<=length),...pts].sort((a,b)=>a.station-b.station);
}

/** Valid profile: up to 64 points, finite, stations ≥ 0 and distinct, levels within ±200 m. */
export function profileError(p:unknown):string|null{
  if(p===undefined)return null;
  if(!Array.isArray(p)||p.length>64)return 'แนวดิ่งต้องมีไม่เกิน 64 จุด';
  if(!p.every(q=>q&&Number.isFinite(q.station)&&q.station>=0&&Number.isFinite(q.z)&&Math.abs(q.z)<=200))return 'ค่าระยะหรือระดับในแนวดิ่งไม่ถูกต้อง';
  const s=p.map(q=>q.station).sort((a,b)=>a-b);
  for(let i=1;i<s.length;i++)if(s[i]-s[i-1]<.01)return 'จุดแนวดิ่งสองจุดอยู่ที่ระยะเดียวกัน';
  return null;
}

export const midpoint=(a:WorldPoint,b:WorldPoint)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

/** Total width of a road section (lanes, median, sidewalks and side bands). */
export function sectionWidth(s:{forwardLanes:number;backwardLanes:number;laneWidth:number;median:number;walk:number;bands?:{width:number}[]}){
  return (s.forwardLanes+s.backwardLanes)*s.laneWidth+s.median+2*s.walk+2*(s.bands??[]).reduce((t,b)=>t+b.width,0);
}
