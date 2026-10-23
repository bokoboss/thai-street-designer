// Structure envelope and measured vertical clearance at a grade-separated crossing.
// The clearance is the smallest height between the lower road's travelled way and the underside of the structure
// carrying the upper road (deck soffit, or tunnel roof), over the whole area where the two roads overlap in plan —
// not the level difference of the centre lines at one point. Cross sections are level (no crossfall yet), so a road's
// surface level depends on its station only. No terrain: ground is the datum z = 0 (an assumption, shown as such).
// A crossing that cannot be measured returns null (shown as "not measured"), never 0 and never a pass.
import {resolveAlignment,type AlignmentMode} from '../common/resolved-alignment';
import {levelAt} from '../common/vertical-profile';
import type {WorldPoint} from '../network/network-project';
import type {RoadPoint,RoadSection} from './derive';
import {LEVEL_TOLERANCE} from './elevation';
import type {LevelCriteria} from './level-criteria';

type ClearanceRoad={points:RoadPoint[];alignment?:AlignmentMode;section:RoadSection;profile?:{station:number;z:number;curveLength?:number}[]};
export type StructureKind='deck'|'tunnel';
export type ClearanceMeasure={
  /** deck = bridge over the lower road; tunnel = the lower road below ground under the upper road. */
  structure:StructureKind;
  /** Structure depth used (project criteria: structure depth for a deck, roof for a tunnel). */
  depth:number;
  /** Smallest measured clearance (m) over the overlap; null when the overlap could not be measured. */
  min:number|null;
  /** Where the smallest clearance is (plan point and station on each road). */
  at?:WorldPoint;atOver?:number;atUnder?:number;
  /** Stations of the overlap on the upper and lower road (the structure's extent before any abutment margin). */
  spanOver?:[number,number];spanUnder?:[number,number];
};

const sideWidth=(s:RoadSection,side:1|-1)=>s.median/2+(side===1?s.forwardLanes:s.backwardLanes)*s.laneWidth+(s.bands??[]).reduce((t,b)=>t+b.width,0);
const fullHalf=(s:RoadSection,side:1|-1)=>sideWidth(s,side)+s.walk;
/** Sampling steps (m): drawing / measuring resolution of this check, not a design value. */
export const CLEARANCE_SAMPLING={along:.5,across:.5};
const round=(v:number,d=3)=>Math.round(v*10**d)/10**d;

/**
 * Measure the clearance under `over` across `under` around their crossing (`overStation` / `underStation`).
 * The lower road's travelled way (lanes, median, bands — not footways) is sampled; a sample counts when it lies under
 * the upper road's full width (footways included). Clearance at a sample = upper surface − depth − lower surface.
 */
export function measureClearance(over:ClearanceRoad,under:ClearanceRoad,overStation:number,underStation:number,criteria:LevelCriteria):ClearanceMeasure{
  const A=resolveAlignment(over.points,over.alignment??'chord'),B=resolveAlignment(under.points,under.alignment??'chord');
  const zOver=levelAt(over.profile,overStation),zUnder=levelAt(under.profile,underStation);
  const structure:StructureKind=zUnder<-LEVEL_TOLERANCE?'tunnel':'deck',depth=structure==='tunnel'?criteria.tunnelRoof.value:criteria.deckDepth.value;
  const out:ClearanceMeasure={structure,depth,min:null};
  if(!(A.length>0)||!(B.length>0))return out;
  // Search window along the lower road: wide enough for the upper road's width at a skew angle.
  const ta=A.tangentAt(overStation),tb=B.tangentAt(underStation),sin=Math.abs(ta.x*tb.y-ta.y*tb.x);
  const overHalf=Math.max(fullHalf(over.section,1),fullHalf(over.section,-1)),underHalf=Math.max(sideWidth(under.section,1),sideWidth(under.section,-1));
  const window=Math.min(400,(overHalf+underHalf*Math.sqrt(Math.max(0,1-sin*sin)))/Math.max(sin,.1)+CLEARANCE_SAMPLING.along*2);
  const s0=Math.max(0,underStation-window),s1=Math.min(B.length,underStation+window);
  const along=Math.max(1,Math.ceil((s1-s0)/CLEARANCE_SAMPLING.along));
  const left=sideWidth(under.section,1),right=sideWidth(under.section,-1),across=Math.max(1,Math.ceil((left+right)/CLEARANCE_SAMPLING.across));
  let best:{c:number;p:WorldPoint;so:number;su:number}|null=null,so0=Infinity,so1=-Infinity,su0=Infinity,su1=-Infinity;
  for(let i=0;i<=along;i++){
    const su=s0+(s1-s0)*i/along,c=B.pointAt(su),t=B.tangentAt(su),n={x:t.y,y:-t.x},zu=levelAt(under.profile,su);
    for(let k=0;k<=across;k++){
      const off=-right+(left+right)*k/across,p={x:c.x+n.x*off,y:c.y+n.y*off},hit=A.project(p);
      if(hit.station<=1e-6||hit.station>=A.length-1e-6)continue;
      // Which side of the upper road the sample is on decides which half-width covers it.
      const ot=A.tangentAt(hit.station),side=((p.x-hit.point.x)*ot.y-(p.y-hit.point.y)*ot.x)>=0?1:-1;
      if(hit.distance>fullHalf(over.section,side)+1e-6)continue;
      const clear=levelAt(over.profile,hit.station)-depth-zu;
      so0=Math.min(so0,hit.station);so1=Math.max(so1,hit.station);su0=Math.min(su0,su);su1=Math.max(su1,su);
      if(!best||clear<best.c-1e-9)best={c:clear,p,so:hit.station,su};
    }
  }
  if(!best)return out;
  // The upper road must actually be above the lower one here; otherwise this is not a structure to measure.
  if(zOver-zUnder<=LEVEL_TOLERANCE)return out;
  return{...out,min:round(best.c,2),at:{x:round(best.p.x),y:round(best.p.y)},atOver:round(best.so,2),atUnder:round(best.su,2),
    spanOver:[round(so0,2),round(so1,2)],spanUnder:[round(su0,2),round(su1,2)]};
}

/** Clearance to show: the measured value, or "not measured" — never 0 standing in for a missing value. */
export function clearanceText(m?:Pick<ClearanceMeasure,'min'>|null){
  return m?.min==null?'ยังวัดไม่ได้':`${m.min.toFixed(2)} ม.`;
}
