// Junction ↔ roundabout in /design (UX closure before 4A, junction focus slice). The conversion is the engine's own
// roundaboutDesign(); road-owned values (lanes, median, widths) stay with the roads, so only junction-owned changes are
// kept, captured as leg treatments like an advanced-editor edit. Converting back drops the values the conversion set.
import {roundaboutDesign} from '../junction/model';
import type {RoadFirstCommand} from './commands';
import {captureTreatments} from './leg-treatments';
import {compileRoadFirstProject,type RoadFirstProject} from './project';
import type {JunctionTreatments} from './derive';

/** Leg fields the conversion sets; removing them returns each approach to its ordinary-junction default. */
const ROUNDABOUT_LEG_FIELDS=['medianOffset','crossOffset','signal','stop','arrows','laneMarkings','arrowOverrides'] as const;

export function toRoundabout(project:RoadFirstProject,candidateId:string):{cmd:RoadFirstCommand}|{error:string}{
  const compiled=compileRoadFirstProject(project);
  const jid=Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===candidateId);
  const j=compiled.project.junctions.find(x=>x.id===jid);
  if(!j)return{error:'ไม่พบทางแยกนี้'};
  if(j.design.type==='roundabout')return{error:'ทางแยกนี้เป็นวงเวียนอยู่แล้ว'};
  const next=roundaboutDesign(j.design);
  // Keep road-owned values as drawn: the roundabout follows the roads, not the other way round.
  next.arms=next.arms.map((a,i)=>({...a,median:j.design.arms[i].median,incoming:j.design.arms[i].incoming,outgoing:j.design.arms[i].outgoing}));
  const edited={...compiled.project,junctions:compiled.project.junctions.map(x=>x.id===jid?{...x,design:next}:x)};
  const captured=captureTreatments(project.roads,project.decisions,edited,project.options);
  const d=captured.decisions.find(x=>x.candidateId===candidateId);
  if(!d)return{error:'ไม่พบทางแยกนี้'};
  return{cmd:{type:'junction.setTreatments',candidateId,treatments:d.treatments,label:'เปลี่ยนเป็นวงเวียน'}};
}

export function toJunction(project:RoadFirstProject,candidateId:string):{cmd:RoadFirstCommand}|{error:string}{
  const d=project.decisions.find(x=>x.candidateId===candidateId);
  if(!d||d.decision!=='junction')return{error:'ไม่พบทางแยกนี้'};
  const t:JunctionTreatments=structuredClone(d.treatments??{});
  if(t.design){delete t.design.type;delete t.design.roundabout;delete t.design.radius;delete t.design.ring;delete t.design.circulation;if(!Object.keys(t.design).length)delete t.design;}
  for(const [key,leg] of Object.entries(t.legs??{})){
    for(const f of ROUNDABOUT_LEG_FIELDS)delete (leg as Record<string,unknown>)[f];
    if(!Object.keys(leg??{}).length)delete t.legs![key as keyof typeof t.legs];
  }
  return{cmd:{type:'junction.setTreatments',candidateId,treatments:Object.keys(t).length?t:undefined,label:'เปลี่ยนเป็นทางแยกปกติ'}};
}
