import {normalizeNetworkScenarioWorkspace,type NetworkScenarioWorkspace} from './network-scenarios';

export const NETWORK_PROJECT_FILE_FORMAT='thai-street-designer-network' as const;
export const NETWORK_PROJECT_FILE_VERSION=1 as const;

export type NetworkProjectFileV1={
  format:typeof NETWORK_PROJECT_FILE_FORMAT;
  fileVersion:typeof NETWORK_PROJECT_FILE_VERSION;
  workspace:NetworkScenarioWorkspace;
};

export function createNetworkProjectFile(workspace:NetworkScenarioWorkspace):NetworkProjectFileV1{
  return{
    format:NETWORK_PROJECT_FILE_FORMAT,
    fileVersion:NETWORK_PROJECT_FILE_VERSION,
    workspace:normalizeNetworkScenarioWorkspace(workspace)
  };
}
export function normalizeNetworkProjectFile(raw:unknown):NetworkProjectFileV1{
  if(raw&&typeof raw==='object'){
    const item=raw as Record<string,unknown>;
    if(item.format===NETWORK_PROJECT_FILE_FORMAT){
      if(Number(item.fileVersion)!==NETWORK_PROJECT_FILE_VERSION)throw Error('Unsupported Thai Street Designer project file version');
      return createNetworkProjectFile(normalizeNetworkScenarioWorkspace(item.workspace));
    }
  }
  // Legacy compatibility: accept raw Scenario Workspace v1 or NetworkProject v1/v2/v3.
  return createNetworkProjectFile(normalizeNetworkScenarioWorkspace(raw));
}
export function parseNetworkProjectFile(text:string):NetworkProjectFileV1{
  if(!text.trim())throw Error('Project file is empty');
  return normalizeNetworkProjectFile(JSON.parse(text));
}
export function serializeNetworkProjectFile(workspace:NetworkScenarioWorkspace){
  return JSON.stringify(createNetworkProjectFile(workspace),null,2);
}
