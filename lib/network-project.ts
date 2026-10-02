import {initial,markingsFor,migrate,pocketsFor,sectionFor,valid,type Arm,type Band,type Design,type Direction,type Pocket,type Section} from '../app/junction/model';
import {normalizeArrowOverrides} from '../app/junction/arrow-layout';
import {cachedEdges} from '../app/junction/geometry';
import {slipGeometries} from '../app/junction/slip-geometry';
import {designError} from '../app/junction/design-validation';
import {lengthOf,smoothAlignment,tangentAlignmentControls,validAlignment} from './alignment';

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
export type LinkVia=WorldPoint&{radius:number};
export type LinkDirection='forward'|'backward';
export type TransferTerminalKind='merge'|'diverge';
export type TransferPort={
  id:string;
  name:string;
  hostLinkId:string;
  station:number;
  direction:LinkDirection;
  side:'curb'|'median';
  terminal:TransferTerminalKind;
};
export type TransferConnector={
  id:string;
  name:string;
  fromTransferPortId:string;
  toTransferPortId:string;
  via:LinkVia[];
  lanes:number;
  laneWidth:number;
};
export type LinkLaneTransition={side:'curb'|'median';center:number;length:number};
export type LinkSectionProfile={mode:'review'|'linear';forwardLaneTransition?:LinkLaneTransition;backwardLaneTransition?:LinkLaneTransition};
export type LinkWidthTarget='walk'|Band['type'];
export type JunctionAuxiliarySource={kind:'junction-auxiliary';handoffId:string;junctionId:string;armId:number;direction:Direction;side:'left'|'right';lane:number};
export type LinkStationLaneComponent={id:string;kind:'lane';direction:LinkDirection;side:'curb'|'median';start:number;end:number;taperIn:number;taperOut:number;source?:JunctionAuxiliarySource};
export type LinkStationWidthComponent={id:string;kind:'width';direction:LinkDirection;target:LinkWidthTarget;start:number;end:number;taperIn:number;taperOut:number;delta:number};
export type LinkStationComponent=LinkStationLaneComponent|LinkStationWidthComponent;
export type LinkStationComponentPatch={direction?:LinkDirection;side?:'curb'|'median';target?:LinkWidthTarget;start?:number;end?:number;taperIn?:number;taperOut?:number;delta?:number};
export type RoadLink={
  id:string;
  name:string;
  from:PortRef;
  to:PortRef;
  via:LinkVia[];
  sectionProfile:LinkSectionProfile;
  components:LinkStationComponent[];
};
export type ParallelCorridorSide='left'|'right';
export type ParallelFrontageChain={side:ParallelCorridorSide;linkIds:string[];seedReviewJunctionIds?:string[]};
export type ParallelCorridor={
  id:string;
  name:string;
  mainlineLinkIds:string[];
  mainlineStartJunctionId:string;
  frontage:ParallelFrontageChain[];
};
export type ParallelCorridorInput=Pick<ParallelCorridor,'name'|'mainlineLinkIds'|'mainlineStartJunctionId'|'frontage'>;
export type ParallelCorridorOrientation={startJunctionId:string;endJunctionId:string;junctionIds:string[]};
export type ParallelCorridorEditResult={project:NetworkProject;corridor?:ParallelCorridor;error:string|null};
export type TransferPortEditResult={project:NetworkProject;port?:TransferPort;error:string|null};
export type TransferConnectorEditResult={project:NetworkProject;connector?:TransferConnector;error:string|null};
export type ParallelCorridorLinkRole={corridor:ParallelCorridor;role:'mainline'|'frontage';side?:ParallelCorridorSide};
export type NetworkProject={
  schemaVersion:5;
  title:string;
  junctions:JunctionInstance[];
  links:RoadLink[];
  parallelCorridors:ParallelCorridor[];
  transferPorts:TransferPort[];
  transferConnectors:TransferConnector[];
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
export type LinkIssue={kind:'lane-count'|'lane-width'|'median'|'edge-section'|'station-component'|'alignment'|'port-facing'|'missing-port';message:string};
export type LinkStationComponentResult={project:NetworkProject;component?:LinkStationComponent;error:string|null};
export type PortConnectionAssessment={distance:number;fromDeviation:number;toDeviation:number;status:'valid'|'caution'|'invalid'};
export type ConnectPortsResult={project:NetworkProject;link?:RoadLink;error:string|null};
export type NetworkEditResult={project:NetworkProject;error:string|null};
export type NetworkRigidTransform={origin:WorldPoint;translation:WorldPoint;rotation:number};
export const NETWORK_PROJECT_STORAGE='thai-street-network-project-v1';
export const NETWORK_EDIT_JUNCTION_STORAGE='thai-street-network-edit-junction-v1';

const rad=(deg:number)=>deg*Math.PI/180;
const linkRadius=(value:unknown)=>Math.max(0,Math.min(200,Number.isFinite(Number(value))?Number(value):0));
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
const normalizedRotation=(rotation:number)=>((rotation%360)+360)%360;
export function transformNetworkProject(project:NetworkProject,transform:NetworkRigidTransform):NetworkProject{
  const {origin,translation}=transform,rotation=normalizedRotation(transform.rotation);
  if(![origin.x,origin.y,translation.x,translation.y,rotation].every(Number.isFinite))return project;
  if(Math.abs(translation.x)<1e-12&&Math.abs(translation.y)<1e-12&&Math.abs(rotation)<1e-12)return project;
  const angle=rad(rotation),cos=Math.cos(angle),sin=Math.sin(angle),move=(point:WorldPoint):WorldPoint=>{
    const dx=point.x-origin.x,dy=point.y-origin.y;
    return{x:origin.x+dx*cos-dy*sin+translation.x,y:origin.y+dx*sin+dy*cos+translation.y};
  };
  return{
    ...project,
    junctions:project.junctions.map(j=>{const p=move(j);return{...j,x:p.x,y:p.y,rotation:normalizedRotation(j.rotation+rotation)};}),
    links:project.links.map(link=>({...link,via:link.via.map(v=>({...move(v),radius:v.radius}))})),
    transferConnectors:project.transferConnectors.map(connector=>({...connector,via:connector.via.map(v=>({...move(v),radius:v.radius}))}))
  };
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
export function linkControlPoints(project:NetworkProject,link:RoadLink){
  const from=worldPort(project,link.from),to=worldPort(project,link.to);
  return from&&to?[from,...link.via.map(v=>({x:v.x,y:v.y,radius:v.radius})),to]:[];
}
/** Derived controls keep Link endpoint tangency aligned to semantic Arm headings. */
export function linkAlignmentControls(project:NetworkProject,link:RoadLink){
  const raw=linkControlPoints(project,link),fromJ=junctionById(project,link.from.junctionId),toJ=junctionById(project,link.to.junctionId);
  if(raw.length<2||!fromJ||!toJ)return raw;
  return tangentAlignmentControls(raw[0],raw.at(-1)!,link.via,portHeading(fromJ,link.from.armId),portHeading(toJ,link.to.armId));
}
export function linkPoints(project:NetworkProject,link:RoadLink){
  const controls=linkAlignmentControls(project,link);
  return controls.length>=2?smoothAlignment(controls):[];
}
export function linkLength(project:NetworkProject,link:RoadLink){
  const points=linkPoints(project,link);return points.length>=2?lengthOf(points):0;
}
export function transferPortIssue(project:NetworkProject,port:TransferPort){
  if(!port||typeof port!=='object'||!port.id||port.id.length>40||typeof port.name!=='string'||!port.name.trim()||port.name.length>80)return'Transfer port metadata ไม่สมบูรณ์';
  const host=project.links.find(link=>link.id===port.hostLinkId);if(!host)return'Transfer port อ้าง Road Link ที่ไม่มีอยู่';
  if(!['forward','backward'].includes(port.direction)||!['curb','median'].includes(port.side)||!['merge','diverge'].includes(port.terminal))return'Transfer port semantics ไม่ถูกต้อง';
  const total=linkLength(project,host);
  if(!Number.isFinite(port.station)||port.station<=0||port.station>=total)return'Transfer port station ต้องอยู่ภายในช่วง Road Link';
  return null;
}
export function addTransferPort(project:NetworkProject,hostLinkId:string,station:number,direction:LinkDirection,side:'curb'|'median',terminal:TransferTerminalKind):TransferPortEditResult{
  const id=nextId('T',project.transferPorts.map(port=>port.id)),port:TransferPort={id,name:`Transfer Port ${project.transferPorts.length+1}`,hostLinkId,station:+Number(station).toFixed(2),direction,side,terminal},
    error=transferPortIssue(project,port);
  return error?{project,error}:{project:{...project,transferPorts:[...project.transferPorts,port]},port,error:null};
}
export function transferConnectorIssue(project:NetworkProject,connector:TransferConnector){
  if(!connector||typeof connector!=='object'||!connector.id||connector.id.length>40||typeof connector.name!=='string'||!connector.name.trim()||connector.name.length>80)return'Transfer connector metadata ไม่สมบูรณ์';
  const from=project.transferPorts.find(port=>port.id===connector.fromTransferPortId),to=project.transferPorts.find(port=>port.id===connector.toTransferPortId);
  if(!from||!to)return'Transfer connector อ้าง Transfer port ที่ไม่มีอยู่';
  if(from.id===to.id||from.hostLinkId===to.hostLinkId)return'Transfer connector ต้องเชื่อม Transfer port บนคนละ host Road Link';
  if(from.terminal!=='diverge'||to.terminal!=='merge')return'Transfer connector ต้องเรียงจาก DIVERGE → MERGE ตามทิศการเดินทาง';
  if(!Number.isInteger(connector.lanes)||connector.lanes<1||connector.lanes>4||!Number.isFinite(connector.laneWidth)||connector.laneWidth<2||connector.laneWidth>6)return'Transfer connector section ไม่ถูกต้อง';
  if(!Array.isArray(connector.via)||connector.via.length>64||connector.via.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.radius)||p.radius<0||p.radius>200))return'Transfer connector alignment controls ไม่ถูกต้อง';
  if(project.transferConnectors.some(other=>other.id!==connector.id&&[other.fromTransferPortId,other.toTransferPortId].some(id=>id===from.id||id===to.id)))return'Transfer port หนึ่งจุดใช้กับ Transfer connector ได้เพียงหนึ่งเส้นใน foundation นี้';
  return null;
}
export function addTransferConnector(project:NetworkProject,fromTransferPortId:string,toTransferPortId:string,lanes=1,laneWidth=3.5):TransferConnectorEditResult{
  const id=nextId('TC',[...project.links.map(link=>link.id),...project.transferConnectors.map(connector=>connector.id)]),
    connector:TransferConnector={id,name:`Transfer Connector ${project.transferConnectors.length+1}`,fromTransferPortId,toTransferPortId,via:[],lanes:Math.round(lanes),laneWidth:+Number(laneWidth).toFixed(2)},
    error=transferConnectorIssue(project,connector);
  return error?{project,error}:{project:{...project,transferConnectors:[...project.transferConnectors,connector]},connector,error:null};
}
export function updateTransferConnector(project:NetworkProject,id:string,patch:Partial<Omit<TransferConnector,'id'>>):TransferConnectorEditResult{
  const current=project.transferConnectors.find(connector=>connector.id===id);if(!current)return{project,error:'ไม่พบ Transfer connector'};
  const connector:TransferConnector={...current,...patch,lanes:Math.round(Number(patch.lanes??current.lanes)),laneWidth:+Number(patch.laneWidth??current.laneWidth).toFixed(2),
    via:(patch.via??current.via).map(v=>({x:Number(v.x),y:Number(v.y),radius:linkRadius(v.radius)}))},
    error=transferConnectorIssue(project,connector);
  return error?{project,error}:{project:{...project,transferConnectors:project.transferConnectors.map(item=>item.id===id?connector:item)},connector,error:null};
}
export function removeTransferConnector(project:NetworkProject,id:string):NetworkProject{
  return project.transferConnectors.some(connector=>connector.id===id)?{...project,transferConnectors:project.transferConnectors.filter(connector=>connector.id!==id)}:project;
}
export function updateTransferPort(project:NetworkProject,id:string,patch:Partial<Omit<TransferPort,'id'>>):TransferPortEditResult{
  const current=project.transferPorts.find(port=>port.id===id);if(!current)return{project,error:'ไม่พบ Transfer port'};
  const port:TransferPort={...current,...patch,station:+Number(patch.station??current.station).toFixed(2)},error=transferPortIssue(project,port);
  if(error)return{project,error};
  const candidate={...project,transferPorts:project.transferPorts.map(item=>item.id===id?port:item)},
    connectorError=candidate.transferConnectors.filter(connector=>connector.fromTransferPortId===id||connector.toTransferPortId===id).map(connector=>transferConnectorIssue(candidate,connector)).find(Boolean);
  return connectorError?{project,error:connectorError}:{project:candidate,port,error:null};
}
export function removeTransferPort(project:NetworkProject,id:string):NetworkProject{
  if(!project.transferPorts.some(port=>port.id===id))return project;
  return{...project,transferPorts:project.transferPorts.filter(port=>port.id!==id),transferConnectors:project.transferConnectors.filter(connector=>connector.fromTransferPortId!==id&&connector.toTransferPortId!==id)};
}
const clampNumber=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const stationRange=(total:number,start:number,end:number,taperIn:number,taperOut:number)=>{
  const length=Math.max(.5,total),a=clampNumber(Number.isFinite(start)?start:0,0,Math.max(0,length-.5)),b=clampNumber(Number.isFinite(end)?end:length,a+.5,length),
    span=Math.max(.5,b-a),rawIn=Math.max(0,Number.isFinite(taperIn)?taperIn:0),rawOut=Math.max(0,Number.isFinite(taperOut)?taperOut:0),
    scale=rawIn+rawOut>span&&rawIn+rawOut>0?span/(rawIn+rawOut):1;
  return{start:+a.toFixed(2),end:+b.toFixed(2),taperIn:+(rawIn*scale).toFixed(2),taperOut:+(rawOut*scale).toFixed(2)};
};
export function setLinkVia(project:NetworkProject,id:string,via:(WorldPoint&{radius?:number})[]):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  const candidate:RoadLink={...link,via:via.map(p=>({x:p.x,y:p.y,radius:linkRadius(p.radius)}))},controls=linkControlPoints(project,candidate);
  if(controls.length<2||!validAlignment(controls))return project;
  return{...project,links:project.links.map(l=>l.id===id?candidate:l)};
}
export function insertLinkVia(project:NetworkProject,id:string,index:number,point:WorldPoint){
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  const via=[...link.via];via.splice(Math.max(0,Math.min(index,via.length)),0,{...point,radius:25});
  return setLinkVia(project,id,via);
}
export function moveLinkVia(project:NetworkProject,id:string,index:number,point:WorldPoint){
  const link=project.links.find(l=>l.id===id);if(!link||!link.via[index])return project;
  return setLinkVia(project,id,link.via.map((p,i)=>i===index?{...p,...point}:p));
}
export function updateLinkViaRadius(project:NetworkProject,id:string,index:number,radius:number){
  const link=project.links.find(l=>l.id===id);if(!link||!link.via[index])return project;
  return setLinkVia(project,id,link.via.map((p,i)=>i===index?{...p,radius:linkRadius(radius)}:p));
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
const sameBandTypes=(x:Band[],y:Band[])=>x.length===y.length&&x.every((band,i)=>band.type===y[i].type);
const laneTransitionKey=(direction:LinkDirection)=>direction==='forward'?'forwardLaneTransition':'backwardLaneTransition';
export function linkLaneCounts(project:NetworkProject,link:RoadLink,direction:LinkDirection){
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');
  return !a||!b?null:direction==='forward'?{from:a.forwardLanes,to:b.forwardLanes}:{from:a.backwardLanes,to:b.backwardLanes};
}
export function linkWidthTargets(project:NetworkProject,link:RoadLink,direction:LinkDirection):LinkWidthTarget[]{
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');if(!a||!b)return['walk'];
  const bandsA=direction==='forward'?a.forwardBands:a.backwardBands,bandsB=direction==='forward'?b.forwardBands:b.backwardBands,
    shared=sameBandTypes(bandsA,bandsB)?bandsA.map(v=>v.type):[];
  return['walk',...shared];
}
function linkWidthTargetRange(project:NetworkProject,link:RoadLink,direction:LinkDirection,target:LinkWidthTarget){
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');if(!a||!b)return null;
  if(target==='walk')return direction==='forward'?{from:a.forwardWalk,to:b.forwardWalk}:{from:a.backwardWalk,to:b.backwardWalk};
  const bandsA=direction==='forward'?a.forwardBands:a.backwardBands,bandsB=direction==='forward'?b.forwardBands:b.backwardBands,
    from=bandsA.find(v=>v.type===target),to=bandsB.find(v=>v.type===target);
  return from&&to?{from:from.width,to:to.width}:null;
}
export function addLinkStationComponent(project:NetworkProject,id:string,kind:'lane'|'width'):LinkStationComponentResult{
  const link=project.links.find(l=>l.id===id);if(!link)return{project,error:'ไม่พบ Road Link'};
  if(link.sectionProfile.mode!=='linear'||!linkLinearTransitionPossible(project,link))return{project,error:'เปิด Resolved geometric transition ให้เรียบร้อยก่อนเพิ่ม station component'};
  if(link.components.length>=24)return{project,error:'Road Link รองรับ station components ได้ไม่เกิน 24 รายการ'};
  const total=Math.max(.5,linkLength(project,link)),start=total*.25,end=total*.75,span=end-start,taper=Math.min(20,span*.25),range=stationRange(total,start,end,taper,taper),
    componentId=nextId('C',link.components.map(v=>v.id)),
    component:LinkStationComponent=kind==='lane'
      ?{id:componentId,kind:'lane',direction:'forward',side:'curb',...range}
      :{id:componentId,kind:'width',direction:'forward',target:'walk',delta:1,...range};
  const next={...project,links:project.links.map(l=>l.id===id?{...l,components:[...l.components,component]}:l)};
  return{project:next,component,error:null};
}
export function updateLinkStationComponent(project:NetworkProject,id:string,componentId:string,patch:LinkStationComponentPatch):LinkStationComponentResult{
  const link=project.links.find(l=>l.id===id),current=link?.components.find(v=>v.id===componentId);if(!link||!current)return{project,error:'ไม่พบ station component'};
  const total=Math.max(.5,linkLength(project,link)),direction=patch.direction??current.direction,range=stationRange(total,patch.start??current.start,patch.end??current.end,patch.taperIn??current.taperIn,patch.taperOut??current.taperOut);
  let component:LinkStationComponent;
  if(current.kind==='lane'){
    const {source:_source,...detached}=current;
    component={...detached,direction,side:patch.side??current.side,...range};
  }else{
    const target=patch.target??current.target,base=linkWidthTargetRange(project,link,direction,target);
    if(!base)return{project,error:'Edge-width target นี้ไม่มีอยู่ต่อเนื่องที่ปลาย Road Link ทั้งสองด้าน'};
    const minBase=Math.min(base.from,base.to),rawDelta=Number.isFinite(patch.delta)?Number(patch.delta):current.delta,
      delta=clampNumber(rawDelta,Math.max(-5,-minBase+.05),5);
    if(Math.abs(delta)<.01)return{project,error:'Width delta ต้องไม่เป็นศูนย์'};
    component={...current,direction,target,delta:+delta.toFixed(2),...range};
  }
  const next={...project,links:project.links.map(l=>l.id===id?{...l,components:l.components.map(v=>v.id===componentId?component:v)}:l)};
  return{project:next,component,error:null};
}
export function removeLinkStationComponent(project:NetworkProject,id:string,componentId:string):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link||!link.components.some(v=>v.id===componentId))return project;
  return{...project,links:project.links.map(l=>l.id===id?{...l,components:l.components.filter(v=>v.id!==componentId)}:l)};
}

