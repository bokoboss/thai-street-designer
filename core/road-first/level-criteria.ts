// Level criteria of a project (before Phase 4B-3): vertical clearance, structure depth, tunnel roof and maximum grades.
// The tool derives bridge heights, underpass depths and ramp lengths from them and flags designs that fall short.
// Starting values are tool values, NOT standards: each criterion carries the source the engineer enters for the
// project; without one it is shown as TO_VERIFY (docs/spec/LEVEL_CRITERIA.md, docs/standards/STANDARDS_POLICY.md).
import type {Road} from './derive';

export type Criterion={value:number;source?:string};
export type LevelCriteriaKey='clearance'|'deckDepth'|'tunnelRoof'|'mainGrade'|'rampGrade';
export type LevelCriteria=Record<LevelCriteriaKey,Criterion>;

/** Tool starting values (m, or % for grades); TO_VERIFY until a project source is entered. */
export const LEVEL_CRITERIA_DEFAULTS:LevelCriteria={
  clearance:{value:5},deckDepth:{value:1.5},tunnelRoof:{value:1.5},mainGrade:{value:4},rampGrade:{value:5},
};
export const LEVEL_CRITERIA_LABEL:Record<LevelCriteriaKey,string>={
  clearance:'ช่องลอดใต้โครงสร้าง (ม.)',deckDepth:'ความลึกโครงสร้างสะพานรวมผิวทาง (ม.)',tunnelRoof:'หลังคาอุโมงค์รวมผิวทางด้านบน (ม.)',
  mainGrade:'ความชันสูงสุด ถนนหลัก (%)',rampGrade:'ความชันสูงสุด ทางลาด (%)',
};
/** Accepted ranges for entered values (input sanity only, not design limits). */
export const LEVEL_CRITERIA_RANGE:Record<LevelCriteriaKey,[number,number]>={
  clearance:[2,10],deckDepth:[.3,6],tunnelRoof:[.3,6],mainGrade:[1,15],rampGrade:[1,15],
};
export const LEVEL_CRITERIA_KEYS=Object.keys(LEVEL_CRITERIA_DEFAULTS) as LevelCriteriaKey[];

/** The project's criteria: entered values over the tool starting values. */
export function levelCriteria(stored?:Partial<LevelCriteria>):LevelCriteria{
  const out={...LEVEL_CRITERIA_DEFAULTS};
  for(const k of LEVEL_CRITERIA_KEYS)if(stored?.[k])out[k]={...stored[k]!};
  return out;
}
export const hasSource=(c:Criterion)=>!!c.source?.trim();
/** Level difference a bridge needs over the road below (clearance + structure depth). */
export const bridgeRise=(c:LevelCriteria)=>round(c.clearance.value+c.deckDepth.value);
/** Depth of a road in a tunnel under a road at grade (clearance + roof and surfacing above). */
export const tunnelDepth=(c:LevelCriteria)=>round(c.clearance.value+c.tunnelRoof.value);
/** Maximum grade for a road (ramp or main road), as a fraction. */
export const gradeFor=(c:LevelCriteria,road?:Pick<Road,'role'>)=>(road?.role==='ramp'?c.rampGrade.value:c.mainGrade.value)/100;
/** Length of a straight grade that climbs `height` (no vertical curves). */
export const rampLength=(height:number,grade:number)=>round(Math.abs(height)/(grade||1),1);
const round=(v:number,d=2)=>Math.round(v*10**d)/10**d;

/** Input check for stored criteria; null when valid. */
export function levelCriteriaError(v:unknown):string|null{
  if(v===undefined)return null;
  if(!v||typeof v!=='object')return 'เกณฑ์ระดับไม่ถูกต้อง';
  for(const [k,c] of Object.entries(v as Record<string,unknown>)){
    if(!LEVEL_CRITERIA_KEYS.includes(k as LevelCriteriaKey))return 'เกณฑ์ระดับไม่ถูกต้อง';
    const x=c as Criterion,[lo,hi]=LEVEL_CRITERIA_RANGE[k as LevelCriteriaKey];
    if(!x||typeof x.value!=='number'||!Number.isFinite(x.value)||x.value<lo||x.value>hi)return `${LEVEL_CRITERIA_LABEL[k as LevelCriteriaKey]} ต้องอยู่ระหว่าง ${lo}–${hi}`;
    if(x.source!==undefined&&(typeof x.source!=='string'||x.source.length>200))return 'แหล่งอ้างอิงของเกณฑ์ระดับยาวเกินไป';
  }
  return null;
}
