// Advanced junction editing from the road-first workspace (roadmap Phase 3 slice 6, staged).
// /design hands one junction of one scenario to the junction editor (/junction) for the settings it does
// not offer in place yet (3D, crossings and signals, roundabout, median openings, markings, advanced Slip).
// The editor writes its edits into the hand-off only; /design reads them back with captureTreatments()
// (ADR-0002, limit L5) as one undoable command. The earlier Network data is never touched.
import {activeNetworkProject,createNetworkScenarioWorkspace,normalizeNetworkScenarioWorkspace,type NetworkScenarioWorkspace} from '../network/network-scenarios';
import type {RoadFirstCommand} from './commands';
import type {JunctionTreatments} from './derive';
import {captureTreatments} from './leg-treatments';
import {compileRoadFirstProject,normalizeRoadFirstProject,type RoadFirstProject} from './project';

export const DESIGN_HANDOFF_STORAGE='thai-street-design-junction-handoff-v1';
export type JunctionHandoff={kind:'design-junction-handoff';version:1;scenarioId:string;candidateId:string;junctionId:string;snapshot:RoadFirstProject;network:NetworkScenarioWorkspace};

export function createHandoff(project:RoadFirstProject,scenarioId:string,candidateId:string):JunctionHandoff|null{
  const compiled=compileRoadFirstProject(project);
  const junctionId=Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===candidateId);
  if(!junctionId)return null;
  return{kind:'design-junction-handoff',version:1,scenarioId,candidateId,junctionId,snapshot:structuredClone(project),network:createNetworkScenarioWorkspace(compiled.project)};
}

/** Null when absent or unreadable (the caller then leaves storage as it is). */
export function readHandoff(raw:string|null):JunctionHandoff|null{
  if(!raw)return null;
  try{
    const v=JSON.parse(raw) as Partial<JunctionHandoff>;
    if(v?.kind!=='design-junction-handoff'||v.version!==1||typeof v.scenarioId!=='string'||typeof v.candidateId!=='string'||typeof v.junctionId!=='string')return null;
    return{kind:v.kind,version:1,scenarioId:v.scenarioId,candidateId:v.candidateId,junctionId:v.junctionId,snapshot:normalizeRoadFirstProject(v.snapshot),network:normalizeNetworkScenarioWorkspace(v.network)};
  }catch{return null;}
}

/** Order-independent comparison (stored settings may list the same keys in a different order). */
const canon=(v:unknown):unknown=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v as object).sort().map(k=>[k,canon((v as Record<string,unknown>)[k])])):v;
const same=(a:unknown,b:unknown)=>JSON.stringify(canon(a??null))===JSON.stringify(canon(b??null));

/**
 * The command that brings the junction editor's edits back into the scenario, or null with a message when
 * there is nothing to apply. Edits are read against the roads as they were when the junction was handed off.
 */
export function handoffCommand(h:JunctionHandoff,current:RoadFirstProject):{cmd:RoadFirstCommand|null;message:string;issues:string[]}{
  const captured=captureTreatments(h.snapshot.roads,h.snapshot.decisions,activeNetworkProject(h.network),h.snapshot.options);
  const edited=captured.decisions.find(d=>d.candidateId===h.candidateId),now=current.decisions.find(d=>d.candidateId===h.candidateId);
  if(!edited||!now||now.decision!=='junction')return{cmd:null,message:'ทางแยกที่ส่งไปแก้ไม่มีในแบบแล้ว จึงไม่ได้นำค่ากลับมา',issues:captured.issues};
  const treatments:JunctionTreatments|undefined=edited.treatments;
  if(same(treatments,now.treatments))return{cmd:null,message:'ไม่มีการเปลี่ยนแปลงจากหน้าแก้ทางแยกขั้นสูง',issues:captured.issues};
  const issues=[...captured.issues];
  if(!same(h.snapshot.roads,current.roads))issues.push('ถนนถูกแก้หลังส่งทางแยกไปแก้ ตรวจทางแยกนี้อีกครั้ง');
  return{cmd:{type:'junction.setTreatments',candidateId:h.candidateId,treatments},message:'',issues};
}
