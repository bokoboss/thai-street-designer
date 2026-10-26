// SPIKE (roadmap Phase 1B) — road-first authoring compiled onto the existing engine.
// Roads own alignment + section. Crossings become explicit candidates. Confirmed
// junctions compile to ordinary JunctionInstance/RoadLink objects, so every
// existing geometry, Slip, review, 2D/3D and export path is reused unchanged.
import {resolveAlignment,alignmentIntersections,type AlignmentMode} from '../common/resolved-alignment';
import {initial,markingsFor,roadsideDefaults,type Arm,type Band,type Design} from '../junction/model';
import {defaultSlip,nextActiveArm,type SlipLane} from '../junction/slip-model';
import {requiredArmLength} from '../junction/arm-fit';
import {applyApproach,applyLegTreatment,legKey,parseLegKey,type ApproachOverride,type DesignSettings,type LegKey,type LegSlip,type LegTreatment} from './leg-binding';
import {isJunctionPort,linkLinearTransitionPossible,type JunctionInstance,type LinkEndRef,type LinkSectionProfile,type LinkStationLaneComponent,type LinkStationWidthComponent,type NetworkProject,type RoadEnd,type RoadEndSection,type RoadLink,type WorldPoint} from '../network/network-project';
import {proposalId} from '../network/junction-auxiliary-proposal';
import type {Direction} from '../junction/model';
import {LEVEL_TOLERANCE,levelAt,profileSlice,sectionWidth,type Profile} from './elevation';
import {rampTerminal,type AuxLane,type RampAnchor} from './ramps';
import {auxLaneRuns,clipRun,weavingSections,type LaneRun} from './lane-runs';
import {clipPart,stretchParts,type SectionStretch} from './section-stretches';
import {curveRanges,vertexCurve} from './curves';
import {gradeFor,hasSource,levelCriteria,type LevelCriteria} from './level-criteria';
import {measureClearance,type ClearanceMeasure} from './structure-clearance';
import {structureRoadSection,structureStretches,structureWidth,type StructureExtent,type StructureSection} from './structure-sections';
import {stationCompositionIssues} from './station-composition';
import type {ConnectorOverride} from './lane-connector-overrides';

export type RoadSection={
  forwardLanes:number;backwardLanes:number;laneWidth:number;median:number;walk:number;bands?:Band[];
};
export type RoadPoint=WorldPoint&{radius?:number};
/** Road end overrides: a road end keeps its own name, facing and section when they differ from the road. */
export type RoadEndData={name?:string;heading?:number;section?:RoadEndSection};
/** Pocket continuation source, stored relative to the link end instead of a junction id. */
export type RoadLinkSource={kind:'junction-auxiliary';end:'from'|'to';direction:Direction;side:'left'|'right';lane:number};
export type RoadLinkComponent=LinkStationWidthComponent|(Omit<LinkStationLaneComponent,'source'>&{source?:RoadLinkSource});
/** Settings of the k-th RoadLink along the road (between consecutive junctions / road ends), in road direction. */
export type RoadLinkData={name?:string;sectionProfile?:LinkSectionProfile;components?:RoadLinkComponent[]};
/** access: a project access (driveway). Where it meets a road, that road keeps flowing (see compileRoadNetwork).
 * ramp: a one-way road whose ends may attach to the side of another road (diverge / merge, Phase 4B; see ramps.ts). */
export type RoadRole='access'|'ramp';
/** Mid-block median opening: station = start from the road start (road stations). */
export type RoadOpening={id:string;station:number;length:number;type?:'opening'|'uturn'};
export type Road={alignment?:'arc';id:string;name:string;role?:RoadRole;points:RoadPoint[];section:RoadSection;ends?:{start?:RoadEndData;end?:RoadEndData};links?:RoadLinkData[];openings?:RoadOpening[];
  /** Trees / street lights along both sidewalks, on the links and on this road's junction arms (engine roadside defaults). */
  roadside?:{trees:boolean;lights:boolean};
  /** Lanes added along a stretch, in road stations (see lane-runs.ts). */
  laneRuns?:LaneRun[];
  /** A different section over parts of the road, in road stations (see section-stretches.ts). */
  sectionStretches?:SectionStretch[];
  /** Its own section over its bridge decks and in its tunnels (see structure-sections.ts). */
  structureSection?:StructureSection;
  /** Vertical points (station, z) — Phase 4A; absent = level 0. */
  profile?:Profile;
  /** Made by a template (Phase 4B-3): which one, its version, the group of pieces placed together and the parameters used. */
  origin?:RoadOrigin;
  /** Ramp ends attached to the side of another road (diverge at the start, merge at the end). */
  anchors?:{start?:RampAnchor;end?:RampAnchor};
  /** Auxiliary lane on the main road at an attached ramp end: deceleration before a diverge, acceleration after a merge. */
  terminals?:{start?:AuxLane;end?:AuxLane}};
export type RoadOrigin={template:'diamond'|'uturn-bridge';version:1;group:string;params:Record<string,unknown>};
export type CandidateKind='cross'|'tee';
export type Candidate={id:string;kind:CandidateKind;point:WorldPoint;roads:{roadId:string;station:number}[]};
export type {LegKey} from './leg-binding';
/** Junction-owned treatments keyed by road leg, so they survive recompiles and road edits. */
/** cornerRadii: per-corner curb radius keyed by the road leg the corner starts from (to the next leg by angle). */
export type JunctionTreatments={connectors?:ConnectorOverride[];slips?:LegSlip[];corner?:number;cornerRadii?:Partial<Record<LegKey,number>>;legs?:Partial<Record<LegKey,LegTreatment>>;approaches?:Partial<Record<LegKey,ApproachOverride>>;design?:DesignSettings};
/** roads: the roads that join at this junction; any other road through the same point passes over or under it. */
/** at: last known position of the crossing, used to re-attach the decision after road edits. */
/** excluded: roads that reach the junction point but were deliberately left out of it (not reported, never auto-joined). */
/** over: on a grade-separated crossing, the road that passes over (absent = from the levels). */
export type Decision={profileOwner?:string;candidateId:string;decision:'junction'|'grade-separated'|'ignore';over?:string;name?:string;roads?:string[];excluded?:string[];at?:WorldPoint;treatments?:JunctionTreatments};
/** levels: the project's level criteria (clearance, structure depth, grades); absent = tool starting values. */
export type CompileOptions={approachLength?:number;tolerance?:number;levels?:Partial<LevelCriteria>};
export type LegBinding={junctionId:string;armId:number;roadId:string;side:'ahead'|'behind'};
/** sources: which crossing each compiled junction comes from and which road each RoadLink belongs to (for selection in the editor). */
export type CompileSources={junctions:Record<string,string>;links:Record<string,string>};
/**
 * unjoined: per junction (candidate id), roads that pass through or end at the junction point but are not part of it.
 * overflow: candidate ids of junctions with more legs than the engine supports (extra legs are left out and reported).
 */
