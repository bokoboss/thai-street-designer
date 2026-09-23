import {initial,type Arm,type Design} from '../app/junction/model';

export type WorldPoint={x:number;y:number};
export type PortRef={junctionId:string;armId:number};
export type JunctionInstance={
  id:string;
  name:string;
  x:number;
  y:number;
  rotation:number;
  design:Design;
};
export type RoadLink={
  id:string;
  name:string;
  from:PortRef;
  to:PortRef;
  via:WorldPoint[];
};
export type NetworkProject={
  schemaVersion:1;
  title:string;
  junctions:JunctionInstance[];
  links:RoadLink[];
};
export type LinkEndSection={
  forwardLanes:number;
  backwardLanes:number;
  laneWidth:number;
  median:number;
  walk:number;
};
export type LinkIssue={kind:'lane-count'|'lane-width'|'median'|'missing-port';message:string};

const rad=(deg:number)=>deg*Math.PI/180;
const copyDesign=(d:Design):Design=>structuredClone(d);
const nextId=(prefix:string,ids:string[])=>{let n=1;while(ids.includes(`${prefix}-${n}`))n++;return `${prefix}-${n}`;};
export const activeArmIds=(j:JunctionInstance)=>j.design.enabled.map((enabled,i)=>enabled?i:-1).filter(i=>i>=0);

