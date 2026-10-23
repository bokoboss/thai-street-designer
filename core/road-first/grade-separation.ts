// Flyover / underpass composer: which road passes over at a crossing, and the owned profile change that makes it so.
// One command sets the relation and the profiles together (one undo step). Parameters start from the project's level
// criteria (tool values, TO_VERIFY until sourced); the plan describes the footprint for the preview and the plan ghost.
import type {RoadFirstCommand} from './commands';
import {detectCandidates,pointAt,stations} from './derive';
import {LEVEL_TOLERANCE,RISE_DEFAULTS,levelAt,removeGenerated,riseProfile,sectionWidth,type Profile} from './elevation';
import {bridgeRise,gradeFor,levelCriteria,tunnelDepth} from './level-criteria';
import type {RoadFirstProject} from './project';
import {roadLength} from './road-openings';
import type {ClearanceMeasure} from './structure-clearance';

export type GradeKind='over'|'under';
/** Editable before placing. height: level difference wanted at the crossing (m, positive); top: level length over / under
 *  the other road (m); grade: approach grade (fraction); curve: vertical-curve length at each grade break (m, 0 = none);
 *  release: also remove the other road's untagged level points around this crossing (explicit consent). */
export type GradeParams={height?:number;top?:number;grade?:number;curve?:number;release?:boolean};
/** Where the change sits on the road (stations), for the preview and the plan ghost. */
export type GradePlan={kind:GradeKind;roadId:string;otherId:string;station:number;height:number;top:number;grade:number;curve:number;
  /** Approach start, level stretch, approach end (stations on `roadId`); absent when the road is already clear. */
  extent?:{start:number;topStart:number;topEnd:number;end:number};
  /** Road length available, and length the change needs either side of the crossing. */
  length:number;need:number;
  /** True when the road already passes over / under by the wanted relation and is not changed. */
  unchanged:boolean;
  /** Untagged points of the other road around the crossing (earlier work of unknown source) and whether they are released. */
  legacy:{roadId:string;stations:number[];released:boolean};
};
export type GradeProposal={cmd?:Extract<RoadFirstCommand,{type:'crossing.setOver'}>;error?:string;plan?:GradePlan};

/** Starting parameters for a road at a crossing (from the level criteria; never a standard). */
export function gradeDefaults(project:RoadFirstProject,candidateId:string,roadId:string,kind:GradeKind):Required<Omit<GradeParams,'release'>>|null{
  const c=detectCandidates(project.roads).find(x=>x.id===candidateId),k=levelCriteria(project.options.levels);
  const road=project.roads.find(r=>r.id===roadId),other=project.roads.find(r=>r.id===c?.roads.find(x=>x.roadId!==roadId)?.roadId);
  if(!c||!road||!other)return null;
  return{height:kind==='over'?bridgeRise(k):tunnelDepth(k),top:Math.round((sectionWidth(other.section)+2*RISE_DEFAULTS.margin)*10)/10,grade:gradeFor(k,road),curve:0};
}

const PARAM_ERROR='ค่าที่ใส่ไม่ถูกต้อง: ความต่างระดับ 0.5–30 ม. · ช่วงราบ 0–500 ม. · ความชัน 0.5–15% · โค้งดิ่ง 0–500 ม.';

