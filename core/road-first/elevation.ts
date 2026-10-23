// Road elevations and explicit local rise/dip proposals.
// Profiles without curve lengths remain linear between their points and constant outside them.
// No profile = level 0, so files saved before 4A are unchanged. Values here are tool values, not standards.
import type {WorldPoint} from '../network/network-project';

import {levelAt,sortedProfile,verticalSlice,type Profile} from '../common/vertical-profile';
export {levelAt,gradeAt,sortedProfile,profileError,resolveVerticalProfile,authoredProfile,type Profile,type ProfilePoint} from '../common/vertical-profile';

/** |Δz| at or below this is "the same level" for making a junction (tool tolerance). */
export const LEVEL_TOLERANCE=0.5;
/** Starting values of the automatic rise over another road (tool values, editable, not standards). */
export const RISE_DEFAULTS={height:6,grade:.04,margin:10};
/** Starting depth of a trough under another road (tool value, editable, not a standard). */
export const DIP_DEFAULTS={depth:6.5};

/** Profile points within [from,to] re-measured from `from`, with the levels at both ends (link-local levels). */
export function profileSlice(profile:Profile|undefined,from:number,to:number):Profile|undefined{
  const p=sortedProfile(profile);if(!p.length||p.every(q=>q.z===0))return undefined;
  if(p.some(q=>(q.curveLength??0)>0))return verticalSlice(p,from,to);
  const r=(v:number)=>Math.round(v*1000)/1000;
  const inner=p.filter(q=>q.station>from+1e-6&&q.station<to-1e-6).map(q=>({station:r(q.station-from),z:r(q.z)}));
  return[{station:0,z:r(levelAt(p,from))},...inner,{station:r(to-from),z:r(levelAt(p,to))}];
}

/** Only points owned by this operation may be removed automatically. Untagged points are authored. */
export function removeGenerated(profile:Profile|undefined,owner:string):Profile{
  return sortedProfile(profile).filter(q=>q.generatedBy!==owner);
}

/** Local rise/dip proposal; authored points and unrelated generated work are never overwritten. */
export function riseProfile(profile:Profile|undefined,station:number,base:number,top:number,height=RISE_DEFAULTS.height,grade=RISE_DEFAULTS.grade,length=Infinity,owner='local-rise'):Profile{
  if(!Number.isFinite(grade)||grade<=0||!Number.isFinite(height)||!Number.isFinite(top)||top<0)throw Error('ค่าระดับหรือความชันสำหรับยกถนนไม่ถูกต้อง');
  const kept=removeGenerated(profile,owner),peak=base+height,ground=(s:number)=>levelAt(kept,s);
  const run=Math.max(Math.abs(height),Math.abs(peak-ground(station)))/grade,half=top/2,extent=half+run,start=station-extent,end=station+extent;
  if(start<0||end>length)throw Error(`ช่วงถนนไม่พอ: ต้องมีระยะ ${extent.toFixed(1)} ม. ก่อนและหลังจุดตัด — ปรับแนวถนนหรือแก้เกณฑ์ที่ใช้`);
  const conflict=kept.find(q=>q.station>start+1e-6&&q.station<end-1e-6||q.curveLength&&q.station+q.curveLength/2>start&&q.station-q.curveLength/2<end);
  if(conflict)throw Error(`จุดระดับที่ระยะ ${conflict.station.toFixed(1)} ม. อยู่ในช่วงที่จะปรับ — เก็บจุดเดิมไว้ กรุณาย้ายช่วงหรือแก้แนวดิ่งเอง`);
  const r=(v:number)=>Math.round(v*1000)/1000;
  const pts=[{station:r(start),z:r(ground(start))},{station:r(station-half),z:r(peak)},{station:r(station+half),z:r(peak)},{station:r(end),z:r(ground(end))}];
  for(let i=1;i<pts.length;i++)if(Math.abs((pts[i].z-pts[i-1].z)/(pts[i].station-pts[i-1].station))>grade+1e-5)throw Error('ระดับเดิมทำให้ช่วงขึ้นหรือลงชันเกินเกณฑ์ที่ตั้งไว้ — ปรับช่วงหรือแก้แนวดิ่งเอง');
  const additions=pts.filter(q=>!kept.some(p=>Math.abs(p.station-q.station)<.01&&Math.abs(p.z-q.z)<1e-6)).map(q=>({...q,generatedBy:owner}));
  return[...kept,...additions].sort((a,b)=>a.station-b.station);
}

export const midpoint=(a:WorldPoint,b:WorldPoint)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

/** Total width of a road section (lanes, median, sidewalks and side bands). */
export function sectionWidth(s:{forwardLanes:number;backwardLanes:number;laneWidth:number;median:number;walk:number;bands?:{width:number}[]}){
  return (s.forwardLanes+s.backwardLanes)*s.laneWidth+s.median+2*s.walk+2*(s.bands??[]).reduce((t,b)=>t+b.width,0);
}

/** Profile of a road drawn point by point at chosen levels (undefined when every level is 0). */
export function drawnProfile(points:WorldPoint[],levels:number[]):Profile|undefined{
  if(!levels.some(z=>Math.abs(z)>1e-9))return undefined;
  const r=(v:number)=>Math.round(v*1000)/1000;let s=0;
  return points.map((p,i)=>{if(i)s+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y);return{station:r(s),z:r(levels[i]??0)};})
    .filter((q,i,all)=>i===0||q.station-all[i-1].station>=.01);
}
/** Level step of the raise / lower keys while drawing (tool value). */
export const DRAW_LEVEL_STEP=1;
