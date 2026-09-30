import type {NetworkScenarioWorkspace} from './network-scenarios';

export const NETWORK_PROJECT_FILE_SESSION_STORAGE='thai-street-network-project-file-session-v1';
export const NETWORK_PROJECT_FILE_SESSION_VERSION=1 as const;

export type NetworkProjectFileSession={
  version:typeof NETWORK_PROJECT_FILE_SESSION_VERSION;
  fileName:string;
  baselineSignature:string;
};

const hex32=(value:number)=>(value>>>0).toString(16).padStart(8,'0');

export function networkProjectWorkspaceSignature(workspace:NetworkScenarioWorkspace){
  const text=JSON.stringify(workspace);let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<text.length;i++){
    const code=text.charCodeAt(i);
    a=Math.imul(a^code,0x01000193);
    b=Math.imul(b^code,0x85ebca6b);
  }
  return `${text.length}-${hex32(a)}${hex32(b)}`;
}
export function createNetworkProjectFileSession(fileName:string,workspace:NetworkScenarioWorkspace):NetworkProjectFileSession{
  const name=fileName.trim();
  if(!name||name.length>160)throw Error('Invalid project file session name');
  return{version:NETWORK_PROJECT_FILE_SESSION_VERSION,fileName:name,baselineSignature:networkProjectWorkspaceSignature(workspace)};
}
export function normalizeNetworkProjectFileSession(raw:unknown):NetworkProjectFileSession{
  if(!raw||typeof raw!=='object')throw Error('Invalid project file session');
  const item=raw as Record<string,unknown>,version=Number(item.version),fileName=String(item.fileName??'').trim(),baselineSignature=String(item.baselineSignature??'');
  if(version!==NETWORK_PROJECT_FILE_SESSION_VERSION||!fileName||fileName.length>160||!/^[0-9]+-[0-9a-f]{16}$/.test(baselineSignature))throw Error('Invalid project file session');
  return{version:NETWORK_PROJECT_FILE_SESSION_VERSION,fileName,baselineSignature};
}
export function restoreNetworkProjectFileSession(raw:string|null):NetworkProjectFileSession|null{
  if(!raw)return null;
  try{return normalizeNetworkProjectFileSession(JSON.parse(raw));}catch{return null;}
}
export function serializeNetworkProjectFileSession(session:NetworkProjectFileSession){
  return JSON.stringify(normalizeNetworkProjectFileSession(session));
}
