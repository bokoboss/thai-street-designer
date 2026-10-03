import {resolveTransferConnectorAlignment} from './transfer-geometry';
import {updateTransferConnector,type LinkVia,type NetworkProject,type TransferConnector,type WorldPoint} from './network-project';

export type TransferConnectorViaEditResult={project:NetworkProject;connector?:TransferConnector;error:string|null};

const radius=(value:unknown)=>Math.max(0,Math.min(200,Number.isFinite(Number(value))?Number(value):0));
const normalizedVia=(via:(WorldPoint&{radius?:number})[])=>via.map(point=>({x:Number(point.x),y:Number(point.y),radius:radius(point.radius)}));

export function transferConnectorControlPoints(project:NetworkProject,id:string){
  const connector=project.transferConnectors.find(item=>item.id===id),alignment=connector?resolveTransferConnectorAlignment(project,connector):null;
  return connector&&alignment?[alignment.fromCenterPoint,...connector.via,alignment.toCenterPoint]:[];
}
export function setTransferConnectorVia(project:NetworkProject,id:string,via:(WorldPoint&{radius?:number})[]):TransferConnectorViaEditResult{
  const current=project.transferConnectors.find(connector=>connector.id===id);if(!current)return{project,error:'ไม่พบ Transfer connector'};
  const result=updateTransferConnector(project,id,{via:normalizedVia(via)});
  if(result.error||!result.connector)return{project,error:result.error??'แก้ Transfer connector ไม่สำเร็จ'};
  if(!resolveTransferConnectorAlignment(result.project,id))return{project,error:'ตำแหน่ง PI ทำให้ Transfer connector หักกลับ/ตัดตัวเอง/สั้นเกินไป'};
  return{project:result.project,connector:result.connector,error:null};
}
export function insertTransferConnectorVia(project:NetworkProject,id:string,index:number,point:WorldPoint,r=25):TransferConnectorViaEditResult{
  const connector=project.transferConnectors.find(item=>item.id===id);if(!connector)return{project,error:'ไม่พบ Transfer connector'};
  const via=[...connector.via];via.splice(Math.max(0,Math.min(index,via.length)),0,{...point,radius:radius(r)});
  return setTransferConnectorVia(project,id,via);
}
export function moveTransferConnectorVia(project:NetworkProject,id:string,index:number,point:WorldPoint):TransferConnectorViaEditResult{
  const connector=project.transferConnectors.find(item=>item.id===id);if(!connector||!connector.via[index])return{project,error:'ไม่พบ Transfer connector PI'};
  return setTransferConnectorVia(project,id,connector.via.map((item,i)=>i===index?{...item,...point}:item));
}
export function updateTransferConnectorViaRadius(project:NetworkProject,id:string,index:number,value:number):TransferConnectorViaEditResult{
  const connector=project.transferConnectors.find(item=>item.id===id);if(!connector||!connector.via[index])return{project,error:'ไม่พบ Transfer connector PI'};
  return setTransferConnectorVia(project,id,connector.via.map((item,i)=>i===index?{...item,radius:radius(value)}:item));
}
export function removeTransferConnectorVia(project:NetworkProject,id:string,index:number):TransferConnectorViaEditResult{
  const connector=project.transferConnectors.find(item=>item.id===id);if(!connector||!connector.via[index])return{project,error:'ไม่พบ Transfer connector PI'};
  return setTransferConnectorVia(project,id,connector.via.filter((_,i)=>i!==index));
}
