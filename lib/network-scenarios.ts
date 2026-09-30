import {createNetworkProject,normalizeNetworkProject,type NetworkProject} from './network-project';

export type NetworkScenarioKind='existing'|'alternative';
export type NetworkScenario={
  id:string;
  name:string;
  kind:NetworkScenarioKind;
  sourceScenarioId?:string;
  project:NetworkProject;
};
export type NetworkScenarioWorkspace={
  workspaceVersion:1;
  activeScenarioId:string;
  scenarios:NetworkScenario[];
};
export type NetworkScenarioEditResult={workspace:NetworkScenarioWorkspace;scenario?:NetworkScenario;error:string|null};

export const NETWORK_SCENARIO_LIMIT=8;
const cloneProject=(project:NetworkProject):NetworkProject=>structuredClone(project);
const scenarioId=(workspace:NetworkScenarioWorkspace)=>{
  const ids=new Set(workspace.scenarios.map(s=>s.id));let n=1;
  while(ids.has(`alt-${n}`))n++;
  return `alt-${n}`;
};
const alternativeName=(workspace:NetworkScenarioWorkspace)=>{
  const names=new Set(workspace.scenarios.map(s=>s.name.trim().toLowerCase()));
  for(let i=0;i<26;i++){const name=`Alt ${String.fromCharCode(65+i)}`;if(!names.has(name.toLowerCase()))return name;}
  let n=1;while(names.has(`alternative ${n}`))n++;
  return `Alternative ${n}`;
};
const existingScenarioId=(workspace:NetworkScenarioWorkspace)=>workspace.scenarios.find(s=>s.kind==='existing')?.id??workspace.scenarios[0]?.id??'existing';

