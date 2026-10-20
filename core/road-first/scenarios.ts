// Scenarios for the road-first workspace (roadmap Phase 3 slice 5): "สภาพเดิม" (Existing) plus
// alternatives "ทางเลือก A, B…" (docs/GLOSSARY.md). Each scenario is a complete RoadFirstProject.
// Stored and saved as one workspace; a single stored project (earlier saves) opens as Existing only.
import {migrateNetworkProject} from './migrate';
import {normalizeRoadFirstProject,type RoadFirstProject} from './project';
import type {NetworkScenarioWorkspace} from '../network/network-scenarios';

export type RoadFirstScenarioKind='existing'|'alternative';
export type RoadFirstScenario={id:string;name:string;kind:RoadFirstScenarioKind;sourceScenarioId?:string;project:RoadFirstProject};
export type RoadFirstWorkspace={kind:'road-first-workspace';workspaceVersion:1;activeScenarioId:string;scenarios:RoadFirstScenario[]};
export type ScenarioEdit={workspace:RoadFirstWorkspace;error:string|null;scenario?:RoadFirstScenario;note?:string};

export const SCENARIO_LIMIT=8;
export const EXISTING_NAME='สภาพเดิม';

export function createWorkspace(project:RoadFirstProject):RoadFirstWorkspace{
  return{kind:'road-first-workspace',workspaceVersion:1,activeScenarioId:'existing',scenarios:[{id:'existing',name:EXISTING_NAME,kind:'existing',project:structuredClone(project)}]};
}
export const activeScenario=(w:RoadFirstWorkspace)=>w.scenarios.find(s=>s.id===w.activeScenarioId)??w.scenarios[0]!;
export const existingScenario=(w:RoadFirstWorkspace)=>w.scenarios.find(s=>s.kind==='existing')??w.scenarios[0]!;
/** The scenario an alternative is compared with: the one it was copied from, else Existing. */
export function referenceScenario(w:RoadFirstWorkspace,id=w.activeScenarioId){
  const s=w.scenarios.find(x=>x.id===id);if(!s||s.kind==='existing')return null;
  return w.scenarios.find(x=>x.id===s.sourceScenarioId)??existingScenario(w);
}
export function replaceScenarioProject(w:RoadFirstWorkspace,id:string,project:RoadFirstProject):RoadFirstWorkspace{
  return{...w,scenarios:w.scenarios.map(s=>s.id===id?{...s,project}:s)};
}
export function switchScenario(w:RoadFirstWorkspace,id:string):RoadFirstWorkspace{
  return w.scenarios.some(s=>s.id===id)?{...w,activeScenarioId:id}:w;
}
const sameName=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
function nextName(w:RoadFirstWorkspace){
  for(let i=0;i<26;i++){const name=`ทางเลือก ${String.fromCharCode(65+i)}`;if(!w.scenarios.some(s=>sameName(s.name,name)))return name;}
  let n=1;while(w.scenarios.some(s=>sameName(s.name,`ทางเลือก ${n}`)))n++;return `ทางเลือก ${n}`;
}
/** Copy a scenario (default: the active one) as a new alternative and make it active. */
export function duplicateScenario(w:RoadFirstWorkspace,sourceId=w.activeScenarioId):ScenarioEdit{
  if(w.scenarios.length>=SCENARIO_LIMIT)return{workspace:w,error:`มีทางเลือกได้ไม่เกิน ${SCENARIO_LIMIT} รายการ`};
  const source=w.scenarios.find(s=>s.id===sourceId);if(!source)return{workspace:w,error:'ไม่พบทางเลือกต้นทาง'};
  const ids=new Set(w.scenarios.map(s=>s.id));let n=1;while(ids.has(`alt-${n}`))n++;
  const scenario:RoadFirstScenario={id:`alt-${n}`,name:nextName(w),kind:'alternative',sourceScenarioId:source.id,project:structuredClone(source.project)};
  return{workspace:{...w,activeScenarioId:scenario.id,scenarios:[...w.scenarios,scenario]},scenario,error:null};
}
export function renameScenario(w:RoadFirstWorkspace,id:string,name:string):ScenarioEdit{
  const s=w.scenarios.find(x=>x.id===id),label=name.trim();if(!s)return{workspace:w,error:'ไม่พบทางเลือก'};
  if(!label||label.length>60)return{workspace:w,error:'ชื่อทางเลือกต้องมี 1–60 ตัวอักษร'};
  if(w.scenarios.some(x=>x.id!==id&&sameName(x.name,label)))return{workspace:w,error:'ชื่อทางเลือกซ้ำกับรายการอื่น'};
  const scenario={...s,name:label};
  return{workspace:{...w,scenarios:w.scenarios.map(x=>x.id===id?scenario:x)},scenario,error:null};
}
/** Remove an alternative. Existing is the baseline and stays; alternatives copied from it fall back to Existing. */
export function removeScenario(w:RoadFirstWorkspace,id:string):ScenarioEdit{
  const s=w.scenarios.find(x=>x.id===id);if(!s)return{workspace:w,error:'ไม่พบทางเลือก'};
  if(s.kind==='existing')return{workspace:w,error:'สภาพเดิมเป็นฐานของทุกทางเลือก ลบไม่ได้'};
  const scenarios=w.scenarios.filter(x=>x.id!==id).map(x=>x.sourceScenarioId===id?{...x,sourceScenarioId:s.sourceScenarioId}:x);
  const activeScenarioId=w.activeScenarioId===id?(s.sourceScenarioId&&scenarios.some(x=>x.id===s.sourceScenarioId)?s.sourceScenarioId:scenarios.find(x=>x.kind==='existing')!.id):w.activeScenarioId;
  return{workspace:{...w,activeScenarioId,scenarios},scenario:s,error:null};
}

