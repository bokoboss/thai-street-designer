import {initial,markingsFor,migrate,pocketsFor,sectionFor,valid,type Arm,type Band,type Design,type Direction,type Pocket,type Section} from '../app/junction/model';
import {normalizeArrowOverrides} from '../app/junction/arrow-layout';
import {designError} from '../app/junction/design-validation';
import {lengthOf,validAlignment} from './alignment';

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
  forwardLaneWidth:number;
  backwardLaneWidth:number;
  forwardBands:Band[];
  backwardBands:Band[];
  forwardWalk:number;
  backwardWalk:number;
  median:number;
};
export type LinkIssue={kind:'lane-count'|'lane-width'|'median'|'edge-section'|'alignment'|'missing-port';message:string};
export type ConnectPortsResult={project:NetworkProject;link?:RoadLink;error:string|null};
export type NetworkEditResult={project:NetworkProject;error:string|null};
export const NETWORK_PROJECT_STORAGE='thai-street-network-project-v1';
export const NETWORK_EDIT_JUNCTION_STORAGE='thai-street-network-edit-junction-v1';

const rad=(deg:number)=>deg*Math.PI/180;
const copyDesign=(d:Design):Design=>structuredClone(d);
const displayDesignCache=new WeakMap<Design,Design>();
const nextId=(prefix:string,ids:string[])=>{let n=1;while(ids.includes(`${prefix}-${n}`))n++;return `${prefix}-${n}`;};
export const activeArmIds=(j:JunctionInstance)=>j.design.enabled.map((enabled,i)=>enabled?i:-1).filter(i=>i>=0);