export function createNetworkScenarioWorkspace(project=createNetworkProject()):NetworkScenarioWorkspace{
  return{workspaceVersion:1,activeScenarioId:'existing',scenarios:[{id:'existing',name:'Existing',kind:'existing',project:cloneProject(project)}]};
}
export function activeNetworkScenario(workspace:NetworkScenarioWorkspace):NetworkScenario{
  return workspace.scenarios.find(s=>s.id===workspace.activeScenarioId)??workspace.scenarios[0]!;
}
export function activeNetworkProject(workspace:NetworkScenarioWorkspace):NetworkProject{
  return activeNetworkScenario(workspace).project;
}
export function replaceActiveNetworkProject(workspace:NetworkScenarioWorkspace,project:NetworkProject):NetworkScenarioWorkspace{
  const active=activeNetworkScenario(workspace);
  return{...workspace,scenarios:workspace.scenarios.map(s=>s.id===active.id?{...s,project}:s)};
}
export function switchNetworkScenario(workspace:NetworkScenarioWorkspace,id:string):NetworkScenarioWorkspace{
  return workspace.scenarios.some(s=>s.id===id)?{...workspace,activeScenarioId:id}:workspace;
}
export function duplicateNetworkScenario(workspace:NetworkScenarioWorkspace,sourceId=workspace.activeScenarioId,name?:string):NetworkScenarioEditResult{
  if(workspace.scenarios.length>=NETWORK_SCENARIO_LIMIT)return{workspace,error:`รองรับได้ไม่เกิน ${NETWORK_SCENARIO_LIMIT} scenarios`};
  const source=workspace.scenarios.find(s=>s.id===sourceId);if(!source)return{workspace,error:'ไม่พบ scenario ต้นทาง'};
  const id=scenarioId(workspace),label=(name??alternativeName(workspace)).trim();
  if(!label||label.length>60)return{workspace,error:'ชื่อ scenario ต้องมี 1–60 ตัวอักษร'};
  if(workspace.scenarios.some(s=>s.name.trim().toLowerCase()===label.toLowerCase()))return{workspace,error:'ชื่อ scenario ซ้ำ'};
  const scenario:NetworkScenario={id,name:label,kind:'alternative',sourceScenarioId:source.id,project:cloneProject(source.project)};
  return{workspace:{...workspace,activeScenarioId:id,scenarios:[...workspace.scenarios,scenario]},scenario,error:null};
}
export function renameNetworkScenario(workspace:NetworkScenarioWorkspace,id:string,name:string):NetworkScenarioEditResult{
  const scenario=workspace.scenarios.find(s=>s.id===id);if(!scenario)return{workspace,error:'ไม่พบ scenario'};
  const label=name.trim();if(!label||label.length>60)return{workspace,error:'ชื่อ scenario ต้องมี 1–60 ตัวอักษร'};
  if(workspace.scenarios.some(s=>s.id!==id&&s.name.trim().toLowerCase()===label.toLowerCase()))return{workspace,error:'ชื่อ scenario ซ้ำ'};
  const next={...scenario,name:label};
  return{workspace:{...workspace,scenarios:workspace.scenarios.map(s=>s.id===id?next:s)},scenario:next,error:null};
}
export function removeNetworkScenario(workspace:NetworkScenarioWorkspace,id:string):NetworkScenarioEditResult{
  const scenario=workspace.scenarios.find(s=>s.id===id);if(!scenario)return{workspace,error:'ไม่พบ scenario'};
  if(scenario.kind==='existing')return{workspace,error:'Existing เป็น baseline และลบไม่ได้'};
  const scenarios=workspace.scenarios.filter(s=>s.id!==id),activeScenarioId=workspace.activeScenarioId===id?existingScenarioId({...workspace,scenarios}):workspace.activeScenarioId;
  return{workspace:{...workspace,activeScenarioId,scenarios},scenario,error:null};
}
export function normalizeNetworkScenarioWorkspace(raw:unknown):NetworkScenarioWorkspace{
  if(!raw||typeof raw!=='object')throw Error('Invalid scenario workspace');
  const input=raw as Record<string,unknown>;
  if(Number(input.workspaceVersion)!==1||!Array.isArray(input.scenarios)){
    return createNetworkScenarioWorkspace(normalizeNetworkProject(raw));
  }
  if(input.scenarios.length<1||input.scenarios.length>NETWORK_SCENARIO_LIMIT)throw Error('Scenario count ไม่สมบูรณ์');
  const scenarios=input.scenarios.map(value=>{
    if(!value||typeof value!=='object')throw Error('Invalid scenario');
    const item=value as Record<string,unknown>,kind:NetworkScenarioKind=item.kind==='existing'?'existing':'alternative',
      id=String(item.id??''),name=String(item.name??''),sourceScenarioId=typeof item.sourceScenarioId==='string'?item.sourceScenarioId:undefined;
    if(!id||id.length>40||!name.trim()||name.length>60)throw Error('Scenario metadata ไม่สมบูรณ์');
    const scenario:NetworkScenario={id,name:name.trim(),kind,project:normalizeNetworkProject(item.project)};
    if(sourceScenarioId)scenario.sourceScenarioId=sourceScenarioId;
    return scenario;
  });
  if(new Set(scenarios.map(s=>s.id)).size!==scenarios.length)throw Error('Scenario id ซ้ำ');
  if(new Set(scenarios.map(s=>s.name.toLowerCase())).size!==scenarios.length)throw Error('Scenario name ซ้ำ');
  if(scenarios.filter(s=>s.kind==='existing').length!==1)throw Error('ต้องมี Existing scenario เพียงหนึ่งรายการ');
  const requested=String(input.activeScenarioId??''),activeScenarioId=scenarios.some(s=>s.id===requested)?requested:scenarios.find(s=>s.kind==='existing')!.id;
  return{workspaceVersion:1,activeScenarioId,scenarios};
}
export function restoreNetworkScenarioWorkspace(raw:string|null):NetworkScenarioWorkspace{
  if(!raw)return createNetworkScenarioWorkspace();
  try{return normalizeNetworkScenarioWorkspace(JSON.parse(raw));}
  catch{return createNetworkScenarioWorkspace();}
}