export function gradeProposal(project:RoadFirstProject,candidateId:string,roadId:string,kind:GradeKind,params:GradeParams={}):GradeProposal{
  const c=detectCandidates(project.roads).find(x=>x.id===candidateId);
  if(!c||c.roads.length!==2)return{error:'เลือกจุดตัดของถนนสองสายเพื่อปรับระดับ'};
  const ref=c.roads.find(r=>r.roadId===roadId),otherRef=c.roads.find(r=>r.roadId!==roadId);
  const road=project.roads.find(r=>r.id===roadId),other=project.roads.find(r=>r.id===otherRef?.roadId);
  if(!ref||!otherRef||!road||!other)return{error:'ถนนนี้ไม่ได้อยู่ที่จุดตัดนี้'};
  const d=gradeDefaults(project,candidateId,roadId,kind)!,height=params.height??d.height,top=params.top??d.top,grade=params.grade??d.grade,curve=params.curve??d.curve;
  if(!(height>=.5&&height<=30&&top>=0&&top<=500&&grade>=.005&&grade<=.15&&curve>=0&&curve<=500))return{error:PARAM_ERROR};
  const used=new Set([...project.decisions.map(x=>x.profileOwner),...project.roads.flatMap(r=>(r.profile??[]).map(q=>q.generatedBy))]);
  let owner=project.decisions.find(x=>x.candidateId===candidateId)?.profileOwner;
  if(!owner){owner=candidateId;let suffix=2;while(used.has(owner))owner=`${candidateId}:${suffix++}`;}
  const profiles:Record<string,Profile|null>={};
  const current=removeGenerated(road.profile,owner);let otherProfile=removeGenerated(other.profile,owner);
  // Earlier rises / dips of unknown source on the other road around the crossing: kept unless the user releases them.
  const window=top/2+Math.max(height,Math.abs(levelAt(otherProfile,otherRef.station)))/Math.max(gradeFor(levelCriteria(project.options.levels),other),.005)+1;
  const raised=Math.abs(levelAt(otherProfile,otherRef.station)-levelAt(otherProfile.filter(q=>Math.abs(q.station-otherRef.station)>window),otherRef.station))>LEVEL_TOLERANCE;
  const legacyPoints=raised?otherProfile.filter(q=>!q.generatedBy&&Math.abs(q.station-otherRef.station)<=window):[];
  const release=!!params.release&&legacyPoints.length>0;
  if(release)otherProfile=otherProfile.filter(q=>!legacyPoints.includes(q));
  if(current.length!==(road.profile?.length??0))profiles[road.id]=current.length?current:null;
  if(otherProfile.length!==(other.profile?.length??0))profiles[other.id]=otherProfile.length?otherProfile:null;
  const z=levelAt(current,ref.station),base=levelAt(otherProfile,otherRef.station),gap=kind==='over'?z-base:base-z,length=roadLength(road);
  const run=Math.max(height,Math.abs(base+(kind==='over'?height:-height)-z))/grade;
  const plan:GradePlan={kind,roadId,otherId:other.id,station:ref.station,height,top,grade,curve,length,need:top/2+run+curve/2,unchanged:gap>LEVEL_TOLERANCE,
    legacy:{roadId:other.id,stations:legacyPoints.map(q=>q.station),released:release}};
  if(!plan.unchanged){
    plan.extent={start:ref.station-top/2-run,topStart:ref.station-top/2,topEnd:ref.station+top/2,end:ref.station+top/2+run};
    try{profiles[road.id]=riseProfile(current,ref.station,base,top,kind==='over'?height:-height,grade,length,owner,curve);}
    catch(error){return{error:`${road.name}: ${error instanceof Error?error.message:'ปรับแนวดิ่งไม่ได้'}`,plan};}
  }
  const label=kind==='over'?`${road.name} ข้าม ${other.name}`:`${road.name} ลอดใต้ ${other.name}`;
  return{plan,cmd:{type:'crossing.setOver',candidateId,owner,over:kind==='over'?road.id:other.id,profiles,label,
    ...(release?{release:legacyPoints.map(q=>({roadId:other.id,station:q.station}))}:{})}};
}

const legacy=(p:GradeProposal):{cmd:RoadFirstCommand}|{error:string}=>p.cmd?{cmd:p.cmd}:{error:p.error??'ปรับแนวดิ่งไม่ได้'};
/** Default proposals (starting parameters, nothing released). */
export const overCommand=(project:RoadFirstProject,candidateId:string,roadId:string)=>legacy(gradeProposal(project,candidateId,roadId,'over'));
export const underCommand=(project:RoadFirstProject,candidateId:string,roadId:string)=>legacy(gradeProposal(project,candidateId,roadId,'under'));

/** Plan ghost of a proposal: the approaches and the level stretch along the road (sampled), with the road width. */
export function gradeGhost(project:RoadFirstProject,plan:GradePlan){
  const road=project.roads.find(r=>r.id===plan.roadId);if(!road||!plan.extent)return null;
  const total=stations(road.points,road.alignment).at(-1)??0,clamp=(s:number)=>Math.max(0,Math.min(total,s));
  const run=(a:number,b:number)=>{const lo=clamp(a),hi=clamp(b),n=Math.max(1,Math.ceil((hi-lo)/4));return Array.from({length:n+1},(_,i)=>pointAt(road.points,lo+(hi-lo)*i/n,road.alignment));};
  const e=plan.extent;
  return{width:sectionWidth(road.section),approaches:[run(e.start,e.topStart),run(e.topEnd,e.end)],level:run(e.topStart,e.topEnd)};
}

/**
 * What placing a proposal would give, measured on the resulting project (the same compile as after placing):
 * the clearance under the structure and the items to check that name either road. Nothing is changed.
 */
export function gradeOutcome(project:RoadFirstProject,proposal:GradeProposal,execute:(p:RoadFirstProject,c:RoadFirstCommand)=>{project:RoadFirstProject;error:string|null},
  compile:(p:RoadFirstProject)=>{crossings:{candidateId:string;relation:string;clearance?:ClearanceMeasure}[];issues:string[]}){
  if(!proposal.cmd)return{error:proposal.error??'ปรับแนวดิ่งไม่ได้',issues:[] as string[]};
  const r=execute(project,proposal.cmd);if(r.error)return{error:r.error,issues:[] as string[]};
  const out=compile(r.project),names=[proposal.plan?.roadId,proposal.plan?.otherId].map(id=>r.project.roads.find(x=>x.id===id)?.name).filter((n):n is string=>!!n);
  const crossing=out.crossings.find(x=>x.candidateId===proposal.cmd!.candidateId&&x.relation==='over');
  return{clearance:crossing?.clearance,issues:out.issues.filter(i=>names.some(n=>i.startsWith(n)||i.includes(` ${n}`)||i.includes(`${n} `)))};
}