export function portDistance(j:JunctionInstance,armId:number){
  const arm=j.design.arms[armId];
  return arm?.length??45;
}
export function portHeading(j:JunctionInstance,armId:number){
  return (j.rotation+j.design.rotation+(j.design.arms[armId]?.angle??0)+3600)%360;
}
export function portPoint(j:JunctionInstance,armId:number):WorldPoint{
  const distance=portDistance(j,armId),angle=rad(portHeading(j,armId));
  return{x:j.x+Math.cos(angle)*distance,y:j.y+Math.sin(angle)*distance};
}
export function junctionDisplayDesign(j:JunctionInstance):Design{
  const cached=displayDesignCache.get(j.design);if(cached)return cached;
  const d=copyDesign(j.design);
  d.rotation=0;
  d.showNames=false;
  d.showScale=false;
  d.trees=false;
  d.lights=false;
  d.display={...d.display,grid:false,trees:false,lights:false,dimensions:false,reviews:false,handles:false};

  displayDesignCache.set(j.design,d);
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
export function linkLength(project:NetworkProject,link:RoadLink){
  const points=linkPoints(project,link);return points.length>=2?lengthOf(points):0;
}
export function setLinkVia(project:NetworkProject,id:string,via:WorldPoint[]):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  const candidate={...link,via:via.map(p=>({...p}))},points=linkPoints(project,candidate);
  if(points.length<2||!validAlignment(points))return project;
  return{...project,links:project.links.map(l=>l.id===id?candidate:l)};
}
export function insertLinkVia(project:NetworkProject,id:string,index:number,point:WorldPoint){
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  const via=[...link.via];via.splice(Math.max(0,Math.min(index,via.length)),0,point);
  return setLinkVia(project,id,via);
}
export function moveLinkVia(project:NetworkProject,id:string,index:number,point:WorldPoint){
  const link=project.links.find(l=>l.id===id);if(!link||!link.via[index])return project;
  return setLinkVia(project,id,link.via.map((p,i)=>i===index?point:p));
}
export function removeLinkVia(project:NetworkProject,id:string,index:number){
  const link=project.links.find(l=>l.id===id);if(!link||!link.via[index])return project;
  return setLinkVia(project,id,link.via.filter((_,i)=>i!==index));
}
export function linkEndSection(project:NetworkProject,link:RoadLink,end:'from'|'to'):LinkEndSection|null{
  const arm=armForPort(project,end==='from'?link.from:link.to);
  if(!arm)return null;
  const incoming=sectionFor(arm,'incoming'),outgoing=sectionFor(arm,'outgoing');
  return end==='from'
    ?{forwardLanes:arm.outgoing,backwardLanes:arm.incoming,forwardLaneWidth:outgoing.width,backwardLaneWidth:incoming.width,forwardBands:outgoing.bands,backwardBands:incoming.bands,forwardWalk:outgoing.walk,backwardWalk:incoming.walk,median:arm.median}
    :{forwardLanes:arm.incoming,backwardLanes:arm.outgoing,forwardLaneWidth:incoming.width,backwardLaneWidth:outgoing.width,forwardBands:incoming.bands,backwardBands:outgoing.bands,forwardWalk:incoming.walk,backwardWalk:outgoing.walk,median:arm.median};
}
export function linkIssues(project:NetworkProject,link:RoadLink):LinkIssue[]{
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');
  if(!a||!b)return[{kind:'missing-port',message:'Road Link อ้างถึง arm/port ที่ไม่มีอยู่'}];
  const out:LinkIssue[]=[];
  if(a.forwardLanes!==b.forwardLanes||a.backwardLanes!==b.backwardLanes)out.push({
    kind:'lane-count',
    message:`จำนวนเลนปลาย Link ไม่ตรงกัน · ไป ${a.forwardLanes}→${b.forwardLanes} / กลับ ${a.backwardLanes}→${b.backwardLanes} · ต้องกำหนด transition ก่อนใช้เป็น concept สุดท้าย`
  });
  if(Math.abs(a.forwardLaneWidth-b.forwardLaneWidth)>.01||Math.abs(a.backwardLaneWidth-b.backwardLaneWidth)>.01)out.push({
    kind:'lane-width',
    message:`ความกว้างเลนปลาย Link ต่างกัน · ไป ${a.forwardLaneWidth.toFixed(2)}→${b.forwardLaneWidth.toFixed(2)} / กลับ ${a.backwardLaneWidth.toFixed(2)}→${b.backwardLaneWidth.toFixed(2)} ม.`
  });
  if(Math.abs(a.median-b.median)>.01)out.push({kind:'median',message:`เกาะกลางปลาย Link ต่างกัน ${a.median.toFixed(2)}→${b.median.toFixed(2)} ม. · ยังไม่สร้าง median transition อัตโนมัติ`});
  const sameBands=(x:Band[],y:Band[])=>x.length===y.length&&x.every((band,i)=>band.type===y[i].type&&Math.abs(band.width-y[i].width)<.01);
  if(Math.abs(a.forwardWalk-b.forwardWalk)>.01||Math.abs(a.backwardWalk-b.backwardWalk)>.01||!sameBands(a.forwardBands,b.forwardBands)||!sameBands(a.backwardBands,b.backwardBands))out.push({
    kind:'edge-section',
    message:'องค์ประกอบริมทางปลาย Link ไม่ตรงกัน · bike / shoulder / buffer / sidewalk ต้องกำหนด transition ก่อน'
  });
  const points=linkPoints(project,link);
  if(points.length>=2&&!validAlignment(points))out.push({kind:'alignment',message:'แนว Road Link หักกลับ ตัดตัวเอง หรือมีช่วงสั้นเกินไป · ปรับตำแหน่ง Junction หรือจุดแนว'});
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
export function connectPorts(project:NetworkProject,from:PortRef,to:PortRef):ConnectPortsResult{
  if(portKey(from)===portKey(to))return{project,error:'เลือก port เดิมซ้ำ'};
  if(from.junctionId===to.junctionId)return{project,error:'Road Link รุ่น foundation เชื่อมคนละทางแยกเท่านั้น'};
  if(!armForPort(project,from)||!armForPort(project,to))return{project,error:'ไม่พบ arm/port ที่เลือก'};
  if(portOccupied(project,from)||portOccupied(project,to))return{project,error:'port นี้มี Road Link เชื่อมอยู่แล้ว'};
  const ids=[...project.junctions.map(j=>j.id),...project.links.map(l=>l.id)],id=nextId('L',ids);
  const link:RoadLink={id,name:`Road Link ${project.links.length+1}`,from,to,via:[]};
  return{project:{...project,links:[...project.links,link]},link,error:null};
}
export function updateJunctionArmGeometry(project:NetworkProject,id:string,armId:number,angle:number,length:number):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),normalized=((angle%360)+360)%360,nextLength=Math.max(45,Math.min(400,length));
  design.arms[armId]={...design.arms[armId],angle:+normalized.toFixed(2),length:+nextLength.toFixed(2)};
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function updateJunctionArmBasics(project:NetworkProject,id:string,armId:number,patch:Partial<Pick<Arm,'name'|'incoming'|'outgoing'|'median'|'crossing'|'signal'|'stop'|'crossOffset'|'stopOffset'>>):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),current=design.arms[armId],next={...current,...patch};
  if(next.incoming+next.outgoing<1)return{project,error:'ขาถนนต้องมีอย่างน้อย 1 ช่องจราจร'};
  if(patch.incoming!==undefined||patch.outgoing!==undefined){
    next.laneMarkings=markingsFor(next);
    next.arrowOverrides=normalizeArrowOverrides(next);
  }
  design.arms[armId]=next;
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function updateJunctionArmSection(project:NetworkProject,id:string,armId:number,direction:Direction,patch:Partial<Section>):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),arm=design.arms[armId],current=sectionFor(arm,direction),
    next:Section={...current,...patch,bands:(patch.bands??current.bands).map(b=>({...b}))},
    key=direction==='incoming'?'incomingSection':'outgoingSection';
  design.arms[armId]={...arm,[key]:next};
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function updateJunctionArmPocket(project:NetworkProject,id:string,armId:number,direction:Direction,side:'left'|'right',patch:Partial<Pocket>):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),arm=design.arms[armId],current=pocketsFor(arm,direction),key=direction==='incoming'?'incomingPockets':'outgoingPockets',
    nextPockets={...current,[side]:{...current[side],...patch}},nextArm={...arm,[key]:nextPockets};
  if(patch.lanes!==undefined){nextArm.laneMarkings=markingsFor(nextArm);nextArm.arrowOverrides=normalizeArrowOverrides(nextArm);}
  design.arms[armId]=nextArm;
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function setJunctionArmEnabled(project:NetworkProject,id:string,armId:number,enabled:boolean):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||armId<0||armId>=junction.design.arms.length)return{project,error:'ไม่พบขาถนนที่เลือก'};
  if(junction.design.enabled[armId]===enabled)return{project,error:null};
  if(!enabled){
    if(linkedArmIds(project,id).includes(armId))return{project,error:'ปิดขานี้ไม่ได้ เพราะยังมี Road Link เชื่อมอยู่ · ลบ/ย้าย Link ก่อน'};
    if(junction.design.slips.some(s=>s.fromArm===armId||s.toArm===armId))return{project,error:'ปิดขานี้ไม่ได้ เพราะ Slip lane ยังอ้างถึงขานี้ · แก้ Slip ก่อน'};
    if(junction.design.enabled.filter(Boolean).length<=3)return{project,error:'ทางแยกต้องมีอย่างน้อย 3 ขา'};
  }
  const design=copyDesign(junction.design);design.enabled[armId]=enabled;
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function linkedArmIds(project:NetworkProject,junctionId:string){
  return [...new Set(project.links.flatMap(link=>[
    ...(link.from.junctionId===junctionId?[link.from.armId]:[]),
    ...(link.to.junctionId===junctionId?[link.to.armId]:[])
  ]))].sort((a,b)=>a-b);
}
export function junctionDesignLinkIssue(project:NetworkProject,id:string,design:Design){
  const disabled=linkedArmIds(project,id).filter(armId=>!design.enabled[armId]);
  return disabled.length?`บันทึกกลับ Network ไม่ได้: arm ${disabled.map(v=>v+1).join(', ')} ยังมี Road Link เชื่อมอยู่ · ลบ/ย้าย Link ก่อนปิด arm`:null;
}
export function updateJunctionDesign(project:NetworkProject,id:string,design:Design):NetworkProject{
  if(junctionDesignLinkIssue(project,id,design))return project;
  return{...project,junctions:project.junctions.map(j=>j.id===id?{...j,design:copyDesign(design)}:j)};
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
  if(typeof project.title!=='string'||project.title.length>120)return'ชื่อ Network ไม่ถูกต้อง';
  if(project.junctions.length>200||project.links.length>500)return'Network มีวัตถุมากเกินขอบเขตที่รองรับ';
  if(new Set(project.junctions.map(j=>j.id)).size!==project.junctions.length)return'Junction ID ซ้ำ';
  if(new Set(project.links.map(l=>l.id)).size!==project.links.length)return'Road Link ID ซ้ำ';
  for(const j of project.junctions){
    if(!j.id||j.id.length>40||typeof j.name!=='string'||j.name.length>80||!Number.isFinite(j.x)||!Number.isFinite(j.y)||!Number.isFinite(j.rotation)||j.rotation<0||j.rotation>=360||!valid(j.design))return'Junction instance ไม่สมบูรณ์';
  }
  const occupied=new Set<string>();
  for(const l of project.links){
    if(!l.id||l.id.length>40||typeof l.name!=='string'||l.name.length>80||l.from.junctionId===l.to.junctionId||!armForPort(project,l.from)||!armForPort(project,l.to)||!Array.isArray(l.via)||l.via.length>64||l.via.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return'Road Link ไม่สมบูรณ์';
    for(const ref of [l.from,l.to]){
      const key=portKey(ref);if(occupied.has(key))return'มี Road Link ใช้ port ซ้ำ';occupied.add(key);
    }
  }
  return null;
}
export function createNetworkProject():NetworkProject{
  let project:NetworkProject={schemaVersion:1,title:'Thai Street Network Concept',junctions:[],links:[]};
  const first=addJunction(project,{x:-150,y:0}),a=first.junction;
  project=first.project;
  const second=addJunction(project,{x:150,y:0}),b=second.junction;
  project=second.project;
  // East arm of A to west arm of B. Both ports own only the local junction approach; the Link owns the corridor between them.
  const connected=connectPorts(project,{junctionId:a.id,armId:0},{junctionId:b.id,armId:2});
  return connected.project;
}

export function normalizeNetworkProject(raw:unknown):NetworkProject{
  if(!raw||typeof raw!=='object')throw Error('Invalid network project');
  const source=raw as Partial<NetworkProject>;
  if(source.schemaVersion!==1||!Array.isArray(source.junctions)||!Array.isArray(source.links))throw Error('Unsupported network schema');
  const junctions=source.junctions.map(input=>{
    if(!input||typeof input!=='object')throw Error('Invalid junction instance');
    const rotation=((Number(input.rotation)%360)+360)%360;
    return{
      id:String(input.id??''),
      name:String(input.name??''),
      x:Number(input.x),
      y:Number(input.y),
      rotation,
      design:migrate(input.design)
    };
  });
  const links=source.links.map(input=>({
    id:String(input?.id??''),
    name:String(input?.name??''),
    from:{junctionId:String(input?.from?.junctionId??''),armId:Number(input?.from?.armId)},
    to:{junctionId:String(input?.to?.junctionId??''),armId:Number(input?.to?.armId)},
    via:Array.isArray(input?.via)?input.via.map(p=>({x:Number(p.x),y:Number(p.y)})):[]
  }));
  const project:NetworkProject={schemaVersion:1,title:String(source.title??'Thai Street Network Concept'),junctions,links};
  const error=validateNetworkProject(project);if(error)throw Error(error);
  return project;
}
export function restoreNetworkProject(raw:string|null):NetworkProject{
  if(!raw)return createNetworkProject();
  try{return normalizeNetworkProject(JSON.parse(raw));}
  catch{return createNetworkProject();}
}
