// Crossing relation and owned profile changes form one transaction.
import type {RoadFirstCommand} from './commands';
import {detectCandidates} from './derive';
import {LEVEL_TOLERANCE,RISE_DEFAULTS,levelAt,removeGenerated,riseProfile,sectionWidth,type Profile} from './elevation';
import {bridgeRise,gradeFor,levelCriteria,tunnelDepth} from './level-criteria';
import type {RoadFirstProject} from './project';
import {roadLength} from './road-openings';

function propose(project:RoadFirstProject,candidateId:string,roadId:string,kind:'over'|'under'):{cmd:RoadFirstCommand}|{error:string}{
  const c=detectCandidates(project.roads).find(x=>x.id===candidateId);
  if(!c||c.roads.length!==2)return{error:'เลือกจุดตัดของถนนสองสายเพื่อปรับระดับ'};
  const ref=c.roads.find(r=>r.roadId===roadId),otherRef=c.roads.find(r=>r.roadId!==roadId);
  const road=project.roads.find(r=>r.id===roadId),other=project.roads.find(r=>r.id===otherRef?.roadId);
  if(!ref||!otherRef||!road||!other)return{error:'ถนนนี้ไม่ได้อยู่ที่จุดตัดนี้'};
  const used=new Set([...project.decisions.map(d=>d.profileOwner),...project.roads.flatMap(r=>(r.profile??[]).map(q=>q.generatedBy))]);
  let owner=project.decisions.find(d=>d.candidateId===candidateId)?.profileOwner;
  if(!owner){owner=candidateId;let suffix=2;while(used.has(owner))owner=`${candidateId}:${suffix++}`;}
  const profiles:Record<string,Profile|null>={},criteria=levelCriteria(project.options.levels);
  const current=removeGenerated(road.profile,owner),otherProfile=removeGenerated(other.profile,owner);
  if(current.length!==(road.profile?.length??0))profiles[road.id]=current.length?current:null;
  if(otherProfile.length!==(other.profile?.length??0))profiles[other.id]=otherProfile.length?otherProfile:null;
  const z=levelAt(current,ref.station),base=levelAt(otherProfile,otherRef.station),gap=kind==='over'?z-base:base-z;
  try{
    if(gap<=LEVEL_TOLERANCE)profiles[road.id]=riseProfile(current,ref.station,base,sectionWidth(other.section)+2*RISE_DEFAULTS.margin,
      kind==='over'?bridgeRise(criteria):-tunnelDepth(criteria),gradeFor(criteria,road),roadLength(road),owner);
  }catch(error){return{error:`${road.name}: ${error instanceof Error?error.message:'ปรับแนวดิ่งไม่ได้'}`};}
  return{cmd:{type:'crossing.setOver',candidateId,owner,over:kind==='over'?road.id:other.id,profiles,label:kind==='over'?`${road.name} ข้าม ${other.name}`:`${road.name} ลอดใต้ ${other.name}`}};
}
export const overCommand=(project:RoadFirstProject,candidateId:string,roadId:string)=>propose(project,candidateId,roadId,'over');
export const underCommand=(project:RoadFirstProject,candidateId:string,roadId:string)=>propose(project,candidateId,roadId,'under');