export function linkLaneTransitionPossible(project:NetworkProject,link:RoadLink,direction:LinkDirection){
  const counts=linkLaneCounts(project,link,direction);
  return !!counts&&counts.from>0&&counts.to>0&&Math.abs(counts.from-counts.to)===1;
}
export function linkLaneTransitionValid(project:NetworkProject,link:RoadLink,direction:LinkDirection){
  const counts=linkLaneCounts(project,link,direction);
  if(!counts)return false;
  if(counts.from===counts.to)return true;
  const transition=link.sectionProfile[laneTransitionKey(direction)];
  return linkLaneTransitionPossible(project,link,direction)&&!!transition&&['curb','median'].includes(transition.side)&&Number.isFinite(transition.center)&&Number.isFinite(transition.length)&&transition.center>=0&&transition.length>=3;
}
export function updateLinkLaneTransition(project:NetworkProject,id:string,direction:LinkDirection,transition:LinkLaneTransition|null):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  const key=laneTransitionKey(direction);
  if(transition&&!linkLaneTransitionPossible(project,link,direction))return project;
  const length=Math.max(3,linkLength(project,link)),next=transition?{side:transition.side,center:Math.max(0,Math.min(length,transition.center)),length:Math.max(3,Math.min(length,transition.length))}:undefined,
    profile={...link.sectionProfile,[key]:next};
  if(!next)delete profile[key];
  return{...project,links:project.links.map(l=>l.id===id?{...l,sectionProfile:profile}:l)};
}
export function defaultLinkLaneTransition(project:NetworkProject,link:RoadLink,direction:LinkDirection,side:LinkLaneTransition['side']){
  const total=Math.max(3,linkLength(project,link)),length=Math.max(3,Math.min(40,total*.3));
  return updateLinkLaneTransition(project,link.id,direction,{side,center:total/2,length});
}
export function linkLinearTransitionPossible(project:NetworkProject,link:RoadLink){
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');
  return !!a&&!!b&&sameBandTypes(a.forwardBands,b.forwardBands)&&sameBandTypes(a.backwardBands,b.backwardBands)&&linkLaneTransitionValid(project,link,'forward')&&linkLaneTransitionValid(project,link,'backward');
}
export function updateLinkSectionProfile(project:NetworkProject,id:string,mode:LinkSectionProfile['mode']):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  if(mode==='linear'&&!linkLinearTransitionPossible(project,link))return project;
  if(mode==='review'&&link.components.length)return project;
  return{...project,links:project.links.map(l=>l.id===id?{...l,sectionProfile:{...l.sectionProfile,mode}}:l)};
}
export function linkIssues(project:NetworkProject,link:RoadLink):LinkIssue[]{
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');
  if(!a||!b)return[{kind:'missing-port',message:'Road Link อ้างถึง arm/port ที่ไม่มีอยู่'}];
  const out:LinkIssue[]=[],linear=link.sectionProfile.mode==='linear'&&linkLinearTransitionPossible(project,link),
    facing=assessPortConnection(project,link.from,link.to),total=linkLength(project,link);
  if(facing?.status==='invalid')out.push({kind:'port-facing',message:`ปลาย Road Link หันออกจากแนวเชื่อมมากเกินไป · FROM ${facing.fromDeviation.toFixed(0)}° / TO ${facing.toDeviation.toFixed(0)}° · หมุน/ย้าย Junction หรือเลือก arm ใหม่`});
  const forwardLaneResolved=linear&&linkLaneTransitionValid(project,link,'forward'),backwardLaneResolved=linear&&linkLaneTransitionValid(project,link,'backward');
  if((a.forwardLanes!==b.forwardLanes&&!forwardLaneResolved)||(a.backwardLanes!==b.backwardLanes&&!backwardLaneResolved))out.push({
    kind:'lane-count',
    message:`จำนวนเลนปลาย Link ไม่ตรงกัน · ไป ${a.forwardLanes}→${b.forwardLanes} / กลับ ${a.backwardLanes}→${b.backwardLanes} · ระบุฝั่งและช่วง lane transition ให้ครบก่อน`
  });
  if(!linear&&(Math.abs(a.forwardLaneWidth-b.forwardLaneWidth)>.01||Math.abs(a.backwardLaneWidth-b.backwardLaneWidth)>.01))out.push({
    kind:'lane-width',
    message:`ความกว้างเลนปลาย Link ต่างกัน · ไป ${a.forwardLaneWidth.toFixed(2)}→${b.forwardLaneWidth.toFixed(2)} / กลับ ${a.backwardLaneWidth.toFixed(2)}→${b.backwardLaneWidth.toFixed(2)} ม.`
  });
  if(!linear&&Math.abs(a.median-b.median)>.01)out.push({kind:'median',message:`เกาะกลางปลาย Link ต่างกัน ${a.median.toFixed(2)}→${b.median.toFixed(2)} ม. · ยังไม่สร้าง median transition อัตโนมัติ`});
  const sameBands=(x:Band[],y:Band[])=>sameBandTypes(x,y)&&x.every((band,i)=>Math.abs(band.width-y[i].width)<.01);
  if((!linear&&(Math.abs(a.forwardWalk-b.forwardWalk)>.01||Math.abs(a.backwardWalk-b.backwardWalk)>.01||!sameBands(a.forwardBands,b.forwardBands)||!sameBands(a.backwardBands,b.backwardBands)))||(linear&&(!sameBandTypes(a.forwardBands,b.forwardBands)||!sameBandTypes(a.backwardBands,b.backwardBands))))out.push({
    kind:'edge-section',
    message:'องค์ประกอบริมทางปลาย Link ไม่ตรงกัน · bike / shoulder / buffer / sidewalk ต้องกำหนด transition ก่อน'
  });
  if(link.components.length&&!linear)out.push({kind:'station-component',message:'Station components ถูกพักไว้จนกว่า Road Link จะกลับมาเป็น Resolved geometric transition'});
  if(link.components.some(component=>component.end>total+.01))out.push({kind:'station-component',message:'มี station component ยาวเกิน Road Link ปัจจุบัน · ปรับช่วง station หลังย้าย Junction/PI'});
  if(link.components.some(component=>component.kind==='width'&&!linkWidthTargets(project,link,component.direction).includes(component.target)))out.push({kind:'station-component',message:'มี edge-width component ที่ target ไม่ต่อเนื่องกับหน้าตัดปลาย Link แล้ว'});
  const points=linkControlPoints(project,link);
  if(points.length>=2&&!validAlignment(points))out.push({kind:'alignment',message:'แนว Road Link หักกลับ ตัดตัวเอง หรือมีช่วงสั้นเกินไป · ปรับตำแหน่ง Junction หรือจุดแนว'});
  return out;
}
export function portKey(ref:PortRef){return `${ref.junctionId}:${ref.armId}`;}
export function portOccupied(project:NetworkProject,ref:PortRef,exceptLinkId?:string){
  const key=portKey(ref);
  return project.links.some(link=>link.id!==exceptLinkId&&(portKey(link.from)===key||portKey(link.to)===key));
}
const angleDifference=(a:number,b:number)=>Math.abs((((a-b)+540)%360)-180);
export function assessPortConnection(project:NetworkProject,from:PortRef,to:PortRef):PortConnectionAssessment|null{
  const fromJ=junctionById(project,from.junctionId),toJ=junctionById(project,to.junctionId),a=worldPort(project,from),b=worldPort(project,to);
  if(!fromJ||!toJ||!a||!b||from.junctionId===to.junctionId)return null;
  const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);
  if(distance<1e-6)return{distance,fromDeviation:180,toDeviation:180,status:'invalid'};
  const heading=(Math.atan2(dy,dx)*180/Math.PI+360)%360,
    fromDeviation=angleDifference(portHeading(fromJ,from.armId),heading),
    toDeviation=angleDifference(portHeading(toJ,to.armId),(heading+180)%360),
    worst=Math.max(fromDeviation,toDeviation),
    status:PortConnectionAssessment['status']=worst>90?'invalid':worst>60?'caution':'valid';
  return{distance,fromDeviation,toDeviation,status};
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
const facingWorst=(value:PortConnectionAssessment|null)=>value?Math.max(value.fromDeviation,value.toDeviation):180;
export function junctionLinkFacingIssue(project:NetworkProject,id:string,previous?:NetworkProject){
  for(const link of project.links){
    if(link.from.junctionId!==id&&link.to.junctionId!==id)continue;
    const after=assessPortConnection(project,link.from,link.to);
    if(after?.status!=='invalid'&&after!==null)continue;
    const before=previous?.links.find(v=>v.id===link.id),prior=before&&previous?assessPortConnection(previous,before.from,before.to):null;
    const newlyInvalid=prior?.status!=='invalid',worsened=prior?.status==='invalid'&&facingWorst(after)>facingWorst(prior)+.01;
    if(!previous||newlyInvalid||worsened)return `แก้ Junction ไม่ได้ เพราะจะทำให้ Road Link ${link.id} หันออกจาก port เกิน 90°${prior?.status==='invalid'?' มากกว่าเดิม':''} · ย้าย/หมุน Junction ให้อยู่ในแนวเชื่อม หรือเปลี่ยน arm ที่เชื่อมก่อน`;
  }
  return null;
}
export function moveJunctionChecked(project:NetworkProject,id:string,point:WorldPoint):NetworkEditResult{
  if(!junctionById(project,id))return{project,error:'ไม่พบ Junction ที่เลือก'};
  const next=moveJunction(project,id,point),error=junctionLinkFacingIssue(next,id,project);
  return error?{project,error}:{project:next,error:null};
}
export function rotateJunctionChecked(project:NetworkProject,id:string,rotation:number):NetworkEditResult{
  if(!junctionById(project,id))return{project,error:'ไม่พบ Junction ที่เลือก'};
  const next=rotateJunction(project,id,rotation),error=junctionLinkFacingIssue(next,id,project);
  return error?{project,error}:{project:next,error:null};
}
export function connectPorts(project:NetworkProject,from:PortRef,to:PortRef):ConnectPortsResult{
  if(portKey(from)===portKey(to))return{project,error:'เลือก port เดิมซ้ำ'};
  if(from.junctionId===to.junctionId)return{project,error:'Road Link รุ่น foundation เชื่อมคนละทางแยกเท่านั้น'};
  if(!armForPort(project,from)||!armForPort(project,to))return{project,error:'ไม่พบ arm/port ที่เลือก'};
  if(portOccupied(project,from)||portOccupied(project,to))return{project,error:'port นี้มี Road Link เชื่อมอยู่แล้ว'};
  const facing=assessPortConnection(project,from,to);
  if(!facing||facing.status==='invalid')return{project,error:'เชื่อมไม่ได้ · port อย่างน้อยหนึ่งด้านหันออกจากแนวเชื่อมเกิน 90° · เลือกขาที่หันเข้าหากันหรือจัดตำแหน่ง Junction ใหม่'};
  const ids=[...project.junctions.map(j=>j.id),...project.links.map(l=>l.id)],id=nextId('L',ids);
  const link:RoadLink={id,name:`Road Link ${project.links.length+1}`,from,to,via:[],sectionProfile:{mode:'review'},components:[]};
  return{project:{...project,links:[...project.links,link]},link,error:null};
}
export function reconnectLinkPort(project:NetworkProject,id:string,end:'from'|'to',ref:PortRef):ConnectPortsResult{
  const link=project.links.find(item=>item.id===id);if(!link)return{project,error:'ไม่พบ Road Link ที่เลือก'};
  const current=end==='from'?link.from:link.to,other=end==='from'?link.to:link.from;
  if(portKey(current)===portKey(ref))return{project,link,error:null};
  if(!armForPort(project,ref))return{project,error:'ไม่พบ arm/port ปลายทางที่เลือก'};
  if(ref.junctionId===other.junctionId)return{project,error:'Road Link ต้องเชื่อมคนละ Junction'};
  if(portOccupied(project,ref,id))return{project,error:'port นี้มี Road Link อื่นเชื่อมอยู่แล้ว'};
  const ownsHandoff=link.components.some(component=>component.kind==='lane'&&component.source&&component.source.junctionId===current.junctionId&&component.source.armId===current.armId);
  if(ownsHandoff)return{project,error:`เปลี่ยน ${end.toUpperCase()} port ไม่ได้ขณะที่มี Junction handoff ผูกกับปลายนี้ · Detach as manual หรือ Back to Junction only ก่อน`};
  const candidate:RoadLink={...link,[end]:ref},candidateProject={...project,links:project.links.map(item=>item.id===id?candidate:item)},
    facing=assessPortConnection(candidateProject,candidate.from,candidate.to);
  if(!facing||facing.status==='invalid')return{project,error:'เปลี่ยน port ไม่ได้ · ปลายใหม่หันออกจากแนวเชื่อมเกิน 90°'};
  if(parallelCorridorForLink(project,id)){
    const corridorError=candidateProject.parallelCorridors.map(corridor=>parallelCorridorIssue(candidateProject,corridor)).find(Boolean);
    if(corridorError)return{project,error:`เปลี่ยน port ไม่ได้ · ${corridorError} · แก้ Parallel corridor membership ก่อน`};
  }
  const controls=linkControlPoints(candidateProject,candidate);
  if(controls.length<2||!validAlignment(controls))return{project,error:'เปลี่ยน port ไม่ได้ · PI เดิมทำให้ alignment หักกลับ/ตัดตัวเองหรือมีช่วงสั้นเกินไป · ปรับหรือลบ PI ก่อน'};
  return{project:candidateProject,link:candidate,error:null};
}
export function updateJunctionArmGeometry(project:NetworkProject,id:string,armId:number,angle:number,length:number):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),normalized=((angle%360)+360)%360,nextLength=Math.max(45,Math.min(400,length));
  design.arms[armId]={...design.arms[armId],angle:+normalized.toFixed(2),length:+nextLength.toFixed(2)};
  const error=designError(design);if(error)return{project,error};
  const linkError=junctionDesignLinkIssue(project,id,design);if(linkError)return{project,error:linkError};
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
export function junctionConnectedLinkIds(project:NetworkProject,junctionId:string){
  return project.links.filter(link=>link.from.junctionId===junctionId||link.to.junctionId===junctionId).map(link=>link.id);
}
export function linkedArmIds(project:NetworkProject,junctionId:string){
  return [...new Set(project.links.flatMap(link=>[
    ...(link.from.junctionId===junctionId?[link.from.armId]:[]),
    ...(link.to.junctionId===junctionId?[link.to.armId]:[])
  ]))].sort((a,b)=>a-b);
}
export function junctionDesignLinkIssue(project:NetworkProject,id:string,design:Design){
  const disabled=linkedArmIds(project,id).filter(armId=>!design.enabled[armId]);
  if(disabled.length)return `บันทึกกลับ Network ไม่ได้: arm ${disabled.map(v=>v+1).join(', ')} ยังมี Road Link เชื่อมอยู่ · ลบ/ย้าย Link ก่อนปิด arm`;
  const candidate={...project,junctions:project.junctions.map(j=>j.id===id?{...j,design:copyDesign(design)}:j)};
  return junctionLinkFacingIssue(candidate,id,project);
}
export function updateJunctionDesign(project:NetworkProject,id:string,design:Design):NetworkProject{
  if(junctionDesignLinkIssue(project,id,design))return project;
  return{...project,junctions:project.junctions.map(j=>j.id===id?{...j,design:copyDesign(design)}:j)};
}
function inferredChainStartFromLinks(links:RoadLink[],linkIds:string[]){
  if(!Array.isArray(linkIds)||!linkIds.length)return null;
  const first=links.find(link=>link.id===linkIds[0]);if(!first)return null;
  if(linkIds.length===1)return first.from.junctionId;
  const second=links.find(link=>link.id===linkIds[1]);if(!second)return null;
  const firstEnds=[first.from.junctionId,first.to.junctionId],secondEnds=new Set([second.from.junctionId,second.to.junctionId]),
    starts=firstEnds.filter(id=>!secondEnds.has(id));
  return starts.length===1?starts[0]:null;
}
function chainJunctionsFromStart(project:NetworkProject,linkIds:string[],startJunctionId:string){
  if(!Array.isArray(linkIds)||!linkIds.length||linkIds.length>100||new Set(linkIds).size!==linkIds.length||!startJunctionId)return null;
  const links=linkIds.map(id=>project.links.find(link=>link.id===id));if(links.some(link=>!link))return null;
  let current=startJunctionId;const junctionIds=[current],visited=new Set<string>([current]);
  for(const link of links as RoadLink[]){
    let next:string;
    if(link.from.junctionId===current)next=link.to.junctionId;
    else if(link.to.junctionId===current)next=link.from.junctionId;
    else return null;
    if(visited.has(next))return null;
    visited.add(next);junctionIds.push(next);current=next;
  }
  return junctionIds;
}
export function parallelCorridorChainOrientation(project:NetworkProject,linkIds:string[],startJunctionId?:string):ParallelCorridorOrientation|null{
  const start=startJunctionId||inferredChainStartFromLinks(project.links,linkIds);if(!start)return null;
  const junctionIds=chainJunctionsFromStart(project,linkIds,start);if(!junctionIds)return null;
  return{startJunctionId:start,endJunctionId:junctionIds[junctionIds.length-1],junctionIds};
}
export function parallelCorridorChainContinuous(project:NetworkProject,linkIds:string[]){
  return !!parallelCorridorChainOrientation(project,linkIds);
}
function frontageChainJunctionIds(project:NetworkProject,linkIds:string[]){
  const ids=new Set<string>();
  for(const id of linkIds){const link=project.links.find(v=>v.id===id);if(link){ids.add(link.from.junctionId);ids.add(link.to.junctionId);}}
  return ids;
}
const filteredSeedReviewIds=(project:NetworkProject,chain:ParallelFrontageChain,linkIds=chain.linkIds)=>{
  const allowed=frontageChainJunctionIds(project,linkIds);
  return (chain.seedReviewJunctionIds??[]).filter(id=>allowed.has(id)&&project.junctions.some(j=>j.id===id));
};
export function parallelCorridorIssue(project:NetworkProject,corridor:ParallelCorridor){
  if(!corridor||typeof corridor!=='object'||!corridor.id||corridor.id.length>40||typeof corridor.name!=='string'||!corridor.name.trim()||corridor.name.length>80||typeof corridor.mainlineStartJunctionId!=='string'||!corridor.mainlineStartJunctionId)return'Parallel corridor metadata ไม่สมบูรณ์';
  if(!parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId))return'Parallel corridor mainline chain / reference direction ไม่ต่อเนื่องหรืออ้าง Road Link ที่ไม่มีอยู่';
  if(!Array.isArray(corridor.frontage)||corridor.frontage.length<1||corridor.frontage.length>2)return'Parallel corridor ต้องมี frontage อย่างน้อยหนึ่งด้าน';
  if(corridor.frontage.some(chain=>!chain||typeof chain!=='object'||!['left','right'].includes(chain.side)||!Array.isArray(chain.linkIds)))return'Parallel corridor frontage metadata ไม่สมบูรณ์';
  if(new Set(corridor.frontage.map(chain=>chain.side)).size!==corridor.frontage.length)return'Parallel corridor มี frontage side ซ้ำ';
  const owned=new Set(corridor.mainlineLinkIds);
  for(const chain of corridor.frontage){
    if(!chain||!['left','right'].includes(chain.side)||!parallelCorridorChainContinuous(project,chain.linkIds))return'Frontage chain ไม่ต่อเนื่องหรืออ้าง Road Link ที่ไม่มีอยู่';
    if(chain.seedReviewJunctionIds!==undefined){
      if(!Array.isArray(chain.seedReviewJunctionIds)||chain.seedReviewJunctionIds.length>100||new Set(chain.seedReviewJunctionIds).size!==chain.seedReviewJunctionIds.length)return'Frontage seed review metadata ไม่สมบูรณ์';
      const allowed=frontageChainJunctionIds(project,chain.linkIds);
      if(chain.seedReviewJunctionIds.some(id=>!allowed.has(id)||!project.junctions.some(j=>j.id===id)))return'Frontage seed review อ้าง Junction ที่ไม่อยู่ใน frontage chain';
    }
    for(const id of chain.linkIds){if(owned.has(id))return'Road Link เดียวกันเป็นทั้ง mainline/frontage หรือซ้ำหลายด้านไม่ได้';owned.add(id);}
  }
  return null;
}
export function parallelCorridorForLink(project:NetworkProject,linkId:string):ParallelCorridorLinkRole|null{
  for(const corridor of project.parallelCorridors){
    if(corridor.mainlineLinkIds.includes(linkId))return{corridor,role:'mainline'};
    for(const chain of corridor.frontage)if(chain.linkIds.includes(linkId))return{corridor,role:'frontage',side:chain.side};
  }
  return null;
}
const cloneParallelInput=(input:ParallelCorridorInput)=>({
  name:input.name.trim(),
  mainlineLinkIds:[...input.mainlineLinkIds],
  mainlineStartJunctionId:input.mainlineStartJunctionId,
  frontage:input.frontage.map(chain=>({side:chain.side,linkIds:[...chain.linkIds],...(chain.seedReviewJunctionIds!==undefined?{seedReviewJunctionIds:[...chain.seedReviewJunctionIds]}:{})}))
});
export function addParallelCorridor(project:NetworkProject,input:ParallelCorridorInput):ParallelCorridorEditResult{
  const id=nextId('PC',[...project.parallelCorridors.map(v=>v.id),...project.links.map(v=>v.id)]),body=cloneParallelInput(input),corridor:ParallelCorridor={id,...body},
    next={...project,parallelCorridors:[...project.parallelCorridors,corridor]},error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor,error:null};
}
export function updateParallelCorridor(project:NetworkProject,id:string,input:ParallelCorridorInput):ParallelCorridorEditResult{
  const current=project.parallelCorridors.find(v=>v.id===id);if(!current)return{project,error:'ไม่พบ Parallel corridor'};
  const body=cloneParallelInput(input),corridor:ParallelCorridor={id,...body},
    next={...project,parallelCorridors:project.parallelCorridors.map(v=>v.id===id?corridor:v)},error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor,error:null};
}
export function removeParallelCorridor(project:NetworkProject,id:string):NetworkProject{
  return project.parallelCorridors.some(v=>v.id===id)?{...project,parallelCorridors:project.parallelCorridors.filter(v=>v.id!==id)}:project;
}
export function markParallelFrontageReviewed(project:NetworkProject,id:string,side?:ParallelCorridorSide):ParallelCorridorEditResult{
  const corridor=project.parallelCorridors.find(v=>v.id===id);if(!corridor)return{project,error:'ไม่พบ Parallel corridor'};
  if(side&&side!=='left'&&side!=='right')return{project,error:'Frontage side ไม่ถูกต้อง'};
  const frontage=corridor.frontage.map(chain=>!side||chain.side===side?{...chain,seedReviewJunctionIds:[]}:chain),
    candidate={...corridor,frontage},next={...project,parallelCorridors:project.parallelCorridors.map(v=>v.id===id?candidate:v)},error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor:candidate,error:null};
}
export function reverseParallelCorridorReference(project:NetworkProject,id:string):ParallelCorridorEditResult{
  const corridor=project.parallelCorridors.find(v=>v.id===id);if(!corridor)return{project,error:'ไม่พบ Parallel corridor'};
  const orientation=parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId);
  if(!orientation)return{project,error:'กลับทิศอ้างอิงไม่ได้ · mainline chain ไม่สมบูรณ์'};
  const candidate:ParallelCorridor={...corridor,mainlineStartJunctionId:orientation.endJunctionId,frontage:corridor.frontage.map(chain=>({...chain,side:chain.side==='left'?'right':'left'}))},
    next={...project,parallelCorridors:project.parallelCorridors.map(v=>v.id===id?candidate:v)},error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor:candidate,error:null};
}
export type ParallelCorridorMemberRole='mainline'|'frontage';
const replaceParallelCorridor=(project:NetworkProject,corridor:ParallelCorridor):NetworkProject=>({...project,parallelCorridors:project.parallelCorridors.map(v=>v.id===corridor.id?corridor:v)});
export function addLinkToParallelCorridor(project:NetworkProject,corridorId:string,linkId:string,role:ParallelCorridorMemberRole,side?:ParallelCorridorSide):ParallelCorridorEditResult{
  const corridor=project.parallelCorridors.find(v=>v.id===corridorId);
  if(!corridor)return{project,error:'ไม่พบ Parallel corridor'};
  if(!project.links.some(v=>v.id===linkId))return{project,error:'ไม่พบ Road Link ที่เลือก'};
  if(parallelCorridorForLink(project,linkId))return{project,error:'Road Link นี้อยู่ใน Parallel corridor แล้ว'};
  const candidates:ParallelCorridor[]=[];
  if(role==='mainline'){
    const orientation=parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId),link=project.links.find(v=>v.id===linkId);
    if(!orientation||!link)return{project,error:'เพิ่ม Mainline ไม่ได้ · reference direction หรือ Road Link ไม่สมบูรณ์'};
    const touchesStart=link.from.junctionId===orientation.startJunctionId||link.to.junctionId===orientation.startJunctionId,
      touchesEnd=link.from.junctionId===orientation.endJunctionId||link.to.junctionId===orientation.endJunctionId;
    if(touchesStart===touchesEnd)return{project,error:'เพิ่ม Mainline ไม่ได้ · Link ต้องต่อที่ปลาย chain เพียงด้านเดียว'};
    if(touchesEnd)candidates.push({...corridor,mainlineLinkIds:[...corridor.mainlineLinkIds,linkId]});
    else{
      const newStart=link.from.junctionId===orientation.startJunctionId?link.to.junctionId:link.from.junctionId;
      candidates.push({...corridor,mainlineLinkIds:[linkId,...corridor.mainlineLinkIds],mainlineStartJunctionId:newStart});
    }
  }else{
    if(side!=='left'&&side!=='right')return{project,error:'ระบุ Frontage side ก่อน'};
    const existing=corridor.frontage.find(v=>v.side===side);
    if(!existing)candidates.push({...corridor,frontage:[...corridor.frontage,{side,linkIds:[linkId]}]});
    else for(const linkIds of [[...existing.linkIds,linkId],[linkId,...existing.linkIds]])candidates.push({...corridor,frontage:corridor.frontage.map(v=>v.side===side?{...v,linkIds}:v)});
  }
  const valid=candidates.map(candidate=>({candidate,next:replaceParallelCorridor(project,candidate)})).filter(item=>validateNetworkProject(item.next)===null),
    unique=valid.filter((item,index)=>valid.findIndex(other=>JSON.stringify(other.candidate)===JSON.stringify(item.candidate))===index);
  if(unique.length===0)return{project,error:'เพิ่ม Road Link ไม่ได้ · Link ต้องต่อที่ปลาย chain และต้องไม่ทำให้ Parallel corridor topology ขาด'};
  // With a one-Link chain, prepend and append can both describe the same two-Link topology because chain travel orientation is not persisted.
  // Keep the current chain first and use the first validated candidate deterministically; longer chains still admit only a valid endpoint extension.
  return{project:unique[0].next,corridor:unique[0].candidate,error:null};
}
export function removeLinkFromParallelCorridor(project:NetworkProject,linkId:string):ParallelCorridorEditResult{
  const membership=parallelCorridorForLink(project,linkId);
  if(!membership)return{project,error:'Road Link นี้ไม่ได้อยู่ใน Parallel corridor'};
  const corridor=membership.corridor;
  let candidate:ParallelCorridor;
  if(membership.role==='mainline'){
    const index=corridor.mainlineLinkIds.indexOf(linkId),orientation=parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId),
      mainlineLinkIds=corridor.mainlineLinkIds.filter(id=>id!==linkId);
    if(!mainlineLinkIds.length)return{project,error:'ถอด Mainline สุดท้ายไม่ได้ · ใช้ Dissolve group หากต้องการยกเลิกกลุ่ม'};
    if(index>0&&index<corridor.mainlineLinkIds.length-1)return{project,error:'ถอด Mainline ตรงกลางไม่ได้ เพราะจะทำให้ chain ขาด'};
    const mainlineStartJunctionId=index===0&&orientation?orientation.junctionIds[1]:corridor.mainlineStartJunctionId;
    if(!mainlineStartJunctionId||!parallelCorridorChainOrientation(project,mainlineLinkIds,mainlineStartJunctionId))return{project,error:'ถอด Mainline ไม่ได้ เพราะจะทำให้ reference direction ขาด'};
    candidate={...corridor,mainlineLinkIds,mainlineStartJunctionId};
  }else{
    const frontage=corridor.frontage.flatMap(chain=>{
      if(chain.side!==membership.side)return[chain];
      const linkIds=chain.linkIds.filter(id=>id!==linkId);
      if(!linkIds.length)return[];
      const seedReviewJunctionIds=filteredSeedReviewIds(project,chain,linkIds);
      return[{...chain,linkIds,...(chain.seedReviewJunctionIds!==undefined?{seedReviewJunctionIds}:{})}];
    });
    if(!frontage.length)return{project,error:'ถอด Frontage สุดท้ายไม่ได้ · ใช้ Dissolve group หากต้องการยกเลิกกลุ่ม'};
    const changed=frontage.find(chain=>chain.side===membership.side);
    if(changed&&!parallelCorridorChainContinuous(project,changed.linkIds))return{project,error:'ถอด Frontage ตรงกลางไม่ได้ เพราะจะทำให้ chain ขาด'};
    candidate={...corridor,frontage};
  }
  const next=replaceParallelCorridor(project,candidate),error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor:candidate,error:null};
}
const contiguousIndices=(values:number[])=>values.length>0&&values.every((value,index)=>index===0||value===values[index-1]+1);
function cleanupParallelCorridors(previous:NetworkProject,project:NetworkProject):NetworkProject{
  const live=new Set(project.links.map(link=>link.id)),parallelCorridors:ParallelCorridor[]=[];
  for(const corridor of previous.parallelCorridors){
    const oldOrientation=parallelCorridorChainOrientation(previous,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId),
      mainIndices=corridor.mainlineLinkIds.map((id,index)=>live.has(id)?index:-1).filter(index=>index>=0);
    if(!oldOrientation||!contiguousIndices(mainIndices))continue;
    const mainlineLinkIds=mainIndices.map(index=>corridor.mainlineLinkIds[index]);
    if(!mainlineLinkIds.length)continue;
    const mainlineStartJunctionId=oldOrientation.junctionIds[mainIndices[0]];
    if(!parallelCorridorChainOrientation(project,mainlineLinkIds,mainlineStartJunctionId))continue;
    const frontage=corridor.frontage.flatMap(chain=>{
      const indices=chain.linkIds.map((id,index)=>live.has(id)?index:-1).filter(index=>index>=0);
      if(!contiguousIndices(indices))return[];
      const linkIds=indices.map(index=>chain.linkIds[index]),seedReviewJunctionIds=filteredSeedReviewIds(project,chain,linkIds);
      return linkIds.length&&parallelCorridorChainContinuous(project,linkIds)?[{side:chain.side,linkIds,...(chain.seedReviewJunctionIds!==undefined?{seedReviewJunctionIds}:{})}]:[];
    });
    if(!frontage.length)continue;
    parallelCorridors.push({...corridor,mainlineLinkIds,mainlineStartJunctionId,frontage});
  }
  return{...project,parallelCorridors};
}
function cleanupTransferTopology(project:NetworkProject,links:RoadLink[]){
  const liveLinks=new Set(links.map(link=>link.id)),transferPorts=project.transferPorts.filter(port=>liveLinks.has(port.hostLinkId)),
    livePorts=new Set(transferPorts.map(port=>port.id)),transferConnectors=project.transferConnectors.filter(connector=>livePorts.has(connector.fromTransferPortId)&&livePorts.has(connector.toTransferPortId));
  return{transferPorts,transferConnectors};
}
export function removeJunction(project:NetworkProject,id:string):NetworkProject{
  const links=project.links.filter(l=>l.from.junctionId!==id&&l.to.junctionId!==id),transfer=cleanupTransferTopology(project,links);
  return cleanupParallelCorridors(project,{...project,junctions:project.junctions.filter(j=>j.id!==id),links,...transfer});
}
export function removeLink(project:NetworkProject,id:string):NetworkProject{
  const links=project.links.filter(l=>l.id!==id),transfer=cleanupTransferTopology(project,links);
  return cleanupParallelCorridors(project,{...project,links,...transfer});
}
export function projectBounds(project:NetworkProject,padding=35){
  const points:WorldPoint[]=[];
  const addLocal=(j:JunctionInstance,armId:number,p:{x:number;y:number})=>{
    const angle=rad(worldJunctionRotation(j)+(j.design.arms[armId]?.angle??0)),cos=Math.cos(angle),sin=Math.sin(angle);
    points.push({x:j.x+p.x*cos-p.y*sin,y:j.y+p.x*sin+p.y*cos});
  };
  for(const j of project.junctions){
    points.push({x:j.x,y:j.y});
    const segments=cachedEdges(j.design);
    for(const edge of segments)for(const p of [...edge.outer,...edge.walk])addLocal(j,edge.i,p);
    for(const slip of slipGeometries(j.design,segments)){
      const polygons=[slip.pavement,slip.sidewalk,slip.approachPavement,slip.departurePavement,slip.island,slip.gore,slip.raisedSeparator];
      for(const polygon of polygons)for(const p of polygon)addLocal(j,slip.fromArm,p);
    }
  }
  for(const link of project.links){
    const ps=linkPoints(project,link),ends=[linkEndSection(project,link,'from'),linkEndSection(project,link,'to')].filter((v):v is LinkEndSection=>!!v);
    const sideReach=(s:LinkEndSection,forward:boolean)=>{
      const lanes=forward?s.forwardLanes:s.backwardLanes,width=forward?s.forwardLaneWidth:s.backwardLaneWidth,bands=forward?s.forwardBands:s.backwardBands,walk=forward?s.forwardWalk:s.backwardWalk;
      return s.median/2+lanes*width+bands.reduce((sum,b)=>sum+b.width,0)+walk;
    };
    const baseReach=ends.length?Math.max(...ends.flatMap(s=>[sideReach(s,true),sideReach(s,false)])):5,
      componentExtra=Math.max(0,...link.components.map(component=>component.kind==='lane'?5:Math.max(0,component.delta))),reach=baseReach+componentExtra;
    for(const p of ps)points.push({x:p.x-reach,y:p.y-reach},{x:p.x+reach,y:p.y+reach});
  }
  if(!points.length)return{x:-125,y:-125,w:250,h:250};
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs)-padding,maxX=Math.max(...xs)+padding,minY=Math.min(...ys)-padding,maxY=Math.max(...ys)+padding;
  return{x:minX,y:minY,w:Math.max(100,maxX-minX),h:Math.max(100,maxY-minY)};
}
export function validateNetworkProject(project:NetworkProject){
  if(project.schemaVersion!==5||!Array.isArray(project.junctions)||!Array.isArray(project.links)||!Array.isArray(project.parallelCorridors)||!Array.isArray(project.transferPorts)||!Array.isArray(project.transferConnectors))return'Network schema ไม่รองรับ';
  if(typeof project.title!=='string'||project.title.length>120)return'ชื่อ Network ไม่ถูกต้อง';
  if(project.junctions.length>200||project.links.length>500||project.parallelCorridors.length>100||project.transferPorts.length>500||project.transferConnectors.length>250)return'Network มีวัตถุมากเกินขอบเขตที่รองรับ';
  if(new Set(project.junctions.map(j=>j.id)).size!==project.junctions.length)return'Junction ID ซ้ำ';
  if(new Set(project.links.map(l=>l.id)).size!==project.links.length)return'Road Link ID ซ้ำ';
  if(new Set(project.parallelCorridors.map(v=>v.id)).size!==project.parallelCorridors.length)return'Parallel corridor ID ซ้ำ';
  if(new Set(project.transferPorts.map(v=>v.id)).size!==project.transferPorts.length)return'Transfer port ID ซ้ำ';
  if(new Set(project.transferConnectors.map(v=>v.id)).size!==project.transferConnectors.length)return'Transfer connector ID ซ้ำ';
  for(const j of project.junctions){
    if(!j.id||j.id.length>40||typeof j.name!=='string'||j.name.length>80||!Number.isFinite(j.x)||!Number.isFinite(j.y)||!Number.isFinite(j.rotation)||j.rotation<0||j.rotation>=360||!valid(j.design))return'Junction instance ไม่สมบูรณ์';
  }
  const occupied=new Set<string>();
  for(const l of project.links){
    const validTransition=(t:LinkLaneTransition|undefined)=>!t||(['curb','median'].includes(t.side)&&Number.isFinite(t.center)&&t.center>=0&&Number.isFinite(t.length)&&t.length>=3&&t.length<=1000),
      validSource=(input:unknown)=>{
        if(input===undefined)return true;if(!input||typeof input!=='object')return false;
        const source=input as JunctionAuxiliarySource;
        return source.kind==='junction-auxiliary'&&typeof source.handoffId==='string'&&source.handoffId.length>0&&source.handoffId.length<=160&&typeof source.junctionId==='string'&&source.junctionId.length>0&&source.junctionId.length<=40&&Number.isInteger(source.armId)&&source.armId>=0&&source.armId<4&&['incoming','outgoing'].includes(source.direction)&&['left','right'].includes(source.side)&&Number.isInteger(source.lane)&&source.lane>=0&&source.lane<4;
      },
      validComponent=(input:unknown)=>{
        if(!input||typeof input!=='object')return false;
        const component=input as LinkStationComponent;
        return !!component.id&&component.id.length<=40&&['forward','backward'].includes(component.direction)&&Number.isFinite(component.start)&&component.start>=0&&Number.isFinite(component.end)&&component.end>component.start&&Number.isFinite(component.taperIn)&&component.taperIn>=0&&Number.isFinite(component.taperOut)&&component.taperOut>=0&&(component.kind==='lane'?(['curb','median'].includes(component.side)&&validSource(component.source)):(component.kind==='width'&&['walk','shoulder','bike','motorcycle','buffer'].includes(component.target)&&Number.isFinite(component.delta)&&Math.abs(component.delta)>=.01&&component.delta>=-5&&component.delta<=5));
      },
      componentList=Array.isArray(l.components)?l.components:[];
    if(!l.id||l.id.length>40||typeof l.name!=='string'||l.name.length>80||l.from.junctionId===l.to.junctionId||!armForPort(project,l.from)||!armForPort(project,l.to)||!Array.isArray(l.via)||l.via.length>64||l.via.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.radius)||p.radius<0||p.radius>200)||!l.sectionProfile||!['review','linear'].includes(l.sectionProfile.mode)||!validTransition(l.sectionProfile.forwardLaneTransition)||!validTransition(l.sectionProfile.backwardLaneTransition)||!Array.isArray(l.components)||componentList.length>24||new Set(componentList.map(v=>v?.id)).size!==componentList.length||componentList.some(v=>!validComponent(v)))return'Road Link ไม่สมบูรณ์';
    for(const ref of [l.from,l.to]){
      const key=portKey(ref);if(occupied.has(key))return'มี Road Link ใช้ port ซ้ำ';occupied.add(key);
    }
  }
  for(const port of project.transferPorts){const error=transferPortIssue(project,port);if(error)return error;}
  for(const connector of project.transferConnectors){const error=transferConnectorIssue(project,connector);if(error)return error;}
  const groupedLinks=new Set<string>();
  for(const corridor of project.parallelCorridors){
    const error=parallelCorridorIssue(project,corridor);if(error)return error;
    for(const id of [...corridor.mainlineLinkIds,...corridor.frontage.flatMap(chain=>chain.linkIds)]){
      if(groupedLinks.has(id))return'Road Link อยู่ใน Parallel corridor มากกว่าหนึ่งกลุ่ม';groupedLinks.add(id);
    }
  }
  return null;
}
export function createNetworkProject():NetworkProject{
  let project:NetworkProject={schemaVersion:5,title:'Thai Street Network Concept',junctions:[],links:[],parallelCorridors:[],transferPorts:[],transferConnectors:[]};
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
  const source=raw as {schemaVersion?:number;title?:unknown;junctions?:unknown[];links?:unknown[];parallelCorridors?:unknown;transferPorts?:unknown;transferConnectors?:unknown};
  const schemaVersion=Number(source.schemaVersion);
  if(![1,2,3,4,5].includes(schemaVersion)||!Array.isArray(source.junctions)||!Array.isArray(source.links))throw Error('Unsupported network schema');
  if(schemaVersion>=4&&source.parallelCorridors!==undefined&&!Array.isArray(source.parallelCorridors))throw Error('Invalid parallel corridor list');
  if(schemaVersion===5&&source.transferPorts!==undefined&&!Array.isArray(source.transferPorts))throw Error('Invalid transfer port list');
  if(schemaVersion===5&&source.transferConnectors!==undefined&&!Array.isArray(source.transferConnectors))throw Error('Invalid transfer connector list');
  const junctions=source.junctions.map(input=>{
    if(!input||typeof input!=='object')throw Error('Invalid junction instance');
    const item=input as Record<string,unknown>,rotation=((Number(item.rotation)%360)+360)%360;
    return{
      id:String(item.id??''),
      name:String(item.name??''),
      x:Number(item.x),
      y:Number(item.y),
      rotation,
      design:migrate(item.design)
    };
  });
  const links=source.links.map(input=>{
    if(!input||typeof input!=='object')throw Error('Invalid Road Link');
    const item=input as Record<string,unknown>,from=item.from&&typeof item.from==='object'?item.from as Record<string,unknown>:null,
      to=item.to&&typeof item.to==='object'?item.to as Record<string,unknown>:null,
      profile=item.sectionProfile&&typeof item.sectionProfile==='object'?item.sectionProfile as Record<string,unknown>:null,
      mode:LinkSectionProfile['mode']=profile?.mode==='linear'?'linear':'review',
      readTransition=(value:unknown):LinkLaneTransition|undefined=>{
        if(!value||typeof value!=='object')return undefined;
        const t=value as Record<string,unknown>,side=t.side==='median'?'median':t.side==='curb'?'curb':null,center=Number(t.center),length=Number(t.length);
        return side&&Number.isFinite(center)&&Number.isFinite(length)?{side,center,length}:undefined;
      },
      via=Array.isArray(item.via)?item.via.map(point=>{
        const p=point&&typeof point==='object'?point as Record<string,unknown>:{};
        return{x:Number(p.x),y:Number(p.y),radius:schemaVersion===1?0:linkRadius(p.radius)};
      }):[],
      components:LinkStationComponent[]=schemaVersion>=3&&Array.isArray(item.components)?item.components.reduce<LinkStationComponent[]>((out,value,index)=>{
        if(!value||typeof value!=='object')return out;
        const component=value as Record<string,unknown>,id=String(component.id??`C-${index+1}`),direction:LinkDirection=component.direction==='backward'?'backward':'forward',
          start=Number(component.start),end=Number(component.end),taperIn=Number(component.taperIn),taperOut=Number(component.taperOut);
        if(component.kind==='lane'){
          const side=component.side==='median'?'median':'curb',rawSource=component.source&&typeof component.source==='object'?component.source as Record<string,unknown>:null,
            sourceValue:JunctionAuxiliarySource|undefined=rawSource?.kind==='junction-auxiliary'?{
              kind:'junction-auxiliary',handoffId:String(rawSource.handoffId??''),junctionId:String(rawSource.junctionId??''),armId:Number(rawSource.armId),
              direction:rawSource.direction==='outgoing'?'outgoing':'incoming',side:rawSource.side==='right'?'right':'left',lane:Number(rawSource.lane)
            }:undefined;
          out.push({id,kind:'lane',direction,side,start,end,taperIn,taperOut,...(sourceValue?{source:sourceValue}:{})});
        }else if(component.kind==='width'){
          const targetRaw=String(component.target??'walk'),target:LinkWidthTarget=['shoulder','bike','motorcycle','buffer'].includes(targetRaw)?targetRaw as Band['type']:'walk';
          out.push({id,kind:'width',direction,target,start,end,taperIn,taperOut,delta:Number(component.delta)});
        }
        return out;
      },[]):[];
    const forwardLaneTransition=readTransition(profile?.forwardLaneTransition),backwardLaneTransition=readTransition(profile?.backwardLaneTransition),
      sectionProfile:LinkSectionProfile={mode};
    if(forwardLaneTransition)sectionProfile.forwardLaneTransition=forwardLaneTransition;
    if(backwardLaneTransition)sectionProfile.backwardLaneTransition=backwardLaneTransition;
    return{
      id:String(item.id??''),
      name:String(item.name??''),
      from:{junctionId:String(from?.junctionId??''),armId:Number(from?.armId)},
      to:{junctionId:String(to?.junctionId??''),armId:Number(to?.armId)},
      via,
      sectionProfile,
      components
    };
  });
  const parallelCorridors:ParallelCorridor[]=schemaVersion>=4&&Array.isArray(source.parallelCorridors)?source.parallelCorridors.map(value=>{
    if(!value||typeof value!=='object')throw Error('Invalid parallel corridor');
    const item=value as Record<string,unknown>,frontageRaw=Array.isArray(item.frontage)?item.frontage:[],
      mainlineLinkIds=Array.isArray(item.mainlineLinkIds)?item.mainlineLinkIds.map(String):[],
      persistedStart=String(item.mainlineStartJunctionId??''),
      mainlineStartJunctionId=persistedStart||inferredChainStartFromLinks(links,mainlineLinkIds)||'';
    return{
      id:String(item.id??''),
      name:String(item.name??''),
      mainlineLinkIds,
      mainlineStartJunctionId,
      frontage:frontageRaw.map(raw=>{
        if(!raw||typeof raw!=='object')throw Error('Invalid parallel frontage chain');
        const chain=raw as Record<string,unknown>;
        if(chain.side!=='left'&&chain.side!=='right')throw Error('Invalid parallel frontage side');
        if(!Array.isArray(chain.linkIds))throw Error('Invalid parallel frontage link list');
        if(chain.seedReviewJunctionIds!==undefined&&!Array.isArray(chain.seedReviewJunctionIds))throw Error('Invalid parallel frontage seed review list');
        return{side:chain.side as ParallelCorridorSide,linkIds:chain.linkIds.map(String),...(chain.seedReviewJunctionIds!==undefined?{seedReviewJunctionIds:(chain.seedReviewJunctionIds as unknown[]).map(String)}:{})};
      })
    };
  }):[];
  const transferPorts:TransferPort[]=schemaVersion===5&&Array.isArray(source.transferPorts)?source.transferPorts.map(value=>{
    if(!value||typeof value!=='object')throw Error('Invalid transfer port');
    const item=value as Record<string,unknown>,direction=String(item.direction??''),side=String(item.side??''),terminal=String(item.terminal??'');
    if(!['forward','backward'].includes(direction)||!['curb','median'].includes(side)||!['merge','diverge'].includes(terminal))throw Error('Invalid transfer port semantics');
    return{id:String(item.id??''),name:String(item.name??''),hostLinkId:String(item.hostLinkId??''),station:Number(item.station),
      direction:direction as LinkDirection,side:side as 'curb'|'median',terminal:terminal as TransferTerminalKind};
  }):[];
  const transferConnectors:TransferConnector[]=schemaVersion===5&&Array.isArray(source.transferConnectors)?source.transferConnectors.map(value=>{
    if(!value||typeof value!=='object')throw Error('Invalid transfer connector');
    const item=value as Record<string,unknown>,via=Array.isArray(item.via)?item.via.map(point=>{const p=point&&typeof point==='object'?point as Record<string,unknown>:{};return{x:Number(p.x),y:Number(p.y),radius:linkRadius(p.radius)};}):[];
    return{id:String(item.id??''),name:String(item.name??''),fromTransferPortId:String(item.fromTransferPortId??''),toTransferPortId:String(item.toTransferPortId??''),via,lanes:Number(item.lanes),laneWidth:Number(item.laneWidth)};
  }):[];
  const project:NetworkProject={schemaVersion:5,title:String(source.title??'Thai Street Network Concept'),junctions,links,parallelCorridors,transferPorts,transferConnectors};
  const error=validateNetworkProject(project);if(error)throw Error(error);
  return project;
}
export function restoreNetworkProject(raw:string|null):NetworkProject{
  if(!raw)return createNetworkProject();
  try{return normalizeNetworkProject(JSON.parse(raw));}
  catch{return createNetworkProject();}
}