/** shortfalls: arms that need more length than the straight part of their road gives (stretched off the alignment). */
export type ArmShortfall={candidateId:string;junctionId:string;armId:number;roadId:string;side:'ahead'|'behind';room:number;required:number};
/** A grade-separated crossing (Phase 4A): relation, the two roads and the measured level gap (over minus under). */
export type CompiledCrossing={candidateId:string;roads:string[];point:WorldPoint;relation:'over'|'unresolved';over?:string;under?:string;gap:number;name:string;
  /** Measured clearance under the structure over the overlap of the two roads (relation over only). */
  clearance?:ClearanceMeasure};
export type CompileResult={project:NetworkProject;legs:LegBinding[];issues:string[];sources:CompileSources;unjoined:Record<string,string[]>;overflow:string[];shortfalls:ArmShortfall[];crossings:CompiledCrossing[];linkRanges:{id:string;roadId:string;from:number;to:number}[];
  /** Bridge deck / tunnel extents on each road, in road stations (overlap plus the structure margin). */
  structures:StructureExtent[]};

/** Plan extent of a bridge deck or tunnel beyond the measured overlap of the two roads (m; display tool value). */
export const STRUCTURE_MARGIN=2;
/** Tool defaults (m): clearance kept before a bend, straight tail absorbed into an arm, shortest link left between two junctions. */
const EPS=1e-6,BEND_CLEARANCE=15,SHORT_TAIL=20,MIN_LINK=5;
const sub=(a:WorldPoint,b:WorldPoint)=>({x:a.x-b.x,y:a.y-b.y});
const len=(v:WorldPoint)=>Math.hypot(v.x,v.y);
const lerp=(a:WorldPoint,b:WorldPoint,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const headingDeg=(v:WorldPoint)=>((Math.atan2(v.y,v.x)*180/Math.PI)+360)%360;
const round=(v:number,d=6)=>Math.round(v*10**d)/10**d;

export function stations(points:RoadPoint[],mode:AlignmentMode='chord'){if(mode==='arc')return resolveAlignment(points).vertices;const out=[0];for(let i=1;i<points.length;i++)out.push(out[i-1]+len(sub(points[i],points[i-1])));return out;}
export function pointAt(points:RoadPoint[],station:number,mode:AlignmentMode='chord'){
  if(mode==='arc')return resolveAlignment(points).pointAt(station);
  const s=stations(points);
  for(let i=1;i<points.length;i++)if(station<=s[i]+EPS){const t=(station-s[i-1])/((s[i]-s[i-1])||1);return lerp(points[i-1],points[i],Math.max(0,Math.min(1,t)));}
  return points[points.length-1];
}
/** Index of the segment containing a station (segment i runs from point i to i+1). */
function segmentAt(points:RoadPoint[],station:number,preferAhead:boolean,mode?:'arc'){
  const s=stations(points,mode);
  for(let i=0;i<points.length-1;i++){
    if(preferAhead?station<s[i+1]-EPS:station<=s[i+1]+EPS)return i;
  }
  return points.length-2;
}

/** Geometric candidates only. Nothing here changes topology. */
export function detectCandidates(roads:Road[],tolerance=1):Candidate[]{
  const out:Candidate[]=[];
  for(let a=0;a<roads.length;a++)for(let b=a+1;b<roads.length;b++){
    const A=roads[a],B=roads[b],sa=stations(A.points,A.alignment),sb=stations(B.points,B.alignment);
    if(A.alignment==='arc'||B.alignment==='arc'){
      const aa=resolveAlignment(A.points,A.alignment??'chord'),bb=resolveAlignment(B.points,B.alignment??'chord');
      const hits=alignmentIntersections(aa,bb);
      // End-to-road snapping uses the same nearest point, without extending interior arc segments.
      for(const [one,two,flip] of [[aa,bb,false],[bb,aa,true]] as const)for(const st of [0,one.length]){
        const p=one.pointAt(st),f=two.project(p);
        if(f.distance<=tolerance&&f.station>tolerance&&f.station<two.length-tolerance&&!hits.some(h=>len(sub(h.point,p))<tolerance))
          hits.push({point:f.point,stationA:flip?f.station:st,stationB:flip?st:f.station});
      }
      for(const hit of hits){
        const endA=hit.stationA<tolerance||hit.stationA>aa.length-tolerance,endB=hit.stationB<tolerance||hit.stationB>bb.length-tolerance;
        if(endA&&endB)continue;
        const refs=[{roadId:A.id,station:round(hit.stationA)},{roadId:B.id,station:round(hit.stationB)}];
        const same=out.find(c=>len(sub(c.point,hit.point))<tolerance);
        if(same){for(const ref of refs)if(!same.roads.some(r=>r.roadId===ref.roadId))same.roads.push(ref);}
        else out.push({id:'',kind:endA||endB?'tee':'cross',point:hit.point,roads:refs});
      }
      continue;
    }
    for(let i=0;i<A.points.length-1;i++)for(let j=0;j<B.points.length-1;j++){
      const p=A.points[i],r=sub(A.points[i+1],p),q=B.points[j],s=sub(B.points[j+1],q),den=r.x*s.y-r.y*s.x;
      if(Math.abs(den)<EPS)continue;
      const qp=sub(q,p),t=(qp.x*s.y-qp.y*s.x)/den,u=(qp.x*r.y-qp.y*r.x)/den;
      const ta=tolerance/(len(r)||1),tb=tolerance/(len(s)||1);
      if(t<-ta||t>1+ta||u<-tb||u>1+tb)continue;
      const stA=Math.max(0,Math.min(sa[sa.length-1],sa[i]+t*len(r))),stB=Math.max(0,Math.min(sb[sb.length-1],sb[j]+u*len(s)));
      const endA=stA<tolerance||stA>sa[sa.length-1]-tolerance,endB=stB<tolerance||stB>sb[sb.length-1]-tolerance;
      if(endA&&endB)continue; // two road ends touching = a simple continuation, not handled by the spike
      const point=lerp(p,A.points[i+1],Math.max(0,Math.min(1,t)));
      const same=out.find(c=>len(sub(c.point,point))<tolerance);
      if(same){ // several roads meeting at one point form one candidate
        for(const ref of [{roadId:A.id,station:round(stA)},{roadId:B.id,station:round(stB)}])if(!same.roads.some(r=>r.roadId===ref.roadId))same.roads.push(ref);
        continue;
      }
      out.push({id:'',kind:endA||endB?'tee':'cross',point,roads:[{roadId:A.id,station:round(stA)},{roadId:B.id,station:round(stB)}]});
    }
  }
  return withStableIds(out);
}

/** Crossing id from the roads that meet there plus its order along the first road, so unrelated edits keep it. */
function withStableIds(list:Candidate[]){
  const groups=new Map<string,Candidate[]>();
  for(const c of list){const key=c.roads.map(r=>r.roadId).sort().join('+');groups.set(key,[...(groups.get(key)??[]),c]);}
  for(const [key,group] of groups){
    const lead=key.split('+')[0],at=(c:Candidate)=>c.roads.find(r=>r.roadId===lead)!.station;
    group.sort((a,b)=>at(a)-at(b)).forEach((c,k)=>{c.id=`C-${key}-${k+1}`;});
  }
  return list;
}

/** Section at a road end derived from the road; "outgoing" travels from the end into the road. */
export function endSection(road:Road,atStart:boolean):RoadEndSection{
  const s=road.section,lane={width:s.laneWidth,walk:s.walk,bands:structuredClone(s.bands??[])};
  return{incoming:atStart?s.backwardLanes:s.forwardLanes,outgoing:atStart?s.forwardLanes:s.backwardLanes,median:s.median,width:s.laneWidth,walk:s.walk,bands:structuredClone(s.bands??[]),incomingSection:{...lane,bands:structuredClone(lane.bands)},outgoingSection:{...lane,bands:structuredClone(lane.bands)}};
}

export function sectionArm(base:Arm,road:Road,side:'ahead'|'behind',angle:number,length:number,name:string):Arm{
  const s=road.section,bands=s.bands??[];
  // Leg pointing along the road's direction: traffic leaving the junction travels forward.
  const outgoing=side==='ahead'?s.forwardLanes:s.backwardLanes,incoming=side==='ahead'?s.backwardLanes:s.forwardLanes;
  const section={width:s.laneWidth,walk:s.walk,bands:structuredClone(bands)};
  const arm:Arm={...structuredClone(base),name,angle:round(angle,4),length:round(length,3),incoming,outgoing,width:s.laneWidth,walk:s.walk,bands:structuredClone(bands),median:s.median,
    incomingSection:{...section},outgoingSection:structuredClone(section),incomingPockets:undefined,outgoingPockets:undefined,laneMarkings:undefined,arrowOverrides:undefined};
  if(!incoming){arm.crossing=false;arm.signal=false;arm.stop=false;}
  return {...arm,laneMarkings:markingsFor(arm)};
}

/** available: preferred arm length; room: longest straight arm that still leaves the road's next bend or junction clear. */
type Leg={roadId:string;side:'ahead'|'behind';heading:number;available:number;room:number};

/** Compile roads + explicit decisions onto the existing Network model. */
type PairEnd={r:Road;ref:{roadId:string;station:number};z:number};
/** One grade-separated pair of roads: which is on top, the measured clearance and the structure extents (road stations). */
export type CrossingPair={d:Decision;c:Candidate;ra:Road;rb:Road;top:PairEnd|null;bottom:PairEnd|null;gap:number;relation:'over'|'unresolved';
  clearance?:ClearanceMeasure;deckSpan?:[number,number];tunnelSpan?:[number,number]};

/**
 * Grade-separated pairs of a project. A crossing of three or more roads at different levels (a stack) gives one pair per
 * two roads; a road that passes over or under a junction gives one pair with each road of the junction.
 */
function crossingPairs(roads:Road[],decisions:Decision[],byId:Map<string,Candidate>,roadById:Map<string,Road>,criteria:LevelCriteria):CrossingPair[]{
  const out:CrossingPair[]=[],margin=STRUCTURE_MARGIN;
  const add=(d:Decision,c:Candidate,a:{roadId:string;station:number},b:{roadId:string;station:number},chosen:string|undefined)=>{
    const ra=roadById.get(a.roadId),rb=roadById.get(b.roadId);if(!ra||!rb)return;
    const za=levelAt(ra.profile,a.station),zb=levelAt(rb.profile,b.station);
    const over=chosen===ra.id||chosen===rb.id?chosen:Math.abs(za-zb)>LEVEL_TOLERANCE?(za>zb?ra.id:rb.id):undefined;
    const top=over===ra.id?{r:ra,ref:a,z:za}:over===rb.id?{r:rb,ref:b,z:zb}:null,bottom=top?(top.r===ra?{r:rb,ref:b,z:zb}:{r:ra,ref:a,z:za}):null;
    const gap=top&&bottom?round(top.z-bottom.z,2):0,relation=top&&gap>LEVEL_TOLERANCE?'over' as const:'unresolved' as const;
    // Measure the actual overlap footprint: deck section on the upper bridge,
    // tunnel section on the lower tunneled road. Ground over a tunnel remains unchanged.
    const tunnel=!!bottom&&bottom.z<-LEVEL_TOLERANCE;
    const effective=(end:PairEnd)=>({...end.r,section:(tunnel?end===bottom:end===top)?structureRoadSection(end.r):end.r.section});
    const clearance=relation==='over'&&top&&bottom?measureClearance(effective(top),effective(bottom),top.ref.station,bottom.ref.station,criteria):undefined;
    // Structure extents: the measured overlap plus an abutment / portal margin (display, tool value).
    const extent=(on:PairEnd,other:PairEnd,span:[number,number]|undefined):[number,number]=>{const half=sectionWidth(other.r.section)/2+margin,len=stations(on.r.points,on.r.alignment).at(-1)??0;
      return[Math.max(0,span?span[0]-margin:on.ref.station-half),Math.min(len,span?span[1]+margin:on.ref.station+half)];};
    const deckSpan=top&&bottom?extent(top,bottom,clearance?.spanOver):undefined;
    const tunnelSpan=top&&bottom&&bottom.z<-LEVEL_TOLERANCE?extent(bottom,top,clearance?.spanUnder):undefined;
    out.push({d,c,ra,rb,top,bottom,gap,relation,...(clearance?{clearance}:{}),...(deckSpan?{deckSpan}:{}),...(tunnelSpan?{tunnelSpan}:{})});
  };
  for(const d of decisions){
    const c=byId.get(d.candidateId);if(!c||c.roads.length<2)continue;
    if(d.decision==='grade-separated'){
      if(c.roads.length===2){add(d,c,c.roads[0],c.roads[1],d.over);continue;}
      for(let i=0;i<c.roads.length;i++)for(let k=i+1;k<c.roads.length;k++)add(d,c,c.roads[i],c.roads[k],undefined);
    }else if(d.decision==='junction'&&d.excluded?.length){
      const inJunction=c.roads.filter(r=>!d.excluded!.includes(r.roadId)),zj=inJunction.map(r=>levelAt(roadById.get(r.roadId)?.profile,r.station));
      const mean=zj.reduce((t,v)=>t+v,0)/(zj.length||1);
      for(const x of c.roads.filter(r=>d.excluded!.includes(r.roadId))){
        if(Math.abs(levelAt(roadById.get(x.roadId)?.profile,x.station)-mean)<=LEVEL_TOLERANCE)continue;
        for(const r of inJunction)add(d,c,x,r,undefined);
      }
    }
  }
  return out;
}

export function compileRoadNetwork(roads:Road[],decisions:Decision[],options:CompileOptions={}):CompileResult{
  const approach=options.approachLength??40,tolerance=options.tolerance??1,issues:string[]=[];
  const candidates=detectCandidates(roads,tolerance),byId=new Map(candidates.map(c=>[c.id,c]));
  const unjoined:Record<string,string[]>={},overflow:string[]=[],shortfalls:ArmShortfall[]=[];
  const confirmed=decisions.filter(d=>d.decision==='junction').map(d=>{
    const c=byId.get(d.candidateId);
    const left=c&&d.roads?c.roads.map(r=>r.roadId).filter(id=>!d.roads!.includes(id)&&!d.excluded?.includes(id)):[];
    if(left.length){unjoined[d.candidateId]=left;const names=left.map(id=>roads.find(r=>r.id===id)?.name??id).join(', ');issues.push(`${d.name??d.candidateId}: ถนน ${names} ผ่านหรือมาจบที่ทางแยกนี้แต่ไม่ได้เชื่อมเข้าทางแยก`);}
    return{d,c:c&&d.roads?{...c,roads:c.roads.filter(r=>d.roads!.includes(r.roadId))}:c};
  }).filter((v):v is {d:Decision;c:Candidate}=>{
    // A decision set aside while its roads do not cross ("dormant:" id) is kept quietly until they cross again.
    if(!v.c){if(!v.d.candidateId.startsWith('dormant:'))issues.push(`ไม่พบจุดตัดที่เสนอ ${v.d.candidateId}`);return false;}
    if(v.c.roads.length<2){issues.push(`${v.d.name??v.d.candidateId}: ถนนที่เลือกให้มาบรรจบกันมีไม่ถึงสองสาย`);return false;}
    return true;
  });
  for(const c of candidates)if(!decisions.some(d=>d.candidateId===c.id))issues.push(`จุดตัด ${c.id} ยังไม่ได้ยืนยัน`);
  // Crossings are found on the straight lines between road points; one inside an arc is reported, not moved.
  for(const c of candidates)for(const ref of c.roads){
    const road=roads.find(r=>r.id===ref.roadId);if(!road)continue;
    const arc=road.alignment==='arc'?undefined:curveRanges(road.points,stations(road.points,road.alignment)).find(a=>ref.station>a.from+EPS&&ref.station<a.to-EPS);
    if(arc)issues.push(`${road.name}: จุดตัดอยู่ในช่วงโค้งที่จุดแนวถนนที่ ${arc.index+1} — ตำแหน่งจุดตัดคิดจากแนวเส้นตรง ลดรัศมีหรือย้ายจุดตัดออกจากช่วงโค้ง`);
  }
  const roadById=new Map(roads.map(r=>[r.id,r]));
  // Junction stations per road, sorted.
  const onRoad=new Map<string,{station:number;jIndex:number}[]>();
  confirmed.forEach(({c},jIndex)=>c.roads.forEach(r=>{const list=onRoad.get(r.roadId)??[];list.push({station:r.station,jIndex});onRoad.set(r.roadId,list);}));
  onRoad.forEach(list=>list.sort((a,b)=>a.station-b.station));

  /** Straight approach zone for a leg. A short straight tail is absorbed into the arm; otherwise the road continues as a link. */
  // A curved vertex keeps the arm clear of its arc too (clearance = the larger of the bend clearance and the arc's tangent).
  const legLength=(toNextJunction:number|null,toRoadEnd:number,toVertex:number,vertexIsRoadEnd:boolean,clear=BEND_CLEARANCE)=>{
    if(toNextJunction!==null)return Math.min(approach,(toNextJunction-MIN_LINK)/2,vertexIsRoadEnd?toVertex:Math.max(toVertex-clear,toVertex/2));
    if(vertexIsRoadEnd&&toRoadEnd<=approach+SHORT_TAIL)return toRoadEnd;
    return Math.min(approach,vertexIsRoadEnd?toRoadEnd:Math.max(toVertex-clear,toVertex/2));
  };
  const legRoom=(toNextJunction:number|null,toRoadEnd:number,toVertex:number,vertexIsRoadEnd:boolean,clear=BEND_CLEARANCE)=>
    Math.min(toNextJunction===null?Infinity:(toNextJunction-MIN_LINK)/2,vertexIsRoadEnd?toRoadEnd:toVertex-clear);
  const clearAt=(road:Road,i:number)=>Math.max(BEND_CLEARANCE,vertexCurve(road.points,i)?.tangent??0);
  const sources:CompileSources={junctions:{},links:{}};
  const junctions:JunctionInstance[]=[],legs:LegBinding[]=[],armLength=new Map<string,number>();
  confirmed.forEach(({d,c},jIndex)=>{
    const id=`J-${jIndex+1}`,found:Leg[]=[];
    for(const ref of c.roads){
      const road=roadById.get(ref.roadId)!,s=stations(road.points,road.alignment),total=s[s.length-1],list=onRoad.get(road.id)!,k=list.findIndex(v=>v.jIndex===jIndex);
      const next=list[k+1],prev=list[k-1],solved=road.alignment==='arc'?resolveAlignment(road.points):null;
      const curveRoom=(ahead:boolean)=>{const pc=solved?.pieceAt(ref.station,ahead);return pc?.kind==='arc'?0:pc?(ahead?pc.start+pc.length-ref.station:ref.station-pc.start):Infinity;};
      if(ref.station<total-tolerance){
        const seg=segmentAt(road.points,ref.station,true,road.alignment),vertex=s[seg+1],toEnd=total-ref.station,clear=clearAt(road,seg+1);
        found.push({roadId:road.id,side:'ahead',heading:headingDeg(solved?.tangentAt(ref.station)??sub(road.points[seg+1],road.points[seg])),available:legLength(next?next.station-ref.station:null,toEnd,vertex-ref.station,vertex>=total-EPS,clear),room:Math.min(curveRoom(true),legRoom(next?next.station-ref.station:null,toEnd,vertex-ref.station,vertex>=total-EPS,clear))});
      }
      if(ref.station>tolerance){
        const seg=segmentAt(road.points,ref.station,false,road.alignment),vertex=s[seg],clear=clearAt(road,seg);
        found.push({roadId:road.id,side:'behind',heading:headingDeg(solved?{x:-solved.tangentAt(ref.station,false).x,y:-solved.tangentAt(ref.station,false).y}:sub(road.points[seg],road.points[seg+1])),available:legLength(prev?ref.station-prev.station:null,ref.station,ref.station-vertex,vertex<=EPS,clear),room:Math.min(curveRoom(false),legRoom(prev?ref.station-prev.station:null,ref.station,ref.station-vertex,vertex<=EPS,clear))});
      }
    }
    if(found.length>4){issues.push(`${d.name??id}: มี ${found.length} ขา · ตอนนี้ทางแยกรองรับสูงสุด 4 ขา ขาที่เกินจึงไม่ได้สร้าง`);overflow.push(d.candidateId);found.length=4;}
    found.sort((a,b)=>a.heading-b.heading);
    const base=initial(),arms:Arm[]=[],enabled:boolean[]=[],room=new Map<number,number>();
    for(let i=0;i<4;i++){
      const leg=found[i];
      if(!leg){arms.push({...base.arms[i],angle:round((((found.length?found[found.length-1].heading:0)+90*(i-found.length+1))%360+360)%360,4)});enabled.push(false);continue;}
      const road=roadById.get(leg.roadId)!;
      const key=legKey(leg.roadId,leg.side),approachZone=d.treatments?.approaches?.[key];
      const derived=sectionArm(base.arms[i],road,leg.side,leg.heading,leg.available,`${road.name}${leg.side==='ahead'?' →':' ←'}`);
      // Access junction (concept defaults, overridable per leg): the through road keeps flowing; the access gives way.
      if(road.roadside){const side={...roadsideDefaults(),trees:road.roadside.trees,lights:road.roadside.lights};derived.roadside={incoming:{...side},outgoing:{...side}};}
      if(found.some(l=>roadById.get(l.roadId)?.role==='access')){
        derived.crossing=false;derived.signal=false;
        if(road.role!=='access')derived.stop=false;
      }
      arms.push(applyLegTreatment(applyApproach(derived,approachZone),d.treatments?.legs?.[key]??{}));
      enabled.push(true);
      // An authored approach length is kept as is; only a fit shortfall stretches it (and is reported).
      legs.push({junctionId:id,armId:i,roadId:leg.roadId,side:leg.side});room.set(i,approachZone?.length??leg.room);
    }
    let design:Design={...base,...structuredClone(d.treatments?.design??{}),arms,enabled,corner:d.treatments?.corner??base.corner,title:d.treatments?.design?.title??d.name??`ทางแยก ${jIndex+1}`};
    // Re-bind treatments by road leg (stable across recompiles), not by arm slot.
    const armOf=(key:LegKey)=>{const leg=parseLegKey(key);return leg?legs.find(l=>l.junctionId===id&&l.roadId===leg.roadId&&l.side===leg.side)?.armId:undefined;};
    const legLabel=(key:LegKey)=>{const leg=parseLegKey(key),road=leg&&roadById.get(leg.roadId);return road?`${road.name} ${leg!.side==='ahead'?'→':'←'}`:key;};
    for(const key of [...Object.keys(d.treatments?.legs??{}),...Object.keys(d.treatments?.approaches??{})] as LegKey[])if(armOf(key)===undefined)issues.push(`${id}: การตั้งค่าขา ${legLabel(key)} อ้างขาถนนที่ไม่มีแล้ว`);
    const slips:SlipLane[]=[];
    for(const t of d.treatments?.slips??[]){
      const from=armOf(t.from);
      if(from===undefined){issues.push(`${id}: Slip lane อ้างขาถนน ${legLabel(t.from)} ที่ไม่มีแล้ว`);continue;}
      const active=enabled.map((v,i)=>v?i:-1).filter(i=>i>=0),to=t.to?armOf(t.to):active[(active.indexOf(from)+1)%active.length];
      if(to===undefined||to===from){issues.push(`${id}: Slip lane ไม่มีขารับ`);continue;}
      if(to!==nextActiveArm({enabled,arms},from)){issues.push(`${id}: Slip lane จาก ${legLabel(t.from)} ไม่ได้อยู่ติดกับขารับแล้วหลังแก้ถนน จึงไม่ได้สร้าง`);continue;}
      const slip:SlipLane=defaultSlip(from,to,t.width,t.radius);
      if(t.approach)slip.approach=structuredClone(t.approach);
      if(t.departure)slip.departure=structuredClone(t.departure);
      if(t.crossing)slip.crossing={...t.crossing};
      if(t.arrowOffset!==undefined)slip.arrowOffset=t.arrowOffset;
      slips.push(slip);
    }
    design={...design,slips};
    const radii=Object.entries(d.treatments?.cornerRadii??{}) as [LegKey,number][];
    if(radii.length){
      const list:(number|null)[]=[null,null,null,null];
      for(const [key,r] of radii){const arm=armOf(key);if(arm===undefined){issues.push(`${d.name??id}: รัศมีมุมอ้างขาถนน ${legLabel(key)} ที่ไม่มีแล้ว`);continue;}list[arm]=r;}
      design={...design,cornerRadii:list};
    }
    // Fit-based arm length: an arm needs only what it carries. A leg too short for that is stretched and reported.
    for(const leg of legs.filter(l=>l.junctionId===id)){
      const road=roadById.get(leg.roadId)!,arm=design.arms[leg.armId],required=Math.ceil(requiredArmLength(design,leg.armId)*1000)/1000;
      if(arm.length<required-EPS){
        design.arms[leg.armId]={...arm,length:required};
        // Lengthening within the straight part of the road keeps the arm on the alignment.
        if(required<=room.get(leg.armId)!+EPS){armLength.set(`${id}:${leg.armId}`,required);continue;}
        shortfalls.push({candidateId:d.candidateId,junctionId:id,armId:leg.armId,roadId:road.id,side:leg.side,room:Math.max(0,room.get(leg.armId)!),required});
        issues.push(`${d.name??id}: ขา ${road.name} ${leg.side==='ahead'?'→':'←'} มีช่วงตรง ${Math.max(0,room.get(leg.armId)!).toFixed(1)} ม. แต่ขานี้ต้องยาวอย่างน้อย ${required.toFixed(1)} ม. สำหรับปากทางแยกและสิ่งที่อยู่บนขา (ถูกยืดจึงไม่ตรงแนวถนน)`);
      }
      if(road.alignment==='arc'&&design.arms[leg.armId].length>room.get(leg.armId)!+EPS&&!shortfalls.some(s=>s.junctionId===id&&s.armId===leg.armId)){
        shortfalls.push({candidateId:d.candidateId,junctionId:id,armId:leg.armId,roadId:road.id,side:leg.side,room:Math.max(0,room.get(leg.armId)!),required:design.arms[leg.armId].length});
        issues.push(`${road.name}: ปากทางแยกยาวเกินช่วงตรงที่มี — ปรับแนวถนนหรือย้ายจุดตัดออกจากโค้ง`);
      }
      armLength.set(`${id}:${leg.armId}`,design.arms[leg.armId].length);
    }
    // Junction level: its roads should meet at one level; a difference is reported, not hidden (Phase 4A).
    const zs=c.roads.map(r=>levelAt(roadById.get(r.roadId)?.profile,r.station)),zMin=Math.min(...zs),zMax=Math.max(...zs);
    if(zMax-zMin>LEVEL_TOLERANCE)issues.push(`${d.name??id}: ระดับถนนต่างกัน ${(zMax-zMin).toFixed(1)} ม. ที่ทางแยก — เปลี่ยนเป็นทางต่างระดับ หรือปรับแนวดิ่งให้เท่ากัน`);
    const jz=round(zs.reduce((t,v)=>t+v,0)/(zs.length||1),3);
    junctions.push({id,name:d.name??`ทางแยก ${jIndex+1}`,x:round(c.point.x),y:round(c.point.y),rotation:0,design,...(jz?{z:jz}:{})});sources.junctions[id]=d.candidateId;
  });

  const links:RoadLink[]=[],roadEnds:RoadEnd[]=[],linkRanges:{id:string;roadId:string;from:number;to:number}[]=[];
  const addEnd=(road:Road,atStart:boolean):LinkEndRef=>{
    const pts=road.points,p=atStart?pts[0]:pts[pts.length-1],q=atStart?pts[1]:pts[pts.length-2],data=road.ends?.[atStart?'start':'end'];
    const end:RoadEnd={id:`E-${roadEnds.length+1}`,name:data?.name??`${road.name} (${atStart?'ต้นทาง':'ปลายทาง'})`,x:round(p.x),y:round(p.y),
      heading:data?.heading??round(headingDeg(sub(q,p)),6)%360,section:structuredClone(data?.section??endSection(road,atStart))};
    roadEnds.push(end);return{endId:end.id};
  };
  const linkData=(road:Road,link:RoadLink,data:RoadLinkData|undefined):RoadLink=>{
    if(!data)return link;
    const components=(data.components??[]).flatMap(c=>{
      if(c.kind!=='lane'||!c.source)return[structuredClone(c) as RoadLink['components'][number]];
      const {source:raw,...rest}=structuredClone(c),source=raw!,ref=link[source.end];
      if(!isJunctionPort(ref)){issues.push(`${road.name}: ช่องต่อเนื่องจากทางแยกบนช่วงถนนนี้ไม่มีทางแยกที่ปลายแล้ว`);return[rest as LinkStationLaneComponent];}
      return[{...rest,source:{kind:'junction-auxiliary' as const,handoffId:proposalId(link,source.end,source.direction,source.side),junctionId:ref.junctionId,armId:ref.armId,direction:source.direction,side:source.side,lane:source.lane}}];
    });
    return{...link,name:data.name??link.name,sectionProfile:structuredClone(data.sectionProfile??link.sectionProfile),components};
  };
  // Auxiliary lanes at attached ramp ends, built on their main roads like lane runs.
  const aux=auxLaneRuns(roads);
  // Grade-separated pairs, resolved before the links: which road is on top, the measured clearance and the structure
  // extents in road stations (a road's section on its structures is built along its links).
  const criteria=levelCriteria(options.levels),pairs=crossingPairs(roads,decisions,byId,roadById,criteria);
  const structures:StructureExtent[]=pairs.flatMap(p=>[
    // A road at grade over a tunnel keeps its section (the tunnel roof is not a deck to build on here).
    ...(p.top&&p.deckSpan&&!p.tunnelSpan?[{roadId:p.top.r.id,kind:'deck' as const,from:p.deckSpan[0],to:p.deckSpan[1],crossing:p.d.candidateId}]:[]),
    ...(p.bottom&&p.tunnelSpan?[{roadId:p.bottom.r.id,kind:'tunnel' as const,from:p.tunnelSpan[0],to:p.tunnelSpan[1],crossing:p.d.candidateId}]:[])]);
  for(const road of roads){
    const s=stations(road.points,road.alignment),total=s[s.length-1],list=onRoad.get(road.id)??[];
    type Node={ref:LinkEndRef;station:number};
    const nodes:{ahead?:Node;behind?:Node}[]=[];
    const first=list[0],last=list.at(-1);
    // Road start: a junction leg absorbs it, otherwise a road end node.
    if(!first||first.station>tolerance){
      const fromJunction=first?legs.find(l=>l.junctionId===`J-${first.jIndex+1}`&&l.roadId===road.id&&l.side==='behind'):undefined;
      const reach=fromJunction?first!.station-armLength.get(`${fromJunction.junctionId}:${fromJunction.armId}`)!:0;
      if(!first||reach>EPS)nodes.push({ahead:{ref:addEnd(road,true),station:0}});
    }
    for(const v of list){
      const jid=`J-${v.jIndex+1}`,ahead=legs.find(l=>l.junctionId===jid&&l.roadId===road.id&&l.side==='ahead'),behind=legs.find(l=>l.junctionId===jid&&l.roadId===road.id&&l.side==='behind');
      nodes.push({
        behind:behind?{ref:{junctionId:jid,armId:behind.armId},station:v.station-armLength.get(`${jid}:${behind.armId}`)!}:undefined,
        ahead:ahead?{ref:{junctionId:jid,armId:ahead.armId},station:v.station+armLength.get(`${jid}:${ahead.armId}`)!}:undefined,
      });
    }
    if(!last||last.station<total-tolerance){
      const toJunction=last?legs.find(l=>l.junctionId===`J-${last.jIndex+1}`&&l.roadId===road.id&&l.side==='ahead'):undefined;
      const reach=toJunction?last!.station+armLength.get(`${toJunction.junctionId}:${toJunction.armId}`)!:total;
      if(!last||reach<total-EPS)nodes.push({behind:{ref:addEnd(road,false),station:total}});
    }
    const stretchList=[...(road.sectionStretches??[]),...structureStretches(road,structures,total)];
    let span=0;const placed=new Set<string>(),placedRuns=new Set<string>(),clippedRuns=new Set<string>(),placedStretches=new Set<string>(),clippedStretches=new Set<string>();
    for(let k=0;k<nodes.length-1;k++){
      const from=nodes[k].ahead,to=nodes[k+1].behind;
      if(!from||!to){issues.push(`${road.name}: ต่อช่วงถนนไม่ได้`);continue;}
      const via=road.points.filter((_,i)=>s[i]>from.station+EPS&&s[i]<to.station-EPS).map(p=>({x:round(p.x),y:round(p.y),radius:p.radius??0}));
      sources.links[`L-${links.length+1}`]=road.id;
      const built=linkData(road,{id:`L-${links.length+1}`,name:`${road.name} ${links.length+1}`,from:from.ref,to:to.ref,via,sectionProfile:{mode:'review'},components:[]},road.links?.[span]);
      // Overlapping junction approaches have no forward slice; keep the existing port geometry and diagnostics.
      if(road.alignment==='arc'&&from.station>=0&&to.station>from.station&&to.station<=total+EPS)built.alignment={vertices:structuredClone(road.points),from:from.station,to:to.station};
      // Mid-block openings that fall wholly inside this link, in link-local stations.
      const inside=(road.openings??[]).filter(o=>o.station>=from.station-EPS&&o.station+o.length<=to.station+EPS);
      if(inside.length&&road.section.median>0)built.medianOpenings=inside.map(o=>({id:o.id,start:round(Math.max(0,o.station-from.station),3),length:o.length,...(o.type?{type:o.type}:{})}));
      for(const o of inside)placed.add(o.id);
      // Lane runs on this link: clipped to it, in link stations; the link then changes section along its length.
      for(const run of [...(road.laneRuns??[]),...(aux.get(road.id)??[])]){const c=clipRun(run,from.station,to.station);if(!c)continue;
        built.components=[...built.components,c.component];placedRuns.add(run.id);if(c.clipped)clippedRuns.add(run.id);}
      // Section stretches on this link: their added lanes and width changes, clipped to it.
      for(const x of stretchList){const parts=stretchParts(x,road.section);
        for(const c of [...parts.lanes,...parts.widths]){const k=clipPart(c,from.station,to.station);if(!k)continue;
          built.components=[...built.components,k.part];placedStretches.add(x.id);if(k.clipped)clippedStretches.add(x.id);}}
      if(built.components.some(c=>c.id.startsWith('run-')||c.id.startsWith('st-')))built.sectionProfile={...built.sectionProfile,mode:'linear'};
      if(road.roadside&&(road.roadside.trees||road.roadside.lights))built.roadside={...road.roadside};
      const levels=profileSlice(road.profile,from.station,to.station);if(levels)built.levels=levels;
      if(road.profile?.some(q=>(q.curveLength??0)>0))built.verticalAlignment={profile:structuredClone(road.profile),from:from.station,to:to.station};
      if(road.role==='ramp')built.ramp=true;
      linkRanges.push({id:built.id,roadId:road.id,from:from.station,to:to.station});
      links.push(built);
      span++;
    }
    if(road.structureSection&&!structures.some(x=>x.roadId===road.id))issues.push(`${road.name}: หน้าตัดบนโครงสร้างตั้งไว้แต่ถนนนี้ไม่มีสะพานหรืออุโมงค์ จึงไม่ได้ใช้`);
    for(const x of road.sectionStretches??[]){
      const where=`${round(x.start,0)}–${round(x.end,0)} ม.`,changes=x.forwardLanes!==road.section.forwardLanes||x.backwardLanes!==road.section.backwardLanes||Math.abs(x.walk-road.section.walk)>=.01||(x.bands??[]).some(b=>Math.abs(b.width-((road.section.bands??[]).find(y=>y.type===b.type)?.width??b.width))>=.01);
      if(!changes)issues.push(`${road.name}: หน้าตัดเฉพาะช่วง ${where} เหมือนหน้าตัดของถนน — ไม่มีอะไรเปลี่ยน`);
      else if(!placedStretches.has(x.id))issues.push(`${road.name}: หน้าตัดเฉพาะช่วง ${where} อยู่ในช่วงเข้าทางแยกหรือเลยปลายถนน จึงไม่ได้สร้าง`);
      else if(clippedStretches.has(x.id))issues.push(`${road.name}: หน้าตัดเฉพาะช่วง ${where} ถูกตัดที่ช่วงเข้าทางแยก — หน้าตัดที่ปากทางแยกยังเป็นของถนน ตรวจความต่อเนื่อง`);
    }
    for(const run of [...(road.laneRuns??[]),...(aux.get(road.id)??[])]){
      const where=`${run.id.startsWith('aux-')?'ของทางลาด ':''}${round(run.start,0)}–${round(run.end,0)} ม.`;
      if(!placedRuns.has(run.id))issues.push(`${road.name}: ช่องเพิ่ม ${where} อยู่ในช่วงเข้าทางแยกหรือเลยปลายถนน จึงไม่ได้สร้าง — ย้ายออกจากช่วงเข้าทางแยก`);
      else if(clippedRuns.has(run.id))issues.push(`${road.name}: ช่องเพิ่ม ${where} ถูกตัดที่ช่วงเข้าทางแยก — ยังไม่ได้ต่อกับช่องของทางแยก ตรวจการเชื่อมช่องจราจร`);
    }
    if(road.openings?.length&&road.section.median<=0)issues.push(`${road.name}: ไม่มีเกาะกลาง จึงไม่มีช่องเปิดเกาะกลาง ${road.openings.length} แห่งที่ตั้งไว้`);
    else for(const o of road.openings??[])if(!placed.has(o.id))issues.push(`${road.name}: ช่องเปิดเกาะกลางที่ ${round(o.station,1)} ม. อยู่ในช่วงเข้าทางแยกหรือเลยปลายถนน จึงไม่ได้สร้าง — ย้ายออกจากช่วงเข้าทางแยก หรือใช้ช่องเปิดของปากทางแทน`);
    if((road.links?.length??0)>span)issues.push(`${road.name}: มีการตั้งค่าช่วงถนน ${road.links!.length} ช่วง แต่ถนนนี้มี ${span} ช่วง`);
  }
  // Grade-separated crossings: relation and measured gap (Phase 4A). Not judged against any standard here.
  // A crossing of three or more roads at different levels (a stack) gives one crossing per pair of roads; a road that
  // passes over or under a junction gives one crossing with each road of the junction.
  const crossings:CompiledCrossing[]=[],networkCrossings:NonNullable<NetworkProject['crossings']>=[];
  // Grades steeper than the project's maximum (ramps against the ramp maximum).
  for(const road of roads){
    const p=[...(road.profile??[])].sort((a,b)=>a.station-b.station),max=gradeFor(criteria,road);
    for(let i=1;i<p.length;i++){const run=p[i].station-p[i-1].station,g=run>0?Math.abs(p[i].z-p[i-1].z)/run:0;
      if(g>max+1e-6)issues.push(`${road.name}: ความชัน ${(g*100).toFixed(1)}% ช่วง ${p[i-1].station.toFixed(0)}–${p[i].station.toFixed(0)} ม. เกินที่ตั้งไว้ ${(max*100).toFixed(1)}%${hasSource(road.role==='ramp'?criteria.rampGrade:criteria.mainGrade)?'':' (ค่ายังไม่มีแหล่งอ้างอิง)'} — ต้องตรวจตามเกณฑ์`);}
  }
  const linkAt=(roadId:string,s:number)=>linkRanges.find(l=>l.roadId===roadId&&s>=l.from-EPS&&s<=l.to+EPS)?.id;
  const pair=({d,c,ra,rb,top,bottom,gap,relation,clearance,deckSpan,tunnelSpan}:CrossingPair)=>{
    const name=top&&bottom?`${top.r.name} ข้าม ${bottom.r.name}`:`${ra.name} × ${rb.name}`;
    const id=networkCrossings.some(x=>x.id===d.candidateId)?`${d.candidateId}~${ra.id}~${rb.id}`:d.candidateId;
    crossings.push({candidateId:d.candidateId,roads:[ra.id,rb.id],point:{x:round(c.point.x),y:round(c.point.y)},relation,...(top?{over:top.r.id,under:bottom!.r.id}:{}),gap,name,...(clearance?{clearance}:{})});
    // Measured clearance against the project's value (a flag to check, never a pass / fail against a standard).
    if(clearance){
      const what=clearance.structure==='tunnel'?'หลังคาอุโมงค์':'โครงสร้างสะพาน',src=hasSource(criteria.clearance)?'':' · ค่ายังไม่มีแหล่งอ้างอิง';
      if(clearance.min===null)issues.push(`${name}: ยังวัดช่องลอดใต้${what}ไม่ได้ (แนวถนนสองสายซ้อนกันไม่ชัดเจน) — ต้องตรวจเอง`);
      else if(clearance.min<criteria.clearance.value-1e-6)issues.push(`${name}: ช่องลอดที่วัดได้ ${clearance.min.toFixed(2)} ม. (ใต้${what} ลึก ${clearance.depth} ม.) น้อยกว่าที่ตั้งไว้ ${criteria.clearance.value} ม.${src} — ต้องตรวจตามเกณฑ์`);
    }
    // Structure extents in plan (resolved with the pairs): as wide as the road's section on the structure.
    const deck=top&&deckSpan?{a:pointAt(top.r.points,deckSpan[0],top.r.alignment),b:pointAt(top.r.points,deckSpan[1],top.r.alignment),half:structureWidth(top.r)/2}:undefined;
    const tunnel=top&&bottom&&tunnelSpan?(()=>{const [sa,sb]=tunnelSpan;
      // Roof underside at each portal: the upper road level there minus the roof (falls back to the crossing level).
      const soffit=round(top.z-criteria.tunnelRoof.value,3);
      return{a:pointAt(bottom.r.points,sa,bottom.r.alignment),b:pointAt(bottom.r.points,sb,bottom.r.alignment),half:structureWidth(bottom.r)/2,z:round(bottom.z,3),
        za:round(levelAt(bottom.r.profile,sa),3),zb:round(levelAt(bottom.r.profile,sb),3),soffit};})():undefined;
    networkCrossings.push({id,name,point:{x:round(c.point.x),y:round(c.point.y)},relation,gap,...(tunnel?{tunnel}:{}),
      ...(clearance?{clearance:{min:clearance.min,structure:clearance.structure,depth:clearance.depth,...(clearance.at?{at:clearance.at}:{})}}:{}),
      ...(top?{overLink:linkAt(top.r.id,top.ref.station),underLink:linkAt(bottom!.r.id,bottom!.ref.station)}:{}),...(deck?{deck}:{})});
  };
  for(const p of pairs)pair(p);
  // Ramp attachments (Phase 4B): a taper at each diverge / merge, at the main road level.
  const rampTapers:NonNullable<NetworkProject['rampTapers']>=[];
  for(const r of roads)for(const end of ['start','end'] as const){
    const a=r.anchors?.[end],main=a&&roadById.get(a.roadId);if(!a||!main)continue;
    const t=rampTerminal(main,r,end),points=t?.tieIn.length?t.tieIn:t?.gore;if(t&&points&&points.length>=3)rampTapers.push({id:`${r.id}:${end}`,points,z:round(levelAt(main.profile,a.station),3),...(t.gore.length===3?{gore:t.gore}:{})});
  }
  // Weaving: a merge followed by the next diverge on the same side, measured (no criterion here).
  for(const w of weavingSections(roads,aux)){if(w.length>2000)continue;const nm=(id:string)=>roadById.get(id)?.name??id;
    issues.push(`${nm(w.roadId)}: ทางเข้าจาก ${nm(w.merge)} ถึงทางออกไป ${nm(w.diverge)} ห่าง ${round(w.length,0)} ม.${w.connected?' · ช่องเสริมต่อเนื่อง (ช่วงทอผ้า)':''} — ต้องตรวจตามเกณฑ์`);}
  // A link whose two ends differ in a way the engine cannot change between along its length keeps its plain section; its runs are reported.
  {const base:NetworkProject={schemaVersion:5,title:'',junctions,links,parallelCorridors:[],roadEnds};
   for(const l of links){const mine=(c:{id:string})=>c.id.startsWith('run-')||c.id.startsWith('st-');if(!l.components.some(mine)||linkLinearTransitionPossible(base,l))continue;
     l.components=l.components.filter(c=>!mine(c));if(!l.components.length)l.sectionProfile={...l.sectionProfile,mode:'review'};
     issues.push(`${l.name}: หน้าตัดสองปลายช่วงนี้ต่างกัน จึงยังเพิ่มช่องตามระยะทางไม่ได้ — ทำหน้าตัดสองปลายให้ตรงกันก่อน`);}}
  for(const link of links)issues.push(...stationCompositionIssues(link));
  return {project:{schemaVersion:5,title:'Road-first spike',junctions,links,parallelCorridors:[],roadEnds,...(networkCrossings.length?{crossings:networkCrossings,structure:{deckDepth:criteria.deckDepth.value,tunnelRoof:criteria.tunnelRoof.value}}:{}),...(rampTapers.length?{rampTapers}:{})},legs,issues,sources,unjoined,overflow,shortfalls,crossings,linkRanges,structures};
}
