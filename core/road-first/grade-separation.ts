// Phase 4A — choosing which road passes over at a grade-separated crossing (docs/spec/PHASE_4A_ELEVATION.md).
// One command sets the relation and the profiles together, so one undo reverts both.
import type {RoadFirstCommand} from './commands';
import {detectCandidates} from './derive';
import {LEVEL_TOLERANCE,RISE_DEFAULTS,flattenAround,levelAt,riseProfile,sectionWidth,type Profile} from './elevation';
import type {RoadFirstProject} from './project';
import {roadLength} from './road-openings';

/**
 * Make `overId` pass over the other road at this crossing. If it is not already higher, it gets a rise (tool starting
 * values, editable); if the other road was the one marked over, its points around the crossing are removed again.
 */
export function overCommand(project:RoadFirstProject,candidateId:string,overId:string):{cmd:RoadFirstCommand}|{error:string}{
  const c=detectCandidates(project.roads).find(x=>x.id===candidateId);if(!c)return{error:'ไม่พบจุดตัดนี้'};
  const overRef=c.roads.find(r=>r.roadId===overId),underRef=c.roads.find(r=>r.roadId!==overId);
  const over=project.roads.find(r=>r.id===overId),under=underRef&&project.roads.find(r=>r.id===underRef.roadId);
  if(!overRef||!over||!under||!underRef)return{error:'ถนนนี้ไม่ได้อยู่ที่จุดตัดนี้'};
  const d=project.decisions.find(x=>x.candidateId===candidateId),profiles:Record<string,Profile|null>={};
  const zUnder=levelAt(under.profile,underRef.station),top=sectionWidth(under.section)+2*RISE_DEFAULTS.margin;
  // The previous over road loses its generated rise (points within the rise around this crossing).
  if(d?.over===under.id&&under.profile?.length){
    const extent=(sectionWidth(over.section)+2*RISE_DEFAULTS.margin)/2+RISE_DEFAULTS.height/RISE_DEFAULTS.grade;
    const flat=flattenAround(under.profile,underRef.station,extent);profiles[under.id]=flat.length?flat:null;
  }
  const baseUnder=profiles[under.id]===undefined?zUnder:levelAt(profiles[under.id]??undefined,underRef.station);
  if(levelAt(over.profile,overRef.station)-baseUnder<=LEVEL_TOLERANCE)profiles[over.id]=riseProfile(over.profile,overRef.station,baseUnder,top,RISE_DEFAULTS.height,RISE_DEFAULTS.grade,roadLength(over));
  return{cmd:{type:'crossing.setOver',candidateId,over:over.id,profiles,label:`${over.name} ข้าม ${under.name}`}};
}