/** Read a stored or opened workspace; a single road-first project becomes a workspace with Existing only. */
export function normalizeWorkspace(raw:unknown):RoadFirstWorkspace{
  const v=raw as Partial<RoadFirstWorkspace>&{kind?:string}|null;
  if((v as {kind?:string}|null)?.kind==='road-first')return createWorkspace(normalizeRoadFirstProject(v));
  if(!v||v.kind!=='road-first-workspace')throw Error('ไม่ใช่ไฟล์โครงการแบบวาดถนน');
  if(typeof v.workspaceVersion!=='number'||v.workspaceVersion>1)throw Error('ไฟล์นี้มาจากรุ่นที่ใหม่กว่า ยังไม่รองรับ');
  if(!Array.isArray(v.scenarios)||v.scenarios.length<1||v.scenarios.length>SCENARIO_LIMIT)throw Error('รายการทางเลือกในไฟล์ไม่ครบ');
  const scenarios=v.scenarios.map(s=>{
    if(!s||typeof s.id!=='string'||!s.id||s.id.length>40||typeof s.name!=='string'||!s.name.trim()||s.name.length>60)throw Error('ข้อมูลทางเลือกในไฟล์ไม่ครบ');
    const out:RoadFirstScenario={id:s.id,name:s.name.trim(),kind:s.kind==='existing'?'existing':'alternative',project:normalizeRoadFirstProject(s.project)};
    if(typeof s.sourceScenarioId==='string')out.sourceScenarioId=s.sourceScenarioId;
    return out;
  });
  if(new Set(scenarios.map(s=>s.id)).size!==scenarios.length)throw Error('รหัสทางเลือกซ้ำ');
  if(new Set(scenarios.map(s=>s.name.toLowerCase())).size!==scenarios.length)throw Error('ชื่อทางเลือกซ้ำ');
  if(scenarios.filter(s=>s.kind==='existing').length!==1)throw Error('ต้องมีสภาพเดิมหนึ่งรายการ');
  const active=scenarios.some(s=>s.id===v.activeScenarioId)?v.activeScenarioId!:scenarios.find(s=>s.kind==='existing')!.id;
  return{kind:'road-first-workspace',workspaceVersion:1,activeScenarioId:active,scenarios};
}

/** Every scenario of an earlier Network-page workspace, migrated to the road-first model. */
export function migrateNetworkWorkspace(network:NetworkScenarioWorkspace):{workspace:RoadFirstWorkspace;issues:number}{
  let issues=0;
  const scenarios=network.scenarios.map(s=>{
    const m=migrateNetworkProject(s.project);issues+=m.issues.length;
    const out:RoadFirstScenario={id:s.id,name:s.kind==='existing'&&s.name==='Existing'?EXISTING_NAME:s.name,kind:s.kind,project:m.project};
    if(s.sourceScenarioId)out.sourceScenarioId=s.sourceScenarioId;
    return out;
  });
  return{workspace:{kind:'road-first-workspace',workspaceVersion:1,activeScenarioId:network.activeScenarioId,scenarios},issues};
}

/** Add scenarios from another workspace as alternatives (e.g. work left in the earlier Network page), within the limit. */
export function appendScenarios(w:RoadFirstWorkspace,incoming:RoadFirstWorkspace,suffix:string):ScenarioEdit{
  const room=SCENARIO_LIMIT-w.scenarios.length;
  if(room<1)return{workspace:w,error:`มีทางเลือกครบ ${SCENARIO_LIMIT} รายการแล้ว ลบทางเลือกที่ไม่ใช้ก่อนนำเข้า`};
  const ids=new Set(w.scenarios.map(s=>s.id)),names=new Set(w.scenarios.map(s=>s.name.trim().toLowerCase())),added:RoadFirstScenario[]=[];
  const source=existingScenario(w).id;
  for(const s of incoming.scenarios.slice(0,room)){
    let n=1;while(ids.has(`alt-${n}`))n++;const id=`alt-${n}`;ids.add(id);
    let name=`${s.name} ${suffix}`.trim().slice(0,60),k=2;while(names.has(name.toLowerCase()))name=`${s.name} ${suffix} ${k++}`.trim().slice(0,60);names.add(name.toLowerCase());
    added.push({id,name,kind:'alternative',sourceScenarioId:source,project:structuredClone(s.project)});
  }
  const skipped=incoming.scenarios.length-added.length;
  return{workspace:{...w,activeScenarioId:added[0]!.id,scenarios:[...w.scenarios,...added]},scenario:added[0],error:null,note:skipped?`ไม่ได้นำเข้า ${skipped} รายการเพราะเกินจำนวนที่รองรับ`:undefined};
}