export function portDistance(j:JunctionInstance,armId:number){
  const arm=j.design.arms[armId];
  return Math.min(arm?.length??45,45);
}
export function portHeading(j:JunctionInstance,armId:number){
  return (j.rotation+j.design.rotation+(j.design.arms[armId]?.angle??0)+3600)%360;
}
export function portPoint(j:JunctionInstance,armId:number):WorldPoint{
  const distance=portDistance(j,armId),angle=rad(portHeading(j,armId));
  return{x:j.x+Math.cos(angle)*distance,y:j.y+Math.sin(angle)*distance};
}
export function junctionDisplayDesign(j:JunctionInstance):Design{
  const d=copyDesign(j.design);
  d.rotation=0;
  d.showScale=false;
  d.display={...d.display,dimensions:false,reviews:false,handles:false};
  d.arms=d.arms.map((arm,i)=>({...arm,length:portDistance(j,i)}));
  return d;
}
export function worldJunctionRotation(j:JunctionInstance){
  return j.rotation+j.design.rotation;
}
export function junctionById(project:NetworkProject,id:string){
  return project.junctions.find(j=>j.id===id);
}
export function armForPort(project:NetworkProject,ref:PortRef):Arm|undefined{
  const junction=junctionById(project,ref.junctionId);
  return junction?.design.enabled[ref.armId]?junction.design.arms[ref.armId]:undefined;
}
export function worldPort(project:NetworkProject,ref:PortRef){
  const junction=junctionById(project,ref.junctionId);
  return junction&&junction.design.enabled[ref.armId]?portPoint(junction,ref.armId):null;
}
export function linkPoints(project:NetworkProject,link:RoadLink){
  const from=worldPort(project,link.from),to=worldPort(project,link.to);
  return from&&to?[from,...link.via,to]:[];
}
export function linkEndSection(project:NetworkProject,link:RoadLink,end:'from'|'to'):LinkEndSection|null{
  const arm=armForPort(project,end==='from'?link.from:link.to);
  if(!arm)return null;
  return end==='from'
    ?{forwardLanes:arm.outgoing,backwardLanes:arm.incoming,laneWidth:arm.width,median:arm.median,walk:arm.walk}
    :{forwardLanes:arm.incoming,backwardLanes:arm.outgoing,laneWidth:arm.width,median:arm.median,walk:arm.walk};
}
export function linkIssues(project:NetworkProject,link:RoadLink):LinkIssue[]{
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');
  if(!a||!b)return[{kind:'missing-port',message:'Road Link อ้างถึง arm/port ที่ไม่มีอยู่'}];
  const out:LinkIssue[]=[];
  if(a.forwardLanes!==b.forwardLanes||a.backwardLanes!==b.backwardLanes)out.push({
    kind:'lane-count',
    message:`จำนวนเลนปลาย Link ไม่ตรงกัน · ไป ${a.forwardLanes}→${b.forwardLanes} / กลับ ${a.backwardLanes}→${b.backwardLanes} · ต้องกำหนด transition ก่อนใช้เป็น concept สุดท้าย`
  });
  if(Math.abs(a.laneWidth-b.laneWidth)>.01)out.push({kind:'lane-width',message:`ความกว้างเลนปลาย Link ต่างกัน ${a.laneWidth.toFixed(2)}→${b.laneWidth.toFixed(2)} ม.`});
  if(Math.abs(a.median-b.median)>.01)out.push({kind:'median',message:`เกาะกลางปลาย Link ต่างกัน ${a.median.toFixed(2)}→${b.median.toFixed(2)} ม. · ยังไม่สร้าง median transition อัตโนมัติ`});
  return out;
}
export function portKey(ref:PortRef){return `${ref.junctionId}:${ref.armId}`;}
export function portOccupied(project:NetworkProject,ref:PortRef,exceptLinkId?:string){
  const key=portKey(ref);
  return project.links.some(link=>link.id!==exceptLinkId&&(portKey(link.from)===key||portKey(link.to)===key));
}
export function addJunction(project:NetworkProject,point:WorldPoint,design:Design=initial()){
  const ids=[...project.junctions.map(j=>j.id),...project.links.map(l=>l.id)],id=nextId('J',ids);
  const junction:JunctionInstance={id,name:`Junction ${project.junctions.length+1}`,x:point.x,y:point.y,rotation:0,design:copyDesign(design)};
  return{project:{...project,junctions:[...project.junctions,junction]},junction};
}
export function moveJunction(project:NetworkProject,id:string,point:WorldPoint):NetworkProject{
  return{...project,junctions:project.junctions.map(j=>j.id===id?{...j,x:point.x,y:point.y}:j)};
}
export function rotateJunction(project:NetworkProject,id:string,rotation:number):NetworkProject{
  const normalized=((rotation%360)+360)%360;
  return{...project,junctions:project.junctions.map(j=>j.id===id?{...j,rotation:normalized}:j)};
}
export function connectPorts(project:NetworkProject,from:PortRef,to:PortRef){
  if(portKey(from)===portKey(to))return{project,error:'เลือก port เดิมซ้ำ'};
  if(from.junctionId===to.junctionId)return{project,error:'Road Link รุ่น foundation เชื่อมคนละทางแยกเท่านั้น'};
  if(!armForPort(project,from)||!armForPort(project,to))return{project,error:'ไม่พบ arm/port ที่เลือก'};
  if(portOccupied(project,from)||portOccupied(project,to))return{project,error:'port นี้มี Road Link เชื่อมอยู่แล้ว'};
  const ids=[...project.junctions.map(j=>j.id),...project.links.map(l=>l.id)],id=nextId('L',ids);
  const link:RoadLink={id,name:`Road Link ${project.links.length+1}`,from,to,via:[]};
  return{project:{...project,links:[...project.links,link]},link,error:null};
}
export function removeJunction(project:NetworkProject,id:string):NetworkProject{
  return{...project,junctions:project.junctions.filter(j=>j.id!==id),links:project.links.filter(l=>l.from.junctionId!==id&&l.to.junctionId!==id)};
}
export function removeLink(project:NetworkProject,id:string):NetworkProject{
  return{...project,links:project.links.filter(l=>l.id!==id)};
}
export function projectBounds(project:NetworkProject,padding=35){
  const points:WorldPoint[]=[];
  for(const j of project.junctions){points.push({x:j.x,y:j.y});for(const armId of activeArmIds(j))points.push(portPoint(j,armId));}
  for(const link of project.links)points.push(...linkPoints(project,link));
  if(!points.length)return{x:-125,y:-125,w:250,h:250};
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs)-padding,maxX=Math.max(...xs)+padding,minY=Math.min(...ys)-padding,maxY=Math.max(...ys)+padding;
  return{x:minX,y:minY,w:Math.max(100,maxX-minX),h:Math.max(100,maxY-minY)};
}
export function validateNetworkProject(project:NetworkProject){
  if(project.schemaVersion!==1||!Array.isArray(project.junctions)||!Array.isArray(project.links))return'Network schema ไม่รองรับ';
  if(new Set(project.junctions.map(j=>j.id)).size!==project.junctions.length)return'Junction ID ซ้ำ';
  if(new Set(project.links.map(l=>l.id)).size!==project.links.length)return'Road Link ID ซ้ำ';
  for(const j of project.junctions)if(!j.id||!Number.isFinite(j.x)||!Number.isFinite(j.y)||!Number.isFinite(j.rotation)||!j.design)return'Junction instance ไม่สมบูรณ์';
  for(const l of project.links)if(!l.id||!armForPort(project,l.from)||!armForPort(project,l.to)||!Array.isArray(l.via)||l.via.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return'Road Link ไม่สมบูรณ์';
  return null;
}
export function createNetworkProject():NetworkProject{
  let project:NetworkProject={schemaVersion:1,title:'Thai Street Network Concept',junctions:[],links:[]};
  let a;({project,junction:a}=addJunction(project,{x:-105,y:0}));
  let b;({project,junction:b}=addJunction(project,{x:105,y:0}));
  // East arm of A to west arm of B. Both ports own only the local junction approach; the Link owns the corridor between them.
  const connected=connectPorts(project,{junctionId:a!.id,armId:0},{junctionId:b!.id,armId:2});
  return connected.project;
}
