import {
  linkLength,linkLinearTransitionPossible,validateNetworkProject,
  type LinkDirection,type LinkStationLaneComponent,type NetworkProject,type RoadLink,type TransferPort,type TransferTerminalKind
} from './network-project';

export type TransferTerminalLaneRange={start:number;end:number;taperIn:number;taperOut:number;fullWidthLength:number;taperLength:number};
export type TransferTerminalTreatmentResult={project:NetworkProject;componentIds:string[];removed:string[];error:string|null};

const rounded=(value:number)=>+value.toFixed(2);
export function transferTerminalLaneRange(
  total:number,station:number,direction:LinkDirection,terminal:TransferTerminalKind,fullWidthLength:number,taperLength:number
):TransferTerminalLaneRange|null{
  if(![total,station,fullWidthLength,taperLength].every(Number.isFinite)||total<=0||station<=0||station>=total||fullWidthLength<=0||taperLength<0)return null;
  const span=fullWidthLength+taperLength,trafficSign=direction==='forward'?1:-1,
    remoteSign=terminal==='diverge'?-trafficSign:trafficSign,remote=station+remoteSign*span;
  if(remote<-.005||remote>total+.005)return null;
  const start=Math.max(0,Math.min(station,remote)),end=Math.min(total,Math.max(station,remote)),
    taperIn=remote<station?taperLength:0,taperOut=remote>station?taperLength:0;
  return{start:rounded(start),end:rounded(end),taperIn:rounded(taperIn),taperOut:rounded(taperOut),fullWidthLength:rounded(fullWidthLength),taperLength:rounded(taperLength)};
}
function nextComponentId(link:RoadLink){
  const ids=new Set(link.components.map(component=>component.id));let n=1;
  while(ids.has(`C-${n}`))n++;
  return `C-${n}`;
}
function connectorForPort(project:NetworkProject,port:TransferPort){
  return project.transferConnectors.find(connector=>connector.fromTransferPortId===port.id||connector.toTransferPortId===port.id);
}
function sourceMatches(component:LinkStationLaneComponent,portId:string,connectorId:string){
  return component.source?.kind==='transfer-terminal'&&component.source.transferPortId===portId&&component.source.connectorId===connectorId;
}
export function applyTransferTerminalLaneTreatment(
  project:NetworkProject,transferPortId:string,fullWidthLength:number,taperLength:number
):TransferTerminalTreatmentResult{
  const port=project.transferPorts.find(item=>item.id===transferPortId);if(!port)return{project,componentIds:[],removed:[],error:'ไม่พบ Transfer port'};
  const connector=connectorForPort(project,port);if(!connector)return{project,componentIds:[],removed:[],error:'Transfer port นี้ยังไม่มี connector'};
  const host=project.links.find(link=>link.id===port.hostLinkId);if(!host)return{project,componentIds:[],removed:[],error:'ไม่พบ host Road Link'};
  if(host.sectionProfile.mode!=='linear'||!linkLinearTransitionPossible(project,host))return{project,componentIds:[],removed:[],error:'Host Road Link ต้องอยู่ใน Resolved geometric transition ก่อนสร้าง speed-change lane'};
  const range=transferTerminalLaneRange(linkLength(project,host),port.station,port.direction,port.terminal,fullWidthLength,taperLength);
  if(!range)return{project,componentIds:[],removed:[],error:'ช่วง speed-change lane / taper เกินระยะ host Road Link ที่มีอยู่'};
  const existing=host.components.filter((component):component is LinkStationLaneComponent=>component.kind==='lane'&&sourceMatches(component,port.id,connector.id)),
    existingByLane=new Map(existing.map(component=>{const source=component.source;return[source?.kind==='transfer-terminal'?source.lane:-1,component] as const;})),
    keep=host.components.filter(component=>!(component.kind==='lane'&&component.source?.kind==='transfer-terminal'&&component.source.transferPortId===port.id)),
    capacity=keep.length+connector.lanes;
  if(capacity>24)return{project,componentIds:[],removed:[],error:'จำนวน station components จะเกินขอบเขต 24 รายการของ Road Link'};
  let nextLink:RoadLink={...host,components:[...keep]};const componentIds:string[]=[];
  for(let lane=0;lane<connector.lanes;lane++){
    const prior=existingByLane.get(lane),id=prior?.id??nextComponentId(nextLink),component:LinkStationLaneComponent={
      id,kind:'lane',direction:port.direction,side:port.side,start:range.start,end:range.end,taperIn:range.taperIn,taperOut:range.taperOut,
      source:{kind:'transfer-terminal',transferPortId:port.id,connectorId:connector.id,terminal:port.terminal,lane}
    };
    nextLink={...nextLink,components:[...nextLink.components,component]};componentIds.push(id);
  }
  const next={...project,links:project.links.map(link=>link.id===host.id?nextLink:link)},error=validateNetworkProject(next),
    removed=existing.filter(component=>!componentIds.includes(component.id)).map(component=>component.id);
  return error?{project,componentIds:[],removed:[],error}:{project:next,componentIds,removed,error:null};
}
export function removeTransferTerminalLaneTreatment(project:NetworkProject,transferPortId:string):TransferTerminalTreatmentResult{
  const removed:string[]=[];
  const links=project.links.map(link=>({...link,components:link.components.filter(component=>{
    const match=component.kind==='lane'&&component.source?.kind==='transfer-terminal'&&component.source.transferPortId===transferPortId;
    if(match)removed.push(component.id);return !match;
  })}));
  if(!removed.length)return{project,componentIds:[],removed:[],error:'ไม่พบ terminal lane treatment'};
  const next={...project,links},error=validateNetworkProject(next);
  return error?{project,componentIds:[],removed:[],error}:{project:next,componentIds:[],removed,error:null};
}
